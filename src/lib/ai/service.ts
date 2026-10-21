/**
 * Server-side generation service. Route handlers call these functions; React
 * components never talk to a model directly.
 */
import "server-only";
import { AnnotationRefresh, type BriefInput, type ProviderInfo, type ScreenSpec } from "../schema";
import { applyRefinementPatch, diffSpecs, normalizeSpec, validateScreenSpec } from "../spec-ops";
import { ruleReview } from "../rule-review";
import { DemoProvider } from "../demo/demo-provider";
import { AnthropicProvider } from "./anthropic";
import { ProviderError, type DesignProvider, type ProgressFn, type RefineArgs } from "./types";

let cached: { key: string; provider: DesignProvider } | null = null;

/** Picks the provider from server environment variables. Keys never leave the server. */
export function getProvider(): DesignProvider {
  const forced = process.env.DESIGN_PROVIDER?.trim().toLowerCase();
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const key = `${forced}|${apiKey ? "k" : ""}|${process.env.ANTHROPIC_MODEL ?? ""}`;
  if (cached?.key === key) return cached.provider;
  const provider: DesignProvider = forced === "demo" || !apiKey ? new DemoProvider() : new AnthropicProvider(apiKey);
  cached = { key, provider };
  return provider;
}

export interface ProviderStatus {
  active: ProviderInfo;
  anthropicConfigured: boolean;
  claudeDesign: { available: false; reason: string };
}

export function providerStatus(): ProviderStatus {
  return {
    active: getProvider().info,
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    claudeDesign: {
      available: false,
      reason:
        "Claude Design is used from Claude Code (/design, /design-sync) and claude.ai. It has no public API this app can call, so generation runs through the Anthropic API adapter.",
    },
  };
}

export async function generateScreen(brief: BriefInput, onProgress: ProgressFn) {
  const provider = getProvider();
  const result = await provider.generate(brief, validateScreenSpec, onProgress);
  if (brief.platform) result.spec.platform = brief.platform;
  return { ...result, provider: provider.info };
}

export async function refineScreen(args: RefineArgs, onProgress: ProgressFn) {
  const provider = getProvider();
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

export async function refreshAnnotations(args: { brief: BriefInput; spec: ScreenSpec }, onProgress: ProgressFn) {
  const provider = getProvider();
  const { annotations } = AnnotationRefresh.parse(await provider.annotate(args, onProgress));
  const { spec, warnings } = normalizeSpec({ ...args.spec, annotations });
  return { spec, warnings, provider: provider.info };
}

export async function compareVersions(
  args: { brief: BriefInput; from: { label: string; spec: ScreenSpec }; to: { label: string; spec: ScreenSpec } },
  onProgress: ProgressFn,
) {
  const provider = getProvider();
  const diff = diffSpecs(args.from.spec, args.to.spec);
  if (diff.components.length === 0) {
    return { diff, ai: { summary: "These versions have identical components.", changes: [], risks: [] }, provider: provider.info };
  }
  const ai = await provider.compare({ ...args, changedIds: diff.components.map((c) => c.id) }, onProgress);
  return { diff, ai, provider: provider.info };
}

export async function reviewScreen(args: { brief: BriefInput; spec: ScreenSpec }, onProgress: ProgressFn) {
  const provider = getProvider();
  const rules = ruleReview(args.spec);
  if (!provider.info.isAI) return { rules, ai: null, provider: provider.info };
  const ai = await provider.review(args, onProgress);
  return { rules, ai, provider: provider.info };
}
