"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { ArrowUpLeft, CornerDownLeft, Info, Lightbulb, RefreshCw, Sparkles, TriangleAlert, Wand2, X } from "lucide-react";
import type { Annotation, AnnotationKind, Component, QuickAction, Version } from "@/lib/schema";
import { QUICK_ACTIONS } from "@/lib/schema";
import { findParentId } from "@/lib/spec-ops";
import { Button, IconButton, Pill, Segmented, Spinner, Textarea } from "../ui";
import type { Workbench } from "./use-workbench";

const KIND: Record<AnnotationKind, { label: string; tone: "accent" | "amber" | "violet" }> = {
  decision: { label: "Decision", tone: "accent" },
  assumption: { label: "Assumption", tone: "amber" },
  validate: { label: "Needs validation", tone: "violet" },
};

const QUICK: Record<QuickAction, { label: string; hint: string }> = {
  layout: { label: "Layout", hint: "Improve grouping, order and spacing" },
  hierarchy: { label: "Visual hierarchy", hint: "Make what matters stand out" },
  microcopy: { label: "Microcopy", hint: "Clearer, more specific wording" },
  tone: { label: "Tone of voice", hint: "Match the brief's tone more closely" },
  interaction: { label: "Interaction", hint: "Feedback, confirmation, recovery" },
  accessibility: { label: "Accessibility", hint: "Labels, guidance, not color alone" },
};

function examplesFor(c: Component): string[] {
  switch (c.type) {
    case "button":
    case "menu":
      return ["Make this CTA more prominent", "Make the label more specific about what happens next"];
    case "alert":
      return ["Rewrite this error message in a friendlier tone", "Explain how to recover and whether data is kept"];
    case "empty-state":
      return ["Make the empty state more useful", "Add a secondary action for people who are unsure"];
    case "card":
    case "stat":
    case "section":
      return ["Reduce the visual weight of this card", "Reorder the content so the most urgent item is first"];
    case "table":
    case "list":
      return ["Add a confirmation dialog before deleting an application", "Add a useful empty state"];
    case "form":
      return ["Make this form easier for first-time users", "Rewrite the error message in a friendlier tone"];
    default:
      return ["Make this easier to scan", "Rewrite the copy in a friendlier tone"];
  }
}

