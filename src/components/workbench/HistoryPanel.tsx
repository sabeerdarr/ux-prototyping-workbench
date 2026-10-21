"use client";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { ArrowLeftRight, Eye, History, Redo2, RotateCcw, Sparkles, Undo2, Wand2 } from "lucide-react";
import type { Version } from "@/lib/schema";
import { diffSpecs } from "@/lib/spec-ops";
import { ApiError, streamRequest } from "@/lib/client/api";
import { PrototypeRenderer, type RevealRequest } from "@/prototype/renderer";
import { Button, Modal, Pill, Select, Spinner } from "../ui";
import type { Workbench } from "./use-workbench";

const KIND_ICON = { generation: Sparkles, refinement: Wand2, restore: RotateCcw, annotations: History };

function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

export function HistoryPanel({ wb, onCompare }: { wb: Workbench; onCompare: (fromId: string) => void }) {
  const p = wb.project;
  if (!p || !p.versions.length) {
    return <p className="p-4 text-[12.5px] leading-relaxed text-wb-ink-3">Every generation and refinement is saved here as a version. You can preview, compare, restore, undo and redo.</p>;
  }
  const failed = p.refinementLog.filter((r) => !r.ok).length;
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-1.5">
        <Button size="xs" variant="secondary" icon={<Undo2 size={12} />} disabled={!p.undoStack.length || Boolean(wb.job)} onClick={wb.undo}>
          Undo
        </Button>
        <Button size="xs" variant="secondary" icon={<Redo2 size={12} />} disabled={!p.redoStack.length || Boolean(wb.job)} onClick={wb.redo}>
          Redo
        </Button>
        <span className="ml-auto text-[11px] text-wb-ink-3">
          {p.versions.length} version{p.versions.length === 1 ? "" : "s"}
          {failed ? ` · ${failed} failed attempt${failed === 1 ? "" : "s"}` : ""}
        </span>
      </div>
      <ol className="flex flex-col gap-1.5">
        {[...p.versions].reverse().map((v) => {
          const Icon = KIND_ICON[v.kind];
          const isCurrent = v.id === p.currentVersionId;
          const isViewing = v.id === wb.viewVersion?.id;
          return (
            <li
              key={v.id}
              className={clsx(
                "rounded-lg border bg-white px-2.5 py-2",
                isCurrent ? "border-wb-accent/50" : isViewing ? "border-amber-300" : "border-wb-line",
              )}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded bg-black/[0.05] text-wb-ink-2">
                  <Icon size={12} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[12.5px] font-semibold">v{v.number}</span>
                    {isCurrent && <Pill tone="accent">Current</Pill>}
                    {isViewing && !isCurrent && <Pill tone="amber">Previewing</Pill>}
                    {p.approvedVersionId === v.id && <Pill tone="green">Approved</Pill>}
                  </div>
                  <div className="text-[12px] leading-snug text-wb-ink-2">{v.label}</div>
                  {v.refinement && (
                    <div className="mt-0.5 line-clamp-2 text-[11px] text-wb-ink-3" title={v.refinement.instruction}>
                      “{v.refinement.instruction || v.refinement.quickAction}”
                    </div>
                  )}
                  <div className="mt-0.5 text-[10.5px] text-wb-ink-3">
                    {timeAgo(v.createdAt)} · {v.provider.label}
                  </div>
                </div>
              </div>
              {!isCurrent && (
                <div className="mt-1.5 flex flex-wrap gap-1 pl-7">
                  <Button size="xs" variant="ghost" icon={<Eye size={12} />} onClick={() => wb.preview(isViewing ? null : v.id)}>
                    {isViewing ? "Stop preview" : "Preview"}
                  </Button>
                  <Button size="xs" variant="ghost" icon={<ArrowLeftRight size={12} />} onClick={() => onCompare(v.id)}>
                    Compare
                  </Button>
                  <Button size="xs" variant="ghost" icon={<RotateCcw size={12} />} disabled={Boolean(wb.job)} onClick={() => wb.restore(v.id)}>
                    Restore
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

interface AiComparison {
  summary: string;
  changes: { componentId: string; description: string; uxImpact: string }[];
  risks: string[];
}

export function CompareModal({ wb, fromId, onClose }: { wb: Workbench; fromId: string | null; onClose: () => void }) {
  const p = wb.project;
  const [from, setFrom] = useState(fromId);
  const [to, setTo] = useState(p?.currentVersionId ?? null);
  const [reveal, setReveal] = useState<RevealRequest | null>(null);
  const [ai, setAi] = useState<{ key: string; data: AiComparison; isAI: boolean } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const a = p?.versions.find((v) => v.id === from) ?? null;
  const b = p?.versions.find((v) => v.id === to) ?? null;
  const diff = useMemo(() => (a && b ? diffSpecs(a.spec, b.spec) : null), [a, b]);
  if (!p || fromId === null) return null;

  const leftIds = diff?.components.filter((c) => c.change !== "added").map((c) => c.id) ?? [];
  const rightIds = diff?.components.filter((c) => c.change !== "removed").map((c) => c.id) ?? [];
  const key = `${from}|${to}`;

  const explain = async () => {
    if (!a || !b) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await streamRequest<{ ai: AiComparison; provider: { isAI: boolean } }>(
        "/api/compare",
        { brief: p.brief, from: { label: `v${a.number}`, spec: a.spec }, to: { label: `v${b.number}`, spec: b.spec } },
        () => {},
      );
      setAi({ key, data: res.ai, isAI: res.provider.isAI });
    } catch (err) {
      setAiError(err instanceof ApiError ? err.message : "Comparison failed.");
    } finally {
      setAiBusy(false);
    }
  };

  const side = (v: Version | null, ids: string[], label: string) => (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold">
        {label}
        {v && <span className="truncate font-normal text-wb-ink-2">v{v.number} · {v.label}</span>}
      </div>
      <div className="wb-device wb-scroll h-[560px] overflow-auto rounded-lg border border-wb-line bg-white">
        {v && <PrototypeRenderer spec={v.spec} reveal={reveal} inspect={{ enabled: false, selectedId: reveal?.id ?? null, changedIds: ids, onSelect: () => {} }} />}
      </div>
    </div>
  );

  return (
    <Modal open onClose={onClose} title="Compare versions" wide>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="w-56">
            <span className="mb-1 block text-[11.5px] font-semibold">Earlier</span>
            <Select value={from ?? ""} onChange={(e) => setFrom(e.target.value)}>
              {p.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.number} · {v.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="w-56">
            <span className="mb-1 block text-[11.5px] font-semibold">Later</span>
            <Select value={to ?? ""} onChange={(e) => setTo(e.target.value)}>
              {p.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.number} · {v.label}
                  {v.id === p.currentVersionId ? " (current)" : ""}
                </option>
              ))}
            </Select>
          </label>
          <div className="ml-auto flex gap-2">
            {a && (
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCcw size={13} />}
                onClick={() => {
                  wb.restore(a.id);
                  onClose();
                }}
              >
                Restore v{a.number}
              </Button>
            )}
          </div>
        </div>
        <div className="flex gap-4">
          <div className="flex min-w-0 flex-[3] gap-3">
            {side(a, leftIds, "Earlier")}
            {side(b, rightIds, "Later")}
          </div>
          <aside className="wb-scroll h-[588px] w-[300px] flex-none overflow-y-auto">
            <h3 className="mb-1 text-[12.5px] font-semibold">
              {diff?.components.length ?? 0} component change{diff?.components.length === 1 ? "" : "s"}
            </h3>
            <p className="mb-2 text-[11.5px] text-wb-ink-3">
              Changed components are outlined in orange. {diff?.annotations.added.length || diff?.annotations.modified.length ? `${diff.annotations.added.length + diff.annotations.modified.length} annotation(s) added or updated.` : ""}
              {diff?.themeChanged ? " Theme changed." : ""}
            </p>
            <ul className="space-y-1">
              {diff?.components.map((c) => (
                <li key={c.id}>
                  <button type="button" className="w-full rounded-md border border-wb-line bg-white px-2 py-1.5 text-left hover:border-wb-line-strong" onClick={() => setReveal({ id: c.id, nonce: Date.now() })}>
                    <div className="flex items-center gap-1.5">
                      <Pill tone={c.change === "added" ? "green" : c.change === "removed" ? "red" : "changed"}>{c.change}</Pill>
                      <span className="truncate text-[12px] font-semibold">{c.name}</span>
                    </div>
                    {c.fields.length > 0 && <div className="mt-0.5 font-mono text-[10.5px] text-wb-ink-3">{c.fields.join(", ")}</div>}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-wb-line pt-3">
              {ai?.key === key ? (
                <div className="space-y-2 text-[12px] leading-snug text-wb-ink-2">
                  {!ai.isAI && <Pill tone="amber">Rule-based, not AI</Pill>}
                  <p className="font-semibold text-wb-ink">{ai.data.summary}</p>
                  {ai.data.changes.map((c, i) => (
                    <div key={i}>
                      <span className="font-semibold text-wb-ink">{c.componentId}:</span> {c.description} <span className="text-wb-ink-3">{c.uxImpact}</span>
                    </div>
                  ))}
                  {ai.data.risks.length > 0 && (
                    <div>
                      <span className="font-semibold text-wb-ink">Risks:</span>
                      <ul className="list-disc pl-4">{ai.data.risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
                    </div>
                  )}
                </div>
              ) : (
                <Button size="sm" variant="secondary" disabled={aiBusy || !diff?.components.length} onClick={explain} icon={aiBusy ? <Spinner /> : <Sparkles size={13} />}>
                  {wb.provider?.active.isAI ? "Explain the differences" : "Summarize the differences"}
                </Button>
              )}
              {aiError && <p className="mt-2 text-[11.5px] text-red-700">{aiError}</p>}
            </div>
          </aside>
        </div>
      </div>
    </Modal>
  );
}
