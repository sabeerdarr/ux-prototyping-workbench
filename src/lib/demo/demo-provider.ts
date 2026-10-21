/**
 * Demo provider: used when no API key is configured. It never pretends to be
 * AI. Generation loads the prebuilt example; refinements are a small set of
 * scripted, rule-based edits that are labeled as such in the UI.
 */
import type { Annotation, BriefInput, Component, ProviderInfo, RefinementPatch, ScreenSpec } from "../schema";
import { diffSpecs } from "../spec-ops";
import { ruleReview } from "../rule-review";
import { ProviderError, type DesignProvider, type ProgressFn, type RefineArgs } from "../ai/types";
import { DEMO_SPEC } from "./demo-spec";

type Script = (c: Component) => { component: Component; summary: string; annotation: Omit<Annotation, "id" | "elementId"> } | null;

const COPY_SCRIPTS: Record<string, Script> = {
  "deadline-alert": (c) => {
    if (c.type !== "alert") return null;
    return {
      component: {
        ...c,
        props: {
          ...c.props,
          title: "3 days left for Riverside Community Fund",
          body: "You've done most of the work. Two pieces remain: the budget narrative (about 20 minutes) and two letters of support. We'll keep your progress saved as you go.",
          actionLabel: "Finish the budget narrative",
        },
      },
      summary: "Rewrote the deadline alert to lead with time remaining, acknowledge progress, and size the remaining work.",
      annotation: {
        kind: "decision",
        decision: "Lead with time left and acknowledge progress",
        rationale: "Framing the remaining work as two concrete pieces with a time estimate makes the deadline feel achievable rather than alarming.",
        uxPrinciple: "Reduce anxiety; goal-gradient effect",
        toneAlignment: "Friendlier and encouraging, while staying factual.",
        tradeoffs: ["Slightly longer body text."],
        assumptions: ["The 20-minute estimate is realistic for a budget narrative."],
      },
    };
  },
  "archived-empty": (c) => {
    if (c.type !== "empty-state") return null;
    return {
      component: {
        ...c,
        props: {
          ...c.props,
          title: "Your archive is empty",
          body: "Once a grant cycle wraps up, move its applications here to keep your active list short. You can reopen archived work at any time, and nothing here is ever deleted.",
          actionLabel: "Archive a finished application",
          secondaryActionLabel: "How archiving works",
          secondaryAction: { type: "toast", message: "Opens a short help article about archiving" },
        },
        action: { type: "switch-tab", targetId: "applications-tabs", tabId: "tab-submitted" },
      },
      summary: "Made the archive empty state more useful: it now offers a direct next step plus a help link.",
      annotation: {
        kind: "decision",
        decision: "Give the empty archive a direct next step",
        rationale: "Pointing to finished applications turns an informational empty state into a path forward, while the help link stays available for people who are unsure.",
        uxPrinciple: "Helpful empty states; actionable guidance",
        toneAlignment: "Reassuring (“never deleted”) and plain.",
        tradeoffs: ["Two actions compete slightly; the help link is visually secondary."],
        assumptions: [],
      },
    };
  },
  "primary-cta": (c) => {
    if (c.type !== "button") return null;
    return {
      component: { ...c, props: { ...c.props, label: "Continue with the budget narrative" } },
      summary: "Made the primary CTA name the exact step the user will land on.",
      annotation: {
        kind: "decision",
        decision: "Name the step the user lands on",
        rationale: "Saying “budget narrative” removes uncertainty about where the button leads.",
        uxPrinciple: "Recognition over recall; predictability",
        toneAlignment: "Specific and calm.",
        tradeoffs: ["Longer label; may wrap on mobile."],
        assumptions: [],
      },
    };
  },
};

