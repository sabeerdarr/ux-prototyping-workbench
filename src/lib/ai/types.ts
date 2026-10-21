import type {
  AnnotationRefresh,
  BriefInput,
  ComparisonResult,
  ProviderInfo,
  QuickAction,
  ReviewResult,
  ScreenSpec,
} from "../schema";
import type { z } from "zod";

export type ProviderErrorCode =
  | "missing_credentials"
  | "auth"
  | "rate_limit"
  | "overloaded"
  | "timeout"
  | "network"
  | "invalid_output"
  | "refusal"
  | "truncated"
  | "bad_request"
  | "unsupported"
  | "unknown";

const RETRYABLE: ProviderErrorCode[] = ["rate_limit", "overloaded", "timeout", "network", "invalid_output", "truncated", "unknown"];

export class ProviderError extends Error {
  readonly retryable: boolean;
  constructor(
    public code: ProviderErrorCode,
    message: string,
    public details?: string[],
  ) {
    super(message);
    this.retryable = RETRYABLE.includes(code);
  }
}

export interface Progress {
  stage: "queued" | "thinking" | "writing" | "validating" | "repairing" | "applying" | "demo";
  message: string;
  /** Characters of output streamed so far, when known. */
  chars?: number;
  /** Rough count of components seen in the stream so far. */
  components?: number;
}

export type ProgressFn = (p: Progress) => void;

export interface RefineArgs {
  brief: BriefInput;
  spec: ScreenSpec;
  targetIds: string[];
  instruction: string;
  quickAction?: QuickAction;
}

/**
 * A design-generation backend. Implementations return raw, untrusted
 * structures validated by the caller-supplied `validate` function, which
 * throws SpecValidationError to request a repair.
 */
export interface DesignProvider {
  info: ProviderInfo;
  generate<T>(brief: BriefInput, validate: (raw: unknown) => T, onProgress: ProgressFn): Promise<T>;
  refine<T>(args: RefineArgs, validate: (raw: unknown) => T, onProgress: ProgressFn): Promise<T>;
  annotate(args: { brief: BriefInput; spec: ScreenSpec }, onProgress: ProgressFn): Promise<z.infer<typeof AnnotationRefresh>>;
  compare(
    args: { brief: BriefInput; from: { label: string; spec: ScreenSpec }; to: { label: string; spec: ScreenSpec }; changedIds: string[] },
    onProgress: ProgressFn,
  ): Promise<ComparisonResult>;
  review(args: { brief: BriefInput; spec: ScreenSpec }, onProgress: ProgressFn): Promise<ReviewResult>;
}
