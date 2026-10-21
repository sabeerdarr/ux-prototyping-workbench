/**
 * Server-side generation service. Route handlers call these functions; React
 * components never talk to a model directly.
 */
import "server-only";
import type { BriefInput, ProviderInfo, ScreenSpec } from "../schema";
import { DemoProvider } from "../demo/demo-provider";
import { AnthropicProvider } from "./anthropic";
import { annotateWith, compareWith, generateWith, refineWith, reviewWith } from "./operations";
import type { DesignProvider, ProgressFn, RefineArgs } from "./types";

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

export const CLAUDE_DESIGN_REASON =
  "Claude Design is used from Claude Code (/design, /design-sync) and claude.ai. It has no public API this app can call, so generation runs through the Anthropic API adapter.";

export function providerStatus(): ProviderStatus {
  return {
    active: getProvider().info,
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    claudeDesign: { available: false, reason: CLAUDE_DESIGN_REASON },
  };
}

export const generateScreen = (brief: BriefInput, onProgress: ProgressFn) => generateWith(getProvider(), brief, onProgress);

export const refineScreen = (args: RefineArgs, onProgress: ProgressFn) => refineWith(getProvider(), args, onProgress);

export const refreshAnnotations = (args: { brief: BriefInput; spec: ScreenSpec }, onProgress: ProgressFn) =>
  annotateWith(getProvider(), args, onProgress);

export const compareVersions = (
  args: { brief: BriefInput; from: { label: string; spec: ScreenSpec }; to: { label: string; spec: ScreenSpec } },
  onProgress: ProgressFn,
) => compareWith(getProvider(), args, onProgress);

export const reviewScreen = (args: { brief: BriefInput; spec: ScreenSpec }, onProgress: ProgressFn) => reviewWith(getProvider(), args, onProgress);
