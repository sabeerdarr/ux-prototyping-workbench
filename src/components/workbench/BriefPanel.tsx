"use client";
import { useId, useState } from "react";
import { ChevronRight, Sparkles, RotateCcw } from "lucide-react";
import { clsx } from "clsx";
import type { BriefInput, Platform } from "@/lib/schema";
import { Button, Input, Label, Select, Spinner, Textarea } from "../ui";
import type { Workbench } from "./use-workbench";

const DESCRIPTION_PLACEHOLDER =
  "Create a grant application dashboard for a nonprofit organization. Users should be able to track applications, review deadlines, discover funding opportunities, and continue incomplete applications.";
const TONE_PLACEHOLDER =
  "Professional but approachable. Clear, empathetic, confident, and jargon-free. Avoid corporate language. Use encouraging microcopy without sounding overly enthusiastic.";

const EMPTY: BriefInput = { description: "", tone: "" };

export function BriefPanel({ wb, initialBrief }: { wb: Workbench; initialBrief?: BriefInput }) {
  const ids = { d: useId(), t: useId(), st: useId(), tu: useId(), g: useId(), p: useId(), v: useId() };
  const [brief, setBrief] = useState<BriefInput>(initialBrief ?? wb.project?.brief ?? EMPTY);
  const [advanced, setAdvanced] = useState(false);
  const [touched, setTouched] = useState(false);

  const set = (k: keyof BriefInput, v: string) => setBrief((b) => ({ ...b, [k]: v || undefined, ...(k === "description" || k === "tone" ? { [k]: v } : {}) }));
  const descErr = brief.description.trim().length < 10;
  const toneErr = brief.tone.trim().length < 3;
  const busy = wb.job?.kind === "generate";
  const hasVersions = Boolean(wb.project?.versions.length);
  const advancedCount = (["screenType", "targetUsers", "primaryGoal", "platform", "visualStyle"] as const).filter((k) => brief[k]).length;

  const submit = () => {
    setTouched(true);
    if (descErr || toneErr || wb.job) return;
    void wb.generate({ ...brief, description: brief.description.trim(), tone: brief.tone.trim() });
  };

  return (
    <form
      className="flex flex-col gap-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <Label htmlFor={ids.d} required hint={`${brief.description.length}/8000`}>
          Screen description
        </Label>
        <Textarea
          id={ids.d}
          rows={6}
          maxLength={8000}
          placeholder={DESCRIPTION_PLACEHOLDER}
          value={brief.description}
          aria-invalid={touched && descErr}
          aria-describedby={touched && descErr ? `${ids.d}-err` : undefined}
          onChange={(e) => set("description", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        {touched && descErr && (
          <p id={`${ids.d}-err`} className="mt-1 text-[11.5px] text-red-700">
            Describe the screen in at least a sentence: who it&apos;s for and what they need to do.
          </p>
        )}
      </div>
      <div>
        <Label htmlFor={ids.t} required>
          Tone of voice
        </Label>
        <Textarea
          id={ids.t}
          rows={3}
          maxLength={2000}
          placeholder={TONE_PLACEHOLDER}
          value={brief.tone}
          aria-invalid={touched && toneErr}
          aria-describedby={touched && toneErr ? `${ids.t}-err` : undefined}
          onChange={(e) => set("tone", e.target.value)}
        />
        {touched && toneErr && (
          <p id={`${ids.t}-err`} className="mt-1 text-[11.5px] text-red-700">
            Add a few words about the voice, e.g. “calm, plain, reassuring”.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-wb-line">
        <button
          type="button"
          className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[12px] font-semibold text-wb-ink-2 hover:text-wb-ink"
          aria-expanded={advanced}
          onClick={() => setAdvanced(!advanced)}
        >
          <ChevronRight size={14} className={clsx("transition-transform", advanced && "rotate-90")} aria-hidden="true" />
          Advanced settings
          <span className="ml-auto font-normal text-wb-ink-3">{advancedCount ? `${advancedCount} set` : "Optional"}</span>
        </button>
        {advanced && (
          <div className="flex flex-col gap-3 border-t border-wb-line p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor={ids.st}>Screen type</Label>
                <Input id={ids.st} placeholder="e.g. Dashboard" value={brief.screenType ?? ""} onChange={(e) => set("screenType", e.target.value)} />
              </div>
              <div>
                <Label htmlFor={ids.p}>Platform</Label>
                <Select id={ids.p} value={brief.platform ?? ""} onChange={(e) => setBrief((b) => ({ ...b, platform: (e.target.value || undefined) as Platform | undefined }))}>
                  <option value="">Let AI decide</option>
                  <option value="desktop">Desktop</option>
                  <option value="tablet">Tablet</option>
                  <option value="mobile">Mobile</option>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor={ids.tu}>Target users</Label>
              <Input id={ids.tu} placeholder="e.g. Grant writers at small nonprofits" value={brief.targetUsers ?? ""} onChange={(e) => set("targetUsers", e.target.value)} />
            </div>
            <div>
              <Label htmlFor={ids.g}>Primary user goal</Label>
              <Input id={ids.g} placeholder="e.g. Finish an application before its deadline" value={brief.primaryGoal ?? ""} onChange={(e) => set("primaryGoal", e.target.value)} />
            </div>
            <div>
              <Label htmlFor={ids.v}>Visual style or brand guidelines</Label>
              <Textarea id={ids.v} rows={2} placeholder="e.g. Warm, trustworthy; primary green #1f6f5c; rounded corners" value={brief.visualStyle ?? ""} onChange={(e) => set("visualStyle", e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Button type="submit" variant="primary" size="md" disabled={Boolean(wb.job)} aria-busy={busy} icon={busy ? <Spinner /> : <Sparkles size={15} aria-hidden="true" />}>
          {busy ? "Generating…" : hasVersions ? "Regenerate prototype" : "Generate prototype"}
        </Button>
        {hasVersions && !busy && (
          <p className="text-[11.5px] leading-snug text-wb-ink-3">Regenerating builds a new screen from the brief and adds it as a new version. Earlier versions stay in History.</p>
        )}
        {wb.project && JSON.stringify(brief) !== JSON.stringify(wb.project.brief) && !busy && (
          <Button variant="ghost" size="xs" icon={<RotateCcw size={12} />} onClick={() => setBrief(wb.project!.brief)} className="self-start">
            Revert brief edits
          </Button>
        )}
      </div>
    </form>
  );
}
