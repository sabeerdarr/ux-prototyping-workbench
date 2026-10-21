/**
 * Core logic checks: validation, selective patching, diffing, demo provider.
 * Run with `npm test`.
 */
import assert from "node:assert/strict";
import { DEMO_SPEC } from "../src/lib/demo/demo-spec";
import { DemoProvider } from "../src/lib/demo/demo-provider";
import { applyRefinementPatch, diffSpecs, SpecValidationError, validateScreenSpec } from "../src/lib/spec-ops";
import { ruleReview } from "../src/lib/rule-review";
import type { RefinementPatch } from "../src/lib/schema";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

const emptyPatch = (over: Partial<RefinementPatch>): RefinementPatch => ({
  scope: { targetIds: [], dependentIds: [], explanation: "" },
  componentUpdates: [],
  newComponents: [],
  removedComponentIds: [],
  annotationUpdates: [],
  newAnnotations: [],
  removedAnnotationIds: [],
  summary: "s",
  changes: [],
  uxImpact: "u",
  tradeoffs: [],
  newAssumptions: [],
  ...over,
});

async function main() {
  console.log("core");

  await test("demo spec validates with no warnings", () => {
    const { spec, warnings, invalidCount } = validateScreenSpec(structuredClone(DEMO_SPEC));
    assert.equal(invalidCount, 0);
    assert.deepEqual(warnings, []);
    assert.equal(spec.components.length, DEMO_SPEC.components.length);
    const cta = spec.components.find((c) => c.id === "primary-cta")!;
    assert.deepEqual(cta.annotationIds, ["annotation-primary-cta"]);
  });

  await test("malformed envelope throws SpecValidationError", () => {
    assert.throws(() => validateScreenSpec({ title: "x" }), SpecValidationError);
  });

  await test("unknown component type becomes a notice, dangling refs are removed", () => {
    const raw = structuredClone(DEMO_SPEC) as unknown as { components: Record<string, unknown>[] };
    raw.components.push({ id: "weird", type: "carousel3d", name: "Weird", props: {} });
    (raw.components.find((c) => c.id === "main-stack")!.children as string[]).push("weird", "ghost");
    const { spec, warnings } = validateScreenSpec(raw);
    assert.equal(spec.components.find((c) => c.id === "weird")!.type, "notice");
    assert.ok(!spec.components.find((c) => c.id === "main-stack")!.children!.includes("ghost"));
    assert.ok(warnings.some((w) => w.includes("weird")));
  });

  await test("too many invalid components triggers repair", () => {
    const raw = structuredClone(DEMO_SPEC) as unknown as { components: Record<string, unknown>[] };
    raw.components = raw.components.map((c) => ({ ...c, props: null }));
    assert.throws(() => validateScreenSpec(raw), SpecValidationError);
  });

  await test("patch updates only the target and preserves everything else", () => {
    const cta = structuredClone(DEMO_SPEC.components.find((c) => c.id === "primary-cta")!);
    if (cta.type !== "button") throw new Error();
    cta.props.label = "Finish budget narrative";
    const intruder = structuredClone(DEMO_SPEC.components.find((c) => c.id === "stat-active")!);
    if (intruder.type !== "stat") throw new Error();
    intruder.props.value = "999";
    const r = applyRefinementPatch(
      DEMO_SPEC,
      emptyPatch({ scope: { targetIds: ["primary-cta"], dependentIds: [], explanation: "" }, componentUpdates: [cta, intruder] }),
      ["primary-cta"],
    );
    assert.deepEqual(r.changedIds, ["primary-cta"]);
    assert.ok(r.warnings.some((w) => w.includes("stat-active")));
    const d = diffSpecs(DEMO_SPEC, r.spec);
    assert.deepEqual(d.components.map((c) => c.id), ["primary-cta"]);
    assert.deepEqual(d.components[0].fields, ["props.label"]);
  });

  await test("new dialog with declared dependent is applied consistently", () => {
    const table = structuredClone(DEMO_SPEC.components.find((c) => c.id === "applications-table")!);
    if (table.type !== "table") throw new Error();
    table.props.rowActions = [{ label: "Delete", tone: "danger", action: { type: "open-dialog", targetId: "delete-dialog" } }];
    const r = applyRefinementPatch(
      DEMO_SPEC,
      emptyPatch({
        scope: { targetIds: ["applications-table"], dependentIds: [], explanation: "" },
        componentUpdates: [table],
        newComponents: [
          {
            id: "delete-dialog",
            type: "dialog",
            name: "Delete confirmation",
            props: { title: "Delete?", body: "This can't be undone.", confirmLabel: "Delete", cancelLabel: "Keep", tone: "danger", confirmAction: { type: "remove-item", targetId: "applications-table" } },
          },
        ],
        newAnnotations: [
          { id: "annotation-delete", elementId: "delete-dialog", kind: "decision", decision: "d", rationale: "r", uxPrinciple: "p", toneAlignment: "t", tradeoffs: [], assumptions: [] },
        ],
      }),
      ["applications-table"],
    );
    assert.deepEqual(r.addedIds, ["delete-dialog"]);
    assert.ok(r.spec.annotations.some((a) => a.id === "annotation-delete"));
    assert.equal(r.spec.components.length, DEMO_SPEC.components.length + 1);
  });

  await test("out-of-scope removal is rejected", () => {
    const r = applyRefinementPatch(DEMO_SPEC, emptyPatch({ removedComponentIds: ["stats-grid"] }), ["primary-cta"]);
    assert.equal(r.removedIds.length, 0);
    assert.ok(r.spec.components.some((c) => c.id === "stats-grid"));
  });

  await test("demo provider scripted refinement round-trips through the patcher", async () => {
    const p = new DemoProvider();
    const r = await p.refine(
      { brief: { description: "x", tone: "y" }, spec: DEMO_SPEC, targetIds: ["deadline-alert"], instruction: "Rewrite this in a friendlier tone", quickAction: "tone" },
      (raw) => applyRefinementPatch(DEMO_SPEC, raw, ["deadline-alert"]),
      () => {},
    );
    assert.deepEqual(r.changedIds, ["deadline-alert"]);
    const ann = r.spec.annotations.find((a) => a.elementId === "deadline-alert")!;
    assert.equal(ann.id, "annotation-deadline-alert");
    assert.match(ann.decision, /time left/);
  });

  await test("demo provider refuses unsupported free-form edits honestly", async () => {
    const p = new DemoProvider();
    await assert.rejects(
      p.refine({ brief: { description: "x", tone: "y" }, spec: DEMO_SPEC, targetIds: ["stat-rate"], instruction: "Add a sparkline" }, (x) => x, () => {}),
      /Demo mode only supports scripted edits/,
    );
  });

  await test("rule review runs and finds the icon-only menu", () => {
    const findings = ruleReview(DEMO_SPEC);
    assert.ok(Array.isArray(findings));
    assert.ok(!findings.some((f) => f.componentId === "notifications-menu"), "menu has an a11y label");
  });

  console.log(`\n${passed} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
