/**
 * Exercises the real Anthropic provider and generation service against a
 * local mock of the Messages API (streaming SSE). No API key or network
 * needed. Covers: structured-output schema rejection fallback, invalid-JSON
 * repair, selective refinement, and error mapping.
 *
 * Run with `npm run test:adapter`.
 */
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { DEMO_SPEC } from "../src/lib/demo/demo-spec";

type Reply = { status?: number; text?: string; stop?: string; error?: string };
const queue: Reply[] = [];
const requests: Record<string, unknown>[] = [];

function sse(res: http.ServerResponse, text: string, stop: string) {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send("message_start", {
    type: "message_start",
    message: { id: "msg_mock", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } },
  });
  send("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
  for (let i = 0; i < text.length; i += 700) send("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(i, i + 700) } });
  send("content_block_stop", { type: "content_block_stop", index: 0 });
  send("message_delta", { type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 100 } });
  send("message_stop", { type: "message_stop" });
  res.end();
}

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    requests.push(JSON.parse(body || "{}"));
    const r = queue.shift() ?? { status: 500, error: "mock queue empty" };
    if (r.status && r.status !== 200) {
      res.writeHead(r.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: r.status === 400 ? "invalid_request_error" : r.status === 401 ? "authentication_error" : "api_error", message: r.error } }));
      return;
    }
    sse(res, r.text ?? "", r.stop ?? "end_turn");
  });
});

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  process.env.ANTHROPIC_API_KEY = "sk-ant-mock";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  const { generateScreen, refineScreen, getProvider } = await import("../src/lib/ai/service");
  const { ProviderError } = await import("../src/lib/ai/types");
  const brief = { description: "A grant dashboard for nonprofits", tone: "Calm and clear" };
  console.log("adapter (mock Messages API)");

  await test("provider is the Anthropic adapter, not demo", async () => {
    assert.equal(getProvider().info.id, "anthropic");
    assert.equal(getProvider().info.isAI, true);
  });

  await test("schema 400 falls back, invalid JSON is repaired, spec validates", async () => {
    requests.length = 0;
    queue.push({ status: 400, error: "output_config.format: schema is too complex" });
    queue.push({ text: '{"title": "oops", "components": [' });
    queue.push({ text: JSON.stringify(DEMO_SPEC) });
    const stages: string[] = [];
    const r = await generateScreen(brief, (p) => stages.push(p.stage));
    assert.equal(r.spec.components.length, DEMO_SPEC.components.length);
    assert.equal(r.provider.id, "anthropic");
    assert.equal(requests.length, 3);
    const [first, second, third] = requests as { output_config?: { format?: unknown; effort?: string }; model?: string; messages: unknown[]; fallbacks?: unknown }[];
    assert.ok(first.output_config?.format, "first attempt uses structured outputs");
    assert.equal(second.output_config?.format, undefined, "fallback drops the schema");
    assert.equal(first.model, "claude-opus-5-5");
    assert.equal(first.fallbacks, "default");
    assert.equal(third.messages.length, 3, "repair appends assistant turn + correction");
    assert.ok(stages.includes("repairing"));
  });

  await test("refinement patch updates only the target and reports out-of-scope edits", async () => {
    const cta = structuredClone(DEMO_SPEC.components.find((c) => c.id === "primary-cta")!) as { props: { label: string } };
    cta.props.label = "Continue with the budget narrative";
    const stat = structuredClone(DEMO_SPEC.components.find((c) => c.id === "stat-rate")!) as { props: { value: string } };
    stat.props.value = "99%";
    queue.push({
      text: JSON.stringify({
        scope: { targetIds: ["primary-cta"], dependentIds: [], explanation: "Only the CTA." },
        componentUpdates: [cta, stat],
        newComponents: [],
        removedComponentIds: [],
        annotationUpdates: [
          { id: "annotation-primary-cta", elementId: "primary-cta", kind: "decision", decision: "Name the destination step", rationale: "r", uxPrinciple: "p", toneAlignment: "t", tradeoffs: [], assumptions: [] },
        ],
        newAnnotations: [],
        removedAnnotationIds: [],
        summary: "Made the CTA name the step.",
        changes: [{ componentId: "primary-cta", description: "Label names the step" }],
        uxImpact: "Less uncertainty.",
        tradeoffs: ["Longer label"],
        newAssumptions: [],
      }),
    });
    const r = await refineScreen({ brief, spec: DEMO_SPEC, targetIds: ["primary-cta"], instruction: "Make the CTA more specific" }, () => {});
    assert.deepEqual(r.record.affectedIds, ["primary-cta"]);
    assert.ok(r.record.warnings.some((w) => w.includes("stat-rate")));
    const after = r.spec.components.find((c) => c.id === "stat-rate") as { props: { value: string } };
    assert.equal(after.props.value, "38%", "unrelated component preserved");
    assert.equal(r.spec.annotations.find((a) => a.id === "annotation-primary-cta")!.decision, "Name the destination step");
  });

  await test("truncated output and auth errors map to clear provider errors", async () => {
    queue.push({ text: '{"title":', stop: "max_tokens" });
    await assert.rejects(generateScreen(brief, () => {}), (e: unknown) => e instanceof ProviderError && e.code === "truncated");
    queue.push({ status: 401, error: "invalid x-api-key" });
    await assert.rejects(generateScreen(brief, () => {}), (e: unknown) => e instanceof ProviderError && e.code === "auth" && !e.retryable);
  });

  console.log(`\n${passed} passed`);
  server.close();
}

main().catch((err) => {
  console.error(err);
  server.close();
  process.exit(1);
});
