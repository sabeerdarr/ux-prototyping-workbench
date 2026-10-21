"use client";
import { ShieldCheck, Wand2 } from "lucide-react";
import type { ReviewFinding } from "@/lib/schema";
import { Button, Pill, Spinner } from "../ui";
import type { Workbench } from "./use-workbench";

const SEVERITY_TONE = { high: "red", medium: "amber", low: "neutral" } as const;

function Finding({ f, wb, names }: { f: ReviewFinding; wb: Workbench; names: Map<string, string> }) {
  const canFix = Boolean(f.componentId && names.has(f.componentId)) && !wb.isPreviewing && !wb.job;
  return (
    <li className="rounded-lg border border-wb-line bg-white p-2.5">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <Pill tone={SEVERITY_TONE[f.severity]}>{f.severity}</Pill>
        <Pill>{f.category}</Pill>
        {f.componentId && names.has(f.componentId) && (
          <button type="button" className="truncate text-[11px] font-medium text-wb-accent hover:underline" onClick={() => wb.select(f.componentId!, { reveal: true })}>
            {names.get(f.componentId)}
          </button>
        )}
      </div>
      <p className="text-[12px] leading-snug font-semibold text-wb-ink">{f.issue}</p>
      <p className="mt-0.5 text-[12px] leading-snug text-wb-ink-2">{f.recommendation}</p>
      {f.reference && <p className="mt-0.5 text-[10.5px] text-wb-ink-3">{f.reference}</p>}
      {canFix && wb.provider?.active.isAI && (
        <Button
          size="xs"
          variant="ghost"
          className="mt-1.5 -ml-1"
          icon={<Wand2 size={12} />}
          onClick={() => {
            wb.select(f.componentId!, { reveal: true });
            void wb.refine({
              targetIds: [f.componentId!],
              instruction: `${f.issue} ${f.recommendation}`,
              quickAction: f.category === "accessibility" ? "accessibility" : f.category === "content" ? "microcopy" : "interaction",
            });
          }}
        >
          Apply as refinement
        </Button>
      )}
    </li>
  );
}

export function ReviewPanel({ wb }: { wb: Workbench }) {
  const v = wb.viewVersion;
  if (!v) return <p className="p-4 text-[12.5px] text-wb-ink-3">Generate a prototype to review its accessibility and interactions.</p>;
  const names = new Map(v.spec.components.map((c) => [c.id, c.name]));
  const r = wb.review?.versionId === v.id ? wb.review : null;
  const busy = wb.job?.kind === "review";
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="rounded-lg border border-wb-line bg-white p-3">
        <div className="flex items-center gap-1.5 text-[12.5px] font-semibold">
          <ShieldCheck size={14} className="text-emerald-600" aria-hidden="true" /> Accessibility &amp; interaction review
        </div>
        <p className="mt-1 text-[12px] leading-snug text-wb-ink-2">
          Runs automated rule checks{wb.provider?.active.isAI ? " plus an AI review" : ""} against v{v.number}. Findings can be applied as targeted refinements.
        </p>
        <Button className="mt-2" size="sm" variant="secondary" disabled={Boolean(wb.job)} onClick={wb.runReview} icon={busy ? <Spinner /> : undefined}>
          {busy ? "Reviewing…" : r ? "Run again" : "Run review"}
        </Button>
      </div>
      {r && (
        <>
          {r.ai && (
            <section>
              <h3 className="mb-1 text-[12.5px] font-semibold">AI review</h3>
              <p className="mb-2 text-[12px] leading-snug text-wb-ink-2">{r.ai.summary}</p>
              <ul className="space-y-1.5">{r.ai.findings.map((f) => <Finding key={f.id} f={f} wb={wb} names={names} />)}</ul>
            </section>
          )}
          <section>
            <h3 className="mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold">
              Automated rule checks <Pill>Not AI</Pill>
            </h3>
            {r.rules.length ? (
              <ul className="space-y-1.5">{r.rules.map((f) => <Finding key={f.id} f={f} wb={wb} names={names} />)}</ul>
            ) : (
              <p className="text-[12px] text-wb-ink-3">No rule violations found. Automated checks can&apos;t catch everything, so test with real users and assistive technology too.</p>
            )}
          </section>
          {!r.ai && <p className="text-[11.5px] leading-snug text-wb-ink-3">AI review needs an Anthropic API key. Add ANTHROPIC_API_KEY to .env.local and restart the server.</p>}
        </>
      )}
    </div>
  );
}
