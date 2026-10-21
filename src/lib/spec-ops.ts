/**
 * Pure operations on screen specs: validation of untrusted model output,
 * normalization, selective patching, and diffing. Shared by server and client.
 */
import { z } from "zod";
import {
  Annotation,
  Component,
  LooseScreenSpec,
  RefinementPatch,
  Theme,
  type ScreenSpec,
} from "./schema";

import { childIdsOf } from "./spec-tree";

export { childIdsOf };

export const DEFAULT_THEME: Theme = {
  primary: "#2f5fd0",
  neutral: "slate",
  radius: "md",
  density: "comfortable",
  font: "sans",
  mode: "light",
};

const HEX = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

/* ------------------------------------------------------------------ */
/* Tree helpers                                                        */
/* ------------------------------------------------------------------ */


export function indexComponents(spec: ScreenSpec): Map<string, Component> {
  return new Map(spec.components.map((c) => [c.id, c]));
}

export function findParentId(spec: ScreenSpec, id: string): string | null {
  for (const c of spec.components) if (childIdsOf(c).includes(id)) return c.id;
  return null;
}

/** Ids of a component and everything beneath it. */
export function descendantIds(spec: ScreenSpec, id: string): string[] {
  const index = indexComponents(spec);
  const out: string[] = [];
  const visit = (cid: string, depth: number) => {
    if (depth > 50 || out.includes(cid)) return;
    out.push(cid);
    const c = index.get(cid);
    if (c) for (const k of childIdsOf(c)) visit(k, depth + 1);
  };
  visit(id, 0);
  return out;
}

function stripRefs(c: Component, removed: Set<string>): Component {
  const next = structuredClone(c);
  if (next.children) next.children = next.children.filter((id) => !removed.has(id));
  if (next.actionIds) next.actionIds = next.actionIds.filter((id) => !removed.has(id));
  if (next.type === "tabs")
    for (const t of next.props.tabs) t.contentIds = t.contentIds.filter((id) => !removed.has(id));
  return next;
}

/* ------------------------------------------------------------------ */
/* Validation of untrusted model output                                */
/* ------------------------------------------------------------------ */

export interface ValidationOutcome {
  spec: ScreenSpec;
  warnings: string[];
  /** Components that failed validation and were replaced by notices. */
  invalidCount: number;
}

export class SpecValidationError extends Error {
  constructor(
    message: string,
    public issues: string[],
  ) {
    super(message);
  }
}

function formatIssues(err: { issues: { path: PropertyKey[]; message: string }[] }, prefix = ""): string[] {
  return err.issues.slice(0, 8).map((i) => `${prefix}${i.path.map(String).join(".") || "(root)"}: ${i.message}`);
}

/** Validate one component, replacing it with a visible notice if it is unusable. */
export function validateComponent(raw: unknown, warnings: string[]): { component: Component; valid: boolean } {
  const parsed = Component.safeParse(raw);
  if (parsed.success) return { component: parsed.data, valid: true };
  const r = (raw ?? {}) as { id?: unknown; type?: unknown; name?: unknown };
  const id = typeof r.id === "string" ? r.id : `invalid-${Math.random().toString(36).slice(2, 8)}`;
  const type = typeof r.type === "string" ? r.type : "unknown";
  warnings.push(`Component "${id}" (${type}) failed validation and was replaced with a notice: ${formatIssues(parsed.error).join("; ")}`);
  return {
    valid: false,
    component: {
      id,
      type: "notice",
      name: typeof r.name === "string" ? r.name : `Unsupported ${type}`,
      props: { text: `This ${type} component could not be rendered safely and was omitted.` },
    },
  };
}

/**
 * Parse raw model output into a ScreenSpec. Throws SpecValidationError when
 * the envelope is unusable (the caller may then ask the model to repair it);
 * otherwise degrades gracefully per component and per annotation.
 */
