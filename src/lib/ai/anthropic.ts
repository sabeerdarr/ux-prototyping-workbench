/**
 * Anthropic API provider (server-only). Uses the official SDK with streaming,
 * structured outputs where the schema is accepted, and validate-and-repair
 * for anything the model returns.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  AnnotationRefresh,
  ComparisonResult,
  RefinementPatch,
  ReviewResult,
  ScreenSpec,
  type BriefInput,
  type ProviderInfo,
} from "../schema";
import { SpecValidationError } from "../spec-ops";
import {
  annotationPrompt,
  comparisonPrompt,
  generationPrompt,
  refinementPrompt,
  repairMessage,
  reviewPrompt,
  type PromptPair,
} from "../prompts";
import { ProviderError, type DesignProvider, type ProgressFn, type RefineArgs } from "./types";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

const DEFAULT_MODEL = "claude-opus-5-5";

/** Convert a Zod schema into the JSON Schema subset structured outputs accepts. */
function toStructuredSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any", reused: "ref" }) as Record<string, unknown>;
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "$schema") continue;
      out[k === "oneOf" ? "anyOf" : k] = visit(v);
    }
    if (out.type === "object") out.additionalProperties = false;
    return out;
  };
  return visit(json) as Record<string, unknown>;
}

/** Pull the JSON object out of a text response (tolerates stray fences or prose). */
function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new SyntaxError("No JSON object found in the response.");
  }
}

function mapError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)
    return new ProviderError("auth", "The Anthropic API rejected the credentials. Check ANTHROPIC_API_KEY in .env.local.");
  if (err instanceof Anthropic.RateLimitError)
    return new ProviderError("rate_limit", "The Anthropic API rate limit was reached. Wait a moment and retry.");
  if (err instanceof Anthropic.NotFoundError)
    return new ProviderError("bad_request", "The configured model was not found. Check ANTHROPIC_MODEL.");
  if (err instanceof Anthropic.BadRequestError)
    return new ProviderError("bad_request", `The Anthropic API rejected the request: ${err.message}`);
  if (err instanceof Anthropic.InternalServerError)
    return err.status === 529
      ? new ProviderError("overloaded", "The Anthropic API is temporarily overloaded. Retry in a minute.")
      : new ProviderError("unknown", "The Anthropic API returned a server error. Retry shortly.");
  if (err instanceof Anthropic.APIConnectionTimeoutError)
    return new ProviderError("timeout", "The request to the Anthropic API timed out. Retry, or simplify the request.");
  if (err instanceof Anthropic.APIConnectionError)
    return new ProviderError("network", "Couldn't reach the Anthropic API. Check your network connection.");
  if (err instanceof Anthropic.APIError)
    return new ProviderError("unknown", `Anthropic API error (${err.status ?? "no status"}): ${err.message}`);
  return new ProviderError("unknown", err instanceof Error ? err.message : "Unexpected provider error.");
}

interface CallOptions<T> {
  task: string;
  prompt: PromptPair;
  schema: z.ZodType;
  validate: (raw: unknown) => T;
  onProgress: ProgressFn;
  maxTokens: number;
  effort?: Effort;
}

export class AnthropicProvider implements DesignProvider {
  readonly info: ProviderInfo;
  private client: Anthropic;
  private model: string;
  private effort: Effort;
  /** Per-task memory of whether the API accepted our structured-output schema. */
  private schemaRejected = new Set<string>();
  private fallbacksEnabled: boolean;

  constructor(apiKey: string) {
    this.model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
    this.effort = (process.env.ANTHROPIC_EFFORT?.trim() as Effort) || "medium";
    this.fallbacksEnabled = process.env.ANTHROPIC_FALLBACKS !== "off";
    this.client = new Anthropic({
      apiKey,
      timeout: Number(process.env.ANTHROPIC_TIMEOUT_MS) || 300_000,
      maxRetries: 2, // SDK retries 408/409/429/5xx with backoff
    });
    this.info = { id: "anthropic", label: "Anthropic API", model: this.model, isAI: true };
  }

