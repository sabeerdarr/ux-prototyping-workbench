import "server-only";
import { z } from "zod";
import { ProviderError, type Progress } from "../ai/types";
import { SpecValidationError } from "../spec-ops";

export type StreamEvent =
  | ({ type: "progress" } & Progress)
  | { type: "result"; data: unknown }
  | { type: "error"; code: string; message: string; retryable: boolean; details?: string[] };

const inFlight = new Set<string>();

export function errorEvent(err: unknown): Extract<StreamEvent, { type: "error" }> {
  if (err instanceof ProviderError)
    return { type: "error", code: err.code, message: err.message, retryable: err.retryable, details: err.details };
  if (err instanceof SpecValidationError)
    return { type: "error", code: "invalid_output", message: err.message, retryable: true, details: err.issues };
  if (err instanceof z.ZodError)
    return { type: "error", code: "bad_request", message: "The request was invalid.", retryable: false, details: err.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) };
  console.error("[workbench] unexpected error", err);
  return { type: "error", code: "unknown", message: "Something unexpected went wrong on the server.", retryable: true };
}

/**
 * Run a long AI task and stream newline-delimited JSON progress events, ending
 * with a single result or error event. `lockKey` rejects duplicate concurrent
 * submissions (e.g. a double-clicked Generate button).
 */
export function streamTask(lockKey: string | null, task: (emit: (p: Progress) => void) => Promise<unknown>): Response {
  if (lockKey && inFlight.has(lockKey)) {
    return Response.json(
      { type: "error", code: "duplicate", message: "This request is already running. Wait for it to finish.", retryable: false },
      { status: 409 },
    );
  }
  if (lockKey) inFlight.add(lockKey);
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (e: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          // client disconnected
        }
      };
      // Heartbeat keeps proxies from closing the connection during long thinking.
      const heartbeat = setInterval(() => send({ type: "progress", stage: "thinking", message: "Still working" }), 15_000);
      try {
        const data = await task((p) => send({ type: "progress", ...p }));
        send({ type: "result", data });
      } catch (err) {
        send(errorEvent(err));
      } finally {
        clearInterval(heartbeat);
        if (lockKey) inFlight.delete(lockKey);
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ProviderError("bad_request", "Request body must be JSON.");
  }
  return schema.parse(raw);
}