export function validateScreenSpec(raw: unknown): ValidationOutcome {
  const envelope = LooseScreenSpec.safeParse(raw);
  if (!envelope.success) {
    throw new SpecValidationError("The screen specification is missing required fields.", formatIssues(envelope.error));
  }
  const warnings: string[] = [];
  let invalidCount = 0;
  const components = envelope.data.components.map((c) => {
    const r = validateComponent(c, warnings);
    if (!r.valid) invalidCount++;
    return r.component;
  });
  if (components.length > 0 && invalidCount / components.length > 0.3) {
    throw new SpecValidationError(
      `${invalidCount} of ${components.length} components failed validation.`,
      warnings.slice(0, 10),
    );
  }

  const annotations: Annotation[] = [];
  for (const a of envelope.data.annotations) {
    const p = Annotation.safeParse(a);
    if (p.success) annotations.push(p.data);
    else warnings.push(`An annotation was dropped because it was malformed: ${formatIssues(p.error).join("; ")}`);
  }

  const theme = Theme.safeParse(envelope.data.theme);
  if (!theme.success) warnings.push("Theme was invalid; the default theme was used.");

  const assumptions = (envelope.data.assumptions ?? []).flatMap((a, i) => {
    if (typeof a === "string") return [{ id: `assumption-${i + 1}`, text: a }];
    if (a && typeof a === "object" && typeof (a as { text?: unknown }).text === "string") {
      const o = a as { id?: unknown; text: string };
      return [{ id: typeof o.id === "string" ? o.id : `assumption-${i + 1}`, text: o.text }];
    }
    return [];
  });

  const spec: ScreenSpec = {
    title: envelope.data.title,
    description: envelope.data.description,
    platform: envelope.data.platform,
    toneSummary: envelope.data.toneSummary,
    theme: theme.success ? theme.data : DEFAULT_THEME,
    rootIds: envelope.data.rootIds,
    components,
    annotations,
    assumptions,
  };
  const normalized = normalizeSpec(spec);
  return { spec: normalized.spec, warnings: [...warnings, ...normalized.warnings], invalidCount };
}

/* ------------------------------------------------------------------ */
/* Normalization                                                       */
/* ------------------------------------------------------------------ */

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

/**
 * Enforce invariants the schema can't express: unique ids, no dangling
 * references, sane numeric ranges, valid colors, annotation links.
 */
export function normalizeSpec(input: ScreenSpec): { spec: ScreenSpec; warnings: string[] } {
  const warnings: string[] = [];
  const spec = structuredClone(input);

  // Unique component ids
  const seen = new Set<string>();
  spec.components = spec.components.filter((c) => {
    if (seen.has(c.id)) {
      warnings.push(`Duplicate component id "${c.id}" was removed.`);
      return false;
    }
    seen.add(c.id);
    return true;
  });

  // Numeric ranges and colors
  for (const c of spec.components) {
    switch (c.type) {
      case "grid":
        c.props.columns = Math.round(clamp(c.props.columns, 1, 4));
        break;
      case "heading":
        c.props.level = Math.round(clamp(c.props.level, 1, 4));
        break;
      case "progress":
        if (c.props.max !== undefined && !(c.props.max > 0)) delete c.props.max;
        c.props.value = clamp(c.props.value, 0, c.props.max ?? 100);
        break;
      case "list":
        for (const it of c.props.items) if (it.progress !== undefined) it.progress = clamp(it.progress, 0, 100);
        break;
      case "pagination":
        c.props.pageCount = Math.max(1, Math.round(c.props.pageCount));
        c.props.page = Math.round(clamp(c.props.page, 1, c.props.pageCount));
        break;
      case "key-value":
        if (c.props.columns !== undefined) c.props.columns = Math.round(clamp(c.props.columns, 1, 3));
        break;
    }
    if (c.action?.delayMs !== undefined) c.action.delayMs = clamp(c.action.delayMs, 0, 5000);
  }
  if (!HEX.test(spec.theme.primary)) {
    warnings.push(`Theme color "${spec.theme.primary}" is not a hex color; default used.`);
    spec.theme.primary = DEFAULT_THEME.primary;
  }
  if (spec.theme.accent && !HEX.test(spec.theme.accent)) delete spec.theme.accent;

  // Dangling references
  const ids = new Set(spec.components.map((c) => c.id));
  const dangling = new Set<string>();
  for (const c of spec.components) for (const k of childIdsOf(c)) if (!ids.has(k)) dangling.add(k);
  if (dangling.size) {
    warnings.push(`Removed references to missing components: ${[...dangling].join(", ")}.`);
    spec.components = spec.components.map((c) => stripRefs(c, dangling));
  }

  // Roots: keep valid ones; if none, infer from unreferenced components
  spec.rootIds = spec.rootIds.filter((id, i, arr) => ids.has(id) && arr.indexOf(id) === i);
  if (spec.rootIds.length === 0) {
    const referenced = new Set(spec.components.flatMap(childIdsOf));
    spec.rootIds = spec.components.filter((c) => !referenced.has(c.id) && c.type !== "dialog").map((c) => c.id);
    if (spec.rootIds.length) warnings.push("Root layout was missing; it was inferred from unreferenced components.");
  }

  // Annotations must point at real elements
  const annIds = new Set<string>();
  spec.annotations = spec.annotations.filter((a) => {
    if (!ids.has(a.elementId)) {
      warnings.push(`Annotation "${a.decision}" referenced missing element "${a.elementId}" and was removed.`);
      return false;
    }
    if (annIds.has(a.id)) return false;
    annIds.add(a.id);
    return true;
  });

  // annotationIds are derived, so they can never drift out of sync
  const byElement = new Map<string, string[]>();
  for (const a of spec.annotations) byElement.set(a.elementId, [...(byElement.get(a.elementId) ?? []), a.id]);
  for (const c of spec.components) {
    const list = byElement.get(c.id);
    if (list) c.annotationIds = list;
    else delete c.annotationIds;
  }

  return { spec, warnings };
}