function emphasisScript(level: "high" | "low"): Script {
  return (c) => {
    const component = structuredClone(c);
    component.style = { ...component.style, emphasis: level };
    if (component.type === "button" && level === "high") component.props = { ...component.props, size: "lg", variant: "primary" };
    return {
      component,
      summary: level === "high" ? `Increased the visual emphasis of ${c.name}.` : `Reduced the visual weight of ${c.name}.`,
      annotation: {
        kind: "decision",
        decision: level === "high" ? `Give ${c.name} more visual weight` : `Reduce the visual weight of ${c.name}`,
        rationale:
          level === "high"
            ? "More emphasis signals priority and makes the element easier to find in a scan."
            : "Less emphasis lets more important elements lead the hierarchy.",
        uxPrinciple: "Visual hierarchy",
        toneAlignment: "No copy changed; tone is unaffected.",
        tradeoffs: [level === "high" ? "Competes with other emphasized elements if overused." : "Easier to overlook."],
        assumptions: [],
      },
    };
  };
}

function pickScript(args: RefineArgs): Script | null {
  const text = args.instruction.toLowerCase();
  const copyIntent = args.quickAction === "microcopy" || args.quickAction === "tone" || /rewrite|friendl|copy|wording|tone|useful/.test(text);
  if (copyIntent) return COPY_SCRIPTS[args.targetIds[0]] ?? null;
  if (args.quickAction === "hierarchy" || /prominent|emphasi|stand out|bigger|visible/.test(text)) {
    return /reduce|less|lighter|weight|quieter|subtle/.test(text) ? emphasisScript("low") : emphasisScript("high");
  }
  if (/reduce|lighter|less weight|quieter|subtle/.test(text)) return emphasisScript("low");
  return null;
}

export class DemoProvider implements DesignProvider {
  readonly info: ProviderInfo = { id: "demo", label: "Demo mode (no AI)", model: null, isAI: false };

  async generate<T>(_brief: BriefInput, validate: (raw: unknown) => T, onProgress: ProgressFn) {
    onProgress({ stage: "demo", message: "Loading the prebuilt demo example (not AI-generated)" });
    return validate(structuredClone(DEMO_SPEC));
  }

  async refine<T>(args: RefineArgs, validate: (raw: unknown) => T, onProgress: ProgressFn) {
    onProgress({ stage: "demo", message: "Applying a scripted demo edit (not AI-generated)" });
    const target = args.spec.components.find((c) => c.id === args.targetIds[0]);
    const script = pickScript(args);
    const result = target && script ? script(target) : null;
    if (!target || !result) {
      throw new ProviderError(
        "unsupported",
        "Demo mode only supports scripted edits: Visual hierarchy on any component, or Microcopy/Tone on the deadline alert, primary CTA, and archive empty state. Add ANTHROPIC_API_KEY to .env.local for free-form AI refinement.",
      );
    }
    const annotationId = target.annotationIds?.[0] ?? `annotation-${target.id}`;
    const patch: RefinementPatch = {
      scope: { targetIds: [target.id], dependentIds: [], explanation: "Scripted demo edit limited to the selected component." },
      componentUpdates: [result.component],
      newComponents: [],
      removedComponentIds: [],
      annotationUpdates: [{ id: annotationId, elementId: target.id, ...result.annotation }],
      newAnnotations: [],
      removedAnnotationIds: [],
      summary: result.summary,
      changes: [{ componentId: target.id, description: result.summary }],
      uxImpact: result.annotation.rationale,
      tradeoffs: result.annotation.tradeoffs,
      newAssumptions: [],
    };
    return validate(patch);
  }

  async annotate(): Promise<{ annotations: Annotation[] }> {
    throw new ProviderError("unsupported", "Refreshing annotations needs an AI provider. Add ANTHROPIC_API_KEY to .env.local.");
  }

  async compare(args: { from: { label: string; spec: ScreenSpec }; to: { label: string; spec: ScreenSpec } }) {
    const diff = diffSpecs(args.from.spec, args.to.spec);
    return {
      summary: `Rule-based summary (not AI): ${diff.components.length} component change(s) between ${args.from.label} and ${args.to.label}.`,
      changes: diff.components.map((c) => ({
        componentId: c.id,
        description: c.change === "modified" ? `Changed ${c.fields.join(", ")}` : `Component ${c.change}`,
        uxImpact: "Add an API key for an AI-written impact assessment.",
      })),
      risks: [],
    };
  }

  async review(args: { spec: ScreenSpec }) {
    const findings = ruleReview(args.spec);
    return { summary: `Automated rule checks found ${findings.length} item(s). AI review needs an API key.`, findings };
  }
}