function AnnotationCard({
  a,
  elementName,
  active,
  updated,
  onSelect,
  expanded,
}: {
  a: Annotation;
  elementName: string;
  active: boolean;
  updated: boolean;
  onSelect: () => void;
  expanded: boolean;
}) {
  const k = KIND[a.kind];
  return (
    <article
      data-annotation-for={a.elementId}
      className={clsx(
        "rounded-lg border bg-white transition-colors",
        active ? "border-wb-accent/60 shadow-[0_0_0_3px_rgb(59_91_253/0.1)]" : "border-wb-line hover:border-wb-line-strong",
      )}
    >
      <button type="button" onClick={onSelect} className="block w-full px-3 pt-2.5 pb-2 text-left" aria-label={`Show ${elementName} in the prototype: ${a.decision}`}>
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <Pill tone={k.tone}>{k.label}</Pill>
          <span className="truncate text-[11px] font-medium text-wb-ink-3">{elementName}</span>
          {updated && <Pill tone="changed">Updated</Pill>}
        </div>
        <div className="text-[12.5px] leading-snug font-semibold text-wb-ink">{a.decision}</div>
        {!expanded && <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-wb-ink-2">{a.rationale}</div>}
      </button>
      {expanded && (
        <dl className="space-y-2 px-3 pb-3 text-[12px] leading-snug">
          <div>
            <dt className="text-[10.5px] font-semibold tracking-wide text-wb-ink-3 uppercase">Why</dt>
            <dd className="text-wb-ink-2">{a.rationale}</dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-semibold tracking-wide text-wb-ink-3 uppercase">UX principle / user need</dt>
            <dd className="text-wb-ink-2">{a.uxPrinciple}</dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-semibold tracking-wide text-wb-ink-3 uppercase">Tone</dt>
            <dd className="text-wb-ink-2">{a.toneAlignment}</dd>
          </div>
          {a.tradeoffs.length > 0 && (
            <div>
              <dt className="text-[10.5px] font-semibold tracking-wide text-wb-ink-3 uppercase">Trade-offs</dt>
              <dd>
                <ul className="list-disc pl-4 text-wb-ink-2">{a.tradeoffs.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </dd>
            </div>
          )}
          {a.assumptions.length > 0 && (
            <div>
              <dt className="text-[10.5px] font-semibold tracking-wide text-wb-ink-3 uppercase">Assumptions</dt>
              <dd>
                <ul className="list-disc pl-4 text-wb-ink-2">{a.assumptions.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </dd>
            </div>
          )}
        </dl>
      )}
    </article>
  );
}

function RefineBox({ wb, component }: { wb: Workbench; component: Component }) {
  const [instruction, setInstruction] = useState("");
  const [quick, setQuick] = useState<QuickAction | null>(null);
  const id = useId();
  const busy = wb.job?.kind === "refine";
  const disabled = Boolean(wb.job) || wb.isPreviewing;
  const isDemo = wb.provider?.active.id === "demo";
  const canSubmit = !disabled && (instruction.trim().length > 0 || quick);
  const submit = () => {
    if (!canSubmit) return;
    void wb.refine({ instruction: instruction.trim(), quickAction: quick ?? undefined });
  };
  return (
    <div className="rounded-lg border border-wb-line bg-[#fbfbfa] p-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
        <Wand2 size={13} className="text-wb-accent" aria-hidden="true" /> Refine this component
      </div>
      <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Quick refinement focus">
        {QUICK_ACTIONS.map((q) => (
          <button
            key={q}
            type="button"
            title={QUICK[q].hint}
            aria-pressed={quick === q}
            disabled={disabled}
            onClick={() => setQuick(quick === q ? null : q)}
            className={clsx(
              "rounded-full border px-2 py-0.5 text-[11.5px] font-medium transition-colors disabled:opacity-50",
              quick === q ? "border-wb-accent bg-wb-accent-soft text-wb-accent" : "border-wb-line-strong bg-white text-wb-ink-2 hover:text-wb-ink",
            )}
          >
            {QUICK[q].label}
          </button>
        ))}
      </div>
      <label htmlFor={id} className="sr-only">
        Refinement instruction
      </label>
      <Textarea
        id={id}
        rows={3}
        disabled={disabled}
        placeholder={quick ? `Optional: add detail for “${QUICK[quick].label}”…` : `e.g. ${examplesFor(component)[0]}`}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
      />
      <div className="mt-1.5 flex flex-wrap gap-1">
        {examplesFor(component).map((ex) => (
          <button key={ex} type="button" disabled={disabled} onClick={() => setInstruction(ex)} className="rounded bg-black/[0.04] px-1.5 py-0.5 text-[11px] text-wb-ink-2 hover:bg-black/[0.07] disabled:opacity-50">
            {ex}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] leading-tight text-wb-ink-3">
          {wb.isPreviewing ? "Return to the current version to refine." : "Only this component and anything that depends on it will change."}
        </span>
        <Button variant="accent" size="sm" disabled={!canSubmit} onClick={submit} icon={busy ? <Spinner /> : <CornerDownLeft size={13} aria-hidden="true" />}>
          {busy ? "Refining…" : "Apply"}
        </Button>
      </div>
      {isDemo && (
        <p className="mt-2 text-[11px] leading-snug text-amber-800">
          Demo mode: only scripted edits work (Visual hierarchy on anything; Microcopy or Tone on the deadline alert, primary CTA, and archive empty state). They are rule-based, not AI.
        </p>
      )}
    </div>
  );
}

function WhatChanged({ wb, v, names }: { wb: Workbench; v: Version; names: Map<string, string> }) {
  const r = v.refinement;
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (dismissed === v.id) return null;
  if (v.kind === "restore") {
    return (
      <div className="rounded-lg border border-wb-line bg-white p-3 text-[12px] text-wb-ink-2">
        <strong className="text-wb-ink">v{v.number}</strong> restores v{v.restoredFrom}: its screen, interactions and annotations.
      </div>
    );
  }
  if (!r) return null;
  return (
    <div className="rounded-lg border border-[#f3d9a8] bg-wb-changed-soft p-3" aria-live="polite">
      <div className="flex items-start gap-2">
        <Sparkles size={14} className="mt-0.5 flex-none text-[#b86e00]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold tracking-wide text-[#9a5b00] uppercase">What changed in v{v.number}</div>
          <p className="mt-0.5 text-[12.5px] leading-snug font-semibold text-wb-ink">{r.summary}</p>
        </div>
        <IconButton label="Dismiss summary" className="h-6 w-6" onClick={() => setDismissed(v.id)}>
          <X size={13} />
        </IconButton>
      </div>
      <div className="mt-2 space-y-2 text-[12px] leading-snug text-wb-ink-2">
        <p>
          <span className="font-semibold text-wb-ink">Request:</span> {r.instruction || QUICK[r.quickAction ?? "hierarchy"].label}
        </p>
        {r.changes.length > 0 && (
          <ul className="space-y-1">
            {r.changes.map((c, i) => (
              <li key={i}>
                <button type="button" className="text-left hover:underline" onClick={() => wb.select(c.componentId, { reveal: true })}>
                  <span className="font-semibold text-wb-ink">{names.get(c.componentId) ?? c.componentId}:</span> {c.description}
                </button>
              </li>
            ))}
          </ul>
        )}
        {r.affectedIds.length > r.targetIds.length && (
          <p>
            <span className="font-semibold text-wb-ink">Why other elements changed:</span> {r.scopeExplanation}
          </p>
        )}
        <p>
          <span className="font-semibold text-wb-ink">Expected UX impact:</span> {r.uxImpact}
        </p>
        {r.tradeoffs.length > 0 && (
          <div>
            <span className="font-semibold text-wb-ink">Trade-offs:</span>
            <ul className="list-disc pl-4">{r.tradeoffs.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        )}
        {r.newAssumptions.length > 0 && (
          <div>
            <span className="font-semibold text-wb-ink">New assumptions:</span>
            <ul className="list-disc pl-4">{r.newAssumptions.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </div>
        )}
        {r.warnings.length > 0 && (
          <details className="text-[11.5px]">
            <summary className="cursor-pointer font-semibold text-[#9a5b00]">{r.warnings.length} adjustment(s) made to keep the change scoped</summary>
            <ul className="mt-1 list-disc pl-4">{r.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </details>
        )}
        <div className="flex gap-1.5 pt-1">
          <Button size="xs" variant="secondary" onClick={wb.undo}>
            Undo this change
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Inspector({ wb }: { wb: Workbench }) {
  const v = wb.viewVersion;
  const [filter, setFilter] = useState<"all" | AnnotationKind>("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const spec = v?.spec;
  const names = useMemo(() => new Map(spec?.components.map((c) => [c.id, c.name]) ?? []), [spec]);
  const selected = spec?.components.find((c) => c.id === wb.selectedId) ?? null;

  // New selection or a new version: bring the selection / "what changed" summary into view.
  const versionId = v?.id;
  useEffect(() => {
    if (wb.selectedId || versionId) scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [wb.selectedId, versionId]);

  if (!v || !spec) {
    return (
      <div className="p-4 text-[12.5px] leading-relaxed text-wb-ink-3">
        <div className="mb-2 text-[13px] font-semibold text-wb-ink">Design rationale</div>
        Annotations explaining each design decision appear here after you generate. Select an annotation to find its element, or select an element to read its reasoning.
      </div>
    );
  }

  const counts = {
    decision: spec.annotations.filter((a) => a.kind === "decision").length,
    assumption: spec.annotations.filter((a) => a.kind === "assumption").length,
    validate: spec.annotations.filter((a) => a.kind === "validate").length,
  };
  const list = spec.annotations.filter((a) => filter === "all" || a.kind === filter);
  const selectedAnns = selected ? spec.annotations.filter((a) => a.elementId === selected.id) : [];
  const parentId = selected ? findParentId(spec, selected.id) : null;
  const isChanged = selected ? wb.changedIds.includes(selected.id) : false;

  return (
    <div ref={scrollRef} className="wb-scroll flex h-full flex-col gap-3 overflow-y-auto p-3">
      <WhatChanged wb={wb} v={v} names={names} />

      {selected ? (
        <section aria-label="Selected component" className="rounded-xl border border-wb-accent/40 bg-white p-3 shadow-[0_0_0_3px_rgb(59_91_253/0.06)]">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 className="text-[13.5px] font-semibold">{selected.name}</h2>
                <Pill tone="accent">Selected</Pill>
                {isChanged && <Pill tone="changed">Changed in v{v.number}</Pill>}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-wb-ink-3">
                {selected.type} · #{selected.id}
              </div>
            </div>
            {parentId && (
              <IconButton label={`Select parent: ${names.get(parentId)}`} onClick={() => wb.select(parentId, { reveal: true })}>
                <ArrowUpLeft size={15} />
              </IconButton>
            )}
            <IconButton label="Clear selection" onClick={() => wb.select(null)}>
              <X size={15} />
            </IconButton>
          </div>
          <div className="mt-2.5 space-y-2">
            {selectedAnns.length ? (
              selectedAnns.map((a) => (
                <AnnotationCard key={a.id} a={a} elementName={selected.name} active updated={wb.changedAnnotations.has(a.id)} expanded onSelect={() => wb.select(selected.id, { reveal: true })} />
              ))
            ) : (
              <p className="flex gap-1.5 rounded-md bg-black/[0.03] px-2.5 py-2 text-[11.5px] leading-snug text-wb-ink-3">
                <Info size={13} className="mt-px flex-none" aria-hidden="true" />
                No annotation for this element. It follows the screen&apos;s general patterns. Refining it will add one.
              </p>
            )}
          </div>
          <div className="mt-3">
            <RefineBox key={`${selected.id}:${v.id}`} wb={wb} component={selected} />
          </div>
        </section>
      ) : (
        <div className="flex gap-2 rounded-lg border border-dashed border-wb-line-strong px-3 py-2.5 text-[12px] leading-snug text-wb-ink-2">
          <Lightbulb size={14} className="mt-0.5 flex-none text-wb-accent" aria-hidden="true" />
          <span>
            Select an annotation below, or switch the canvas to <strong className="font-semibold">Inspect</strong> and click any element, to see its reasoning and refine it.
          </span>
        </div>
      )}

      <section aria-label="Annotations">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold">
            Annotations <span className="font-normal text-wb-ink-3">{spec.annotations.length}</span>
          </h2>
          {wb.provider?.active.isAI && (
            <Button size="xs" variant="ghost" disabled={Boolean(wb.job) || wb.isPreviewing} onClick={wb.refreshAnnotations} icon={wb.job?.kind === "annotate" ? <Spinner /> : <RefreshCw size={12} aria-hidden="true" />} title="Ask the AI to re-document the current screen">
              Refresh
            </Button>
          )}
        </div>
        <div className="mb-2">
          <Segmented
            size="xs"
            label="Filter annotations"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "decision", label: `Decisions ${counts.decision}` },
              { value: "assumption", label: `Assumptions ${counts.assumption}` },
              { value: "validate", label: `To validate ${counts.validate}` },
            ]}
          />
        </div>
        <div className="space-y-2">
          {list.map((a) => (
            <AnnotationCard
              key={a.id}
              a={a}
              elementName={names.get(a.elementId) ?? a.elementId}
              active={a.elementId === wb.selectedId}
              updated={wb.changedAnnotations.has(a.id)}
              expanded={false}
              onSelect={() => wb.select(a.elementId, { reveal: true })}
            />
          ))}
          {list.length === 0 && <p className="text-[12px] text-wb-ink-3">No annotations of this kind.</p>}
        </div>
      </section>

      <section aria-label="Key assumptions" className="rounded-lg border border-wb-line bg-white p-3">
        <h2 className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold">
          <TriangleAlert size={13} className="text-amber-600" aria-hidden="true" /> Key assumptions
        </h2>
        {spec.assumptions.length ? (
          <ul className="list-disc space-y-1 pl-4 text-[12px] leading-snug text-wb-ink-2">
            {spec.assumptions.map((a) => (
              <li key={a.id}>{a.text}</li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-wb-ink-3">None recorded.</p>
        )}
        <h3 className="mt-3 mb-1 text-[12px] font-semibold">Tone interpretation</h3>
        <p className="text-[12px] leading-snug text-wb-ink-2">{spec.toneSummary}</p>
        {v.warnings?.length ? (
          <details className="mt-3 text-[11.5px] text-wb-ink-3">
            <summary className="cursor-pointer font-semibold">Validation notes ({v.warnings.length})</summary>
            <ul className="mt-1 list-disc pl-4">{v.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </details>
        ) : null}
      </section>
    </div>
  );
}