/* ------------------------------------------------------------------ */
/* Selective patching                                                  */
/* ------------------------------------------------------------------ */

export interface PatchResult {
  spec: ScreenSpec;
  changedIds: string[];
  addedIds: string[];
  removedIds: string[];
  affectedIds: string[];
  warnings: string[];
}

/**
 * Apply a refinement patch, touching only the requested components and the
 * dependents the model declared. Anything else the model tried to change is
 * rejected and reported, so unrelated content and ids are always preserved.
 */
/** Components and annotations are validated one by one below, so one bad item doesn't sink the patch. */
const LoosePatch = RefinementPatch.extend({
  componentUpdates: z.array(z.looseObject({ id: z.string() })),
  newComponents: z.array(z.looseObject({ id: z.string() })),
  annotationUpdates: z.array(z.unknown()),
  newAnnotations: z.array(z.unknown()),
});

export function applyRefinementPatch(spec: ScreenSpec, patchInput: unknown, requestedTargetIds: string[]): PatchResult {
  const parsed = LoosePatch.safeParse(patchInput);
  if (!parsed.success) {
    throw new SpecValidationError("The refinement response was malformed.", formatIssues(parsed.error));
  }
  const patch = parsed.data;
  const warnings: string[] = [];
  const index = indexComponents(spec);

  const declared = [...patch.scope.targetIds, ...patch.scope.dependentIds].filter((id) => index.has(id));
  const allowed = new Set<string>([...requestedTargetIds, ...declared]);
  // Descendants of a target may be restructured along with it.
  for (const id of requestedTargetIds) for (const d of descendantIds(spec, id)) allowed.add(d);

  const next = structuredClone(spec);
  const changedIds: string[] = [];
  const addedIds: string[] = [];

  for (const update of patch.componentUpdates) {
    if (!index.has(update.id)) {
      warnings.push(`Update for unknown component "${update.id}" was treated as a new component.`);
      patch.newComponents.push(update);
      continue;
    }
    if (!allowed.has(update.id)) {
      warnings.push(`Ignored an out-of-scope change to "${update.id}" to preserve unrelated content.`);
      continue;
    }
    const valid = validateComponent(update, warnings);
    if (!valid.valid) continue;
    const i = next.components.findIndex((c) => c.id === update.id);
    if (stableStringify(next.components[i]) !== stableStringify(valid.component)) {
      next.components[i] = valid.component;
      changedIds.push(update.id);
    }
  }

  for (const added of patch.newComponents) {
    if (next.components.some((c) => c.id === added.id)) {
      warnings.push(`New component id "${added.id}" collided with an existing id and was skipped.`);
      continue;
    }
    const valid = validateComponent(added, warnings);
    if (!valid.valid) continue;
    next.components.push(valid.component);
    addedIds.push(added.id);
  }

  const removed = new Set<string>();
  for (const id of patch.removedComponentIds) {
    if (!index.has(id)) continue;
    if (!allowed.has(id)) {
      warnings.push(`Ignored an out-of-scope removal of "${id}".`);
      continue;
    }
    removed.add(id);
  }
  if (removed.size) {
    next.components = next.components.filter((c) => !removed.has(c.id)).map((c) => stripRefs(c, removed));
    next.rootIds = next.rootIds.filter((id) => !removed.has(id));
  }

  // New non-dialog components must be placed somewhere visible.
  const referenced = new Set([...next.rootIds, ...next.components.flatMap(childIdsOf)]);
  for (const id of addedIds) {
    const c = next.components.find((x) => x.id === id)!;
    if (c.type === "dialog" || referenced.has(id)) continue;
    const anchor = requestedTargetIds[0];
    const parentId = anchor ? findParentId(next, anchor) : null;
    const parent = parentId ? next.components.find((x) => x.id === parentId) : null;
    if (parent && parent.children) {
      parent.children.splice(parent.children.indexOf(anchor) + 1, 0, id);
      if (!changedIds.includes(parent.id)) changedIds.push(parent.id);
    } else {
      next.rootIds.push(id);
    }
    warnings.push(`New component "${id}" had no placement; it was inserted next to the selected component.`);
  }

  // Annotations (updates and additions are both upserts by id)
  const annIndex = new Map(next.annotations.map((a, i) => [a.id, i]));
  for (const raw of [...patch.annotationUpdates, ...patch.newAnnotations]) {
    const a = Annotation.safeParse(raw);
    if (!a.success) {
      warnings.push("A malformed annotation in the refinement was skipped.");
      continue;
    }
    const i = annIndex.get(a.data.id);
    if (i === undefined) {
      annIndex.set(a.data.id, next.annotations.length);
      next.annotations.push(a.data);
    } else next.annotations[i] = a.data;
  }
  const removedAnn = new Set(patch.removedAnnotationIds);
  next.annotations = next.annotations.filter((a) => !removedAnn.has(a.id) && !removed.has(a.elementId));

  for (const text of patch.newAssumptions) {
    next.assumptions.push({ id: `assumption-${Date.now().toString(36)}-${next.assumptions.length + 1}`, text });
  }

  const normalized = normalizeSpec(next);
  const removedIds = [...removed];
  return {
    spec: normalized.spec,
    changedIds,
    addedIds,
    removedIds,
    affectedIds: [...new Set([...changedIds, ...addedIds])],
    warnings: [...warnings, ...normalized.warnings],
  };
}

