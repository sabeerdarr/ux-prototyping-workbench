/**
 * Pure project/version-history operations. Versions are never deleted:
 * undo/redo move a pointer between versions, and restoring an old version
 * creates a new version that copies its spec, interactions and annotations.
 */
import type { BriefInput, Project, ProviderInfo, RefinementRecord, ScreenSpec, Version } from "./schema";
import { diffSpecs } from "./spec-ops";

export const uid = (prefix = "") =>
  `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function newProject(brief: BriefInput, name?: string): Project {
  const now = new Date().toISOString();
  return {
    id: uid("p-"),
    name: name?.trim() || deriveName(brief.description),
    createdAt: now,
    updatedAt: now,
    brief,
    status: "draft",
    lastError: null,
    provider: null,
    versions: [],
    currentVersionId: null,
    undoStack: [],
    redoStack: [],
    approvedVersionId: null,
    refinementLog: [],
  };
}

export function deriveName(description: string): string {
  const cleaned = description
    .replace(/^(create|design|build|make)\s+(a|an|the)\s+/i, "")
    .split(/[.,\n]/)[0]
    .trim();
  const short = cleaned.split(/\s+/).slice(0, 6).join(" ");
  return short ? short[0].toUpperCase() + short.slice(1) : "Untitled screen";
}

export const currentVersion = (p: Project | null): Version | null =>
  p?.versions.find((v) => v.id === p.currentVersionId) ?? null;

export const versionById = (p: Project, id: string | null): Version | null => p.versions.find((v) => v.id === id) ?? null;

export function appendVersion(
  p: Project,
  v: { kind: Version["kind"]; label: string; spec: ScreenSpec; provider: ProviderInfo; refinement?: RefinementRecord; restoredFrom?: number; warnings?: string[] },
): Project {
  const version: Version = {
    id: uid("v-"),
    number: p.versions.length + 1,
    createdAt: new Date().toISOString(),
    parentId: p.currentVersionId,
    ...v,
  };
  return {
    ...p,
    versions: [...p.versions, version],
    currentVersionId: version.id,
    undoStack: p.currentVersionId ? [...p.undoStack, p.currentVersionId] : p.undoStack,
    redoStack: [],
    provider: v.provider,
    status: "ready",
    lastError: null,
  };
}

export function undo(p: Project): Project {
  if (!p.undoStack.length || !p.currentVersionId) return p;
  const prev = p.undoStack[p.undoStack.length - 1];
  return { ...p, currentVersionId: prev, undoStack: p.undoStack.slice(0, -1), redoStack: [...p.redoStack, p.currentVersionId] };
}

export function redo(p: Project): Project {
  if (!p.redoStack.length || !p.currentVersionId) return p;
  const next = p.redoStack[p.redoStack.length - 1];
  return { ...p, currentVersionId: next, redoStack: p.redoStack.slice(0, -1), undoStack: [...p.undoStack, p.currentVersionId] };
}

export function restoreVersion(p: Project, versionId: string): Project {
  const v = versionById(p, versionId);
  if (!v) return p;
  return appendVersion(p, {
    kind: "restore",
    label: `Restored v${v.number}`,
    spec: structuredClone(v.spec),
    provider: v.provider,
    restoredFrom: v.number,
  });
}

/** Component ids added or modified in a version relative to its parent. */
export function changedInVersion(p: Project, v: Version | null): string[] {
  if (!v?.parentId) return [];
  const parent = versionById(p, v.parentId);
  if (!parent) return [];
  return diffSpecs(parent.spec, v.spec)
    .components.filter((c) => c.change !== "removed")
    .map((c) => c.id);
}

export function annotationsChangedInVersion(p: Project, v: Version | null): Set<string> {
  if (!v?.parentId) return new Set();
  const parent = versionById(p, v.parentId);
  if (!parent) return new Set();
  const d = diffSpecs(parent.spec, v.spec).annotations;
  return new Set([...d.added, ...d.modified]);
}