  private async call<T>(opts: CallOptions<T>): Promise<T> {
    const { task, prompt, schema, validate, onProgress } = opts;
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt.user }];
    let repairs = 0;
    let configRetries = 0;

    while (true) {
      const useSchema = !this.schemaRejected.has(task);
      const useFallbacks = this.fallbacksEnabled;
      onProgress({ stage: repairs ? "repairing" : "thinking", message: repairs ? "Repairing invalid output" : "Thinking through the design" });

      let final: Anthropic.Beta.BetaMessage;
      try {
        const stream = this.client.beta.messages.stream({
          model: this.model,
          max_tokens: opts.maxTokens,
          system: [{ type: "text", text: prompt.system, cache_control: { type: "ephemeral" } }],
          messages,
          output_config: {
            effort: opts.effort ?? this.effort,
            ...(useSchema ? { format: { type: "json_schema", schema: toStructuredSchema(schema) } } : {}),
          },
          ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        });
        let chars = 0;
        let lastEmit = 0;
        let components = 0;
        stream.on("text", (delta) => {
          chars += delta.length;
          components += (delta.match(/"type"\s*:/g) ?? []).length;
          if (chars - lastEmit > 400) {
            lastEmit = chars;
            onProgress({ stage: "writing", message: "Writing the specification", chars, components });
          }
        });
        final = await stream.finalMessage();
      } catch (err) {
        // A 400 may mean our schema or the fallback option isn't accepted for this
        // model/account. Drop the optional feature once and retry before failing.
        if (err instanceof Anthropic.BadRequestError && configRetries < 2) {
          configRetries++;
          if (useSchema) {
            this.schemaRejected.add(task);
            continue;
          }
          if (useFallbacks) {
            this.fallbacksEnabled = false;
            continue;
          }
        }
        throw mapError(err);
      }

      if (final.stop_reason === "refusal") {
        throw new ProviderError("refusal", "The model declined this request. Try rephrasing the description.");
      }
      if (final.stop_reason === "max_tokens") {
        throw new ProviderError("truncated", "The response was too long and got cut off. Try a narrower request or retry.");
      }

      const text = final.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      onProgress({ stage: "validating", message: "Validating the specification" });
      let issues: string[];
      try {
        return validate(extractJson(text));
      } catch (err) {
        if (err instanceof SpecValidationError) issues = err.issues.length ? err.issues : [err.message];
        else if (err instanceof SyntaxError) issues = [`Invalid JSON: ${err.message}`];
        else if (err instanceof z.ZodError) issues = err.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`);
        else throw err;
      }

      if (repairs >= 1) {
        throw new ProviderError("invalid_output", "The model returned a specification that failed validation twice.", issues);
      }
      repairs++;
      // Append-only history: send the assistant turn back unchanged, then ask for a fix.
      messages.push({ role: "assistant", content: final.content as Anthropic.Beta.BetaContentBlockParam[] });
      messages.push({ role: "user", content: repairMessage(issues) });
    }
  }

  generate<T>(brief: BriefInput, validate: (raw: unknown) => T, onProgress: ProgressFn) {
    return this.call({ task: "generate", prompt: generationPrompt(brief), schema: ScreenSpec, validate, onProgress, maxTokens: 64_000 });
  }

  refine<T>(args: RefineArgs, validate: (raw: unknown) => T, onProgress: ProgressFn) {
    return this.call({ task: "refine", prompt: refinementPrompt(args), schema: RefinementPatch, validate, onProgress, maxTokens: 32_000 });
  }

  annotate(args: { brief: BriefInput; spec: ScreenSpec }, onProgress: ProgressFn) {
    return this.call({
      task: "annotate",
      prompt: annotationPrompt(args),
      schema: AnnotationRefresh,
      validate: (raw) => AnnotationRefresh.parse(raw),
      onProgress,
      maxTokens: 16_000,
    });
  }

  compare(
    args: { brief: BriefInput; from: { label: string; spec: ScreenSpec }; to: { label: string; spec: ScreenSpec }; changedIds: string[] },
    onProgress: ProgressFn,
  ) {
    return this.call({
      task: "compare",
      prompt: comparisonPrompt(args),
      schema: ComparisonResult,
      validate: (raw) => ComparisonResult.parse(raw),
      onProgress,
      maxTokens: 8_000,
      effort: "low",
    });
  }

  review(args: { brief: BriefInput; spec: ScreenSpec }, onProgress: ProgressFn) {
    return this.call({
      task: "review",
      prompt: reviewPrompt(args),
      schema: ReviewResult,
      validate: (raw) => ReviewResult.parse(raw),
      onProgress,
      maxTokens: 16_000,
    });
  }
}