/* ------------------------------------------------------------------ */
/* Diffing                                                             */
/* ------------------------------------------------------------------ */

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export interface ComponentChange {
  id: string;
  name: string;
  type: string;
  change: "added" | "removed" | "modified";
  fields: string[];
}

export interface SpecDiff {
  components: ComponentChange[];
  annotations: { added: string[]; removed: string[]; modified: string[] };
  themeChanged: boolean;
  layoutChanged: boolean;
}

/** Which top-level parts of a component differ ("props.label", "states", ...). */
function changedFields(a: Component, b: Component): string[] {
  const fields: string[] = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (k === "annotationIds") continue;
    const av = (a as Record<string, unknown>)[k];
    const bv = (b as Record<string, unknown>)[k];
    if (k === "props" && av && bv && typeof av === "object" && typeof bv === "object") {
      const pk = new Set([...Object.keys(av), ...Object.keys(bv)]);
      for (const p of pk) {
        if (stableStringify((av as Record<string, unknown>)[p]) !== stableStringify((bv as Record<string, unknown>)[p]))
          fields.push(`props.${p}`);
      }
    } else if (stableStringify(av) !== stableStringify(bv)) {
      fields.push(k);
    }
  }
  return fields;
}

export function diffSpecs(from: ScreenSpec, to: ScreenSpec): SpecDiff {
  const a = indexComponents(from);
  const b = indexComponents(to);
  const components: ComponentChange[] = [];
  for (const [id, cb] of b) {
    const ca = a.get(id);
    if (!ca) components.push({ id, name: cb.name, type: cb.type, change: "added", fields: [] });
    else {
      const fields = changedFields(ca, cb);
      if (fields.length) components.push({ id, name: cb.name, type: cb.type, change: "modified", fields });
    }
  }
  for (const [id, ca] of a) {
    if (!b.has(id)) components.push({ id, name: ca.name, type: ca.type, change: "removed", fields: [] });
  }
  const aa = new Map(from.annotations.map((x) => [x.id, stableStringify(x)]));
  const ab = new Map(to.annotations.map((x) => [x.id, stableStringify(x)]));
  return {
    components,
    annotations: {
      added: [...ab.keys()].filter((k) => !aa.has(k)),
      removed: [...aa.keys()].filter((k) => !ab.has(k)),
      modified: [...ab.keys()].filter((k) => aa.has(k) && aa.get(k) !== ab.get(k)),
    },
    themeChanged: stableStringify(from.theme) !== stableStringify(to.theme),
    layoutChanged: stableStringify(from.rootIds) !== stableStringify(to.rootIds),
  };
}

/** Compact JSON for prompts: drops derived fields to save tokens. */
export function specForPrompt(spec: ScreenSpec): string {
  return JSON.stringify(spec, (k, v) => (k === "annotationIds" ? undefined : v));
}
