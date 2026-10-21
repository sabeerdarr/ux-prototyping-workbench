/**
 * Provider-agnostic AI operations: validation, selective patching and
 * result shaping around a DesignProvider. Used by the server service and,
 * for the static hosted demo, by the in-browser backend.
 */
import { AnnotationRefresh, type BriefInput, type ScreenSpec } from "../schema";
import { applyRefinementPatch, diffSpecs, normalizeSpec, validateScreenSpec } from "../spec-ops";
import { ruleReview } from "../rule-review";
import { ProviderError, type DesignProvider, type ProgressFn, type RefineArgs } from "./types";

export async function generateWith(provider: DesignProvider, brief: BriefInput, onProgress: ProgressFn) {
  const result = await provider.generate(brief, validateScreenSpec, onProgress);
  if (brief.platform) result.spec.platform = brief.platform;
  return { ...result, provider: provider.info };
}

export async function refineWith(provider: DesignProvider, args: RefineArgs, onProgress: ProgressFn) {
  const missing = args.targetIds.filter((id) => !args.spec.components.some((c) => c.id === id));
  if (missing.length) throw new ProviderError("bad_request", `Unknown component(s): ${missing.join(", ")}`);
  let patchMeta: unknown;
  const result = await provider.refine(
    args,
    (raw) => {
      patchMeta = raw;
      return applyRefinementPatch(args.spec, raw, args.targetIds);
    },
    onProgress,
  );
  const meta = patchMeta as {
    scope: { explanation: string };
    summary: string;
    changes: { componentId: string; description: string }[];
    uxImpact: string;
    tradeoffs: string[];
    newAssumptions: string[];
  };
  if (result.affectedIds.length === 0 && result.removedIds.length === 0) {
    throw new ProviderError("invalid_output", "The refinement didn't change anything. Try a more specific instruction.", result.warnings);
  }
  return {
    spec: result.spec,
    provider: provider.info,
    record: {
      instruction: args.instruction,
      quickAction: args.quickAction,
      targetIds: args.targetIds,
      affectedIds: result.affectedIds,
      scopeExplanation: meta.scope.explanation,
      summary: meta.summary,
      changes: meta.changes,
      uxImpact: meta.uxImpact,
      tradeoffs: meta.tradeoffs,
      newAssumptions: meta.newAssumptions,
      warnings: result.warnings,
    },
    removedIds: result.removedIds,
  };
}

export async function annotateWith(provider: DesignProvider, args: { brief: BriefInput; spec: ScreenSpec }, onProgress: ProgressFn) {
  const { annotations } = AnnotationRefresh.parse(await provider.annotate(args, onProgress));
  const { spec, warnings } = normalizeSpec({ ...args.spec, annotations });
  return { spec, warnings, provider: provider.info };
}

export async function compareWith(
  provider: DesignProvider,
  args: { brief: BriefInput; from: { label: string; spec: ScreenSpec }; to: { label: string; spec: ScreenSpec } },
  onProgress: ProgressFn,
) {
  const diff = diffSpecs(args.from.spec, args.to.spec);
  if (diff.components.length === 0) {
    return { diff, ai: { summary: "These versions have identical components.", changes: [], risks: [] }, provider: provider.info };
  }
  const ai = await provider.compare({ ...args, changedIds: diff.components.map((c) => c.id) }, onProgress);
  return { diff, ai, provider: provider.info };
}

export async function reviewWith(provider: DesignProvider, args: { brief: BriefInput; spec: ScreenSpec }, onProgress: ProgressFn) {
  const rules = ruleReview(args.spec);
  if (!provider.info.isAI) return { rules, ai: null, provider: provider.info };
  const ai = await provider.review(args, onProgress);
  return { rules, ai, provider: provider.info };
}
