"use client";
/**
 * All workbench state and actions: project lifecycle, AI jobs, selection,
 * version navigation, and autosave.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Progress } from "@/lib/ai/types";
import {
  ApiError,
  deleteProject as apiDelete,
  fetchProviderStatus,
  loadProject,
  saveProject,
  streamRequest,
  type ProviderStatus,
} from "@/lib/client/api";
import {
  annotationsChangedInVersion,
  appendVersion,
  changedInVersion,
  currentVersion,
  newProject,
  redo as redoOp,
  restoreVersion,
  undo as undoOp,
  versionById,
} from "@/lib/project-ops";
import type { BriefInput, Project, ProviderInfo, QuickAction, RefinementRecord, ReviewFinding, ScreenSpec } from "@/lib/schema";
import type { RevealRequest } from "@/prototype/renderer";

export type JobKind = "generate" | "refine" | "review" | "annotate";

type RefineArgs = { instruction: string; quickAction?: QuickAction; targetIds?: string[] };

export interface Job {
  kind: JobKind;
  progress: Progress;
  startedAt: number;
}

export interface WorkbenchError {
  kind: JobKind | "load" | "save" | "export";
  message: string;
  code: string;
  retryable: boolean;
  details?: string[];
}

export interface ReviewState {
  versionId: string;
  rules: ReviewFinding[];
  ai: { summary: string; findings: ReviewFinding[] } | null;
  provider: ProviderInfo;
}

const LAST_PROJECT_KEY = "wb:lastProject";

function safeStorage(fn: () => void) {
  try {
    fn();
  } catch {
    // storage unavailable (private mode); only a convenience
  }
}

export function useWorkbench() {
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<RevealRequest | null>(null);
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<WorkbenchError | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [review, setReview] = useState<ReviewState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const retryRef = useRef<(() => void) | null>(null);
  const jobRef = useRef<Job | null>(null);
  const skipSave = useRef(true);
  // Latest action implementations, so retry closures never capture stale state.
  const actions = useRef<{ generate: (b: BriefInput) => Promise<void>; refine: (a: RefineArgs) => Promise<void>; runReview: () => Promise<void>; refreshAnnotations: () => Promise<void> } | null>(null);

  /* ---------- boot ---------- */
  useEffect(() => {
    fetchProviderStatus().then(setProvider).catch(() => setProvider(null));
    const url = new URL(window.location.href);
    let id = url.searchParams.get("project");
    if (!id) safeStorage(() => (id = localStorage.getItem(LAST_PROJECT_KEY)));
    if (!id) {
      // Nothing to restore; finishing the boot here is intentional.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    loadProject(id)
      .then((p) => {
        skipSave.current = true;
        if (p) {
          // A job can't survive a reload; don't leave the project stuck in a busy state.
          if (p.status === "generating" || p.status === "refining") p.status = p.versions.length ? "ready" : "draft";
          setProject(p);
        }
      })
      .catch(() => setError({ kind: "load", message: "Couldn't open the last project.", code: "load", retryable: false }))
      .finally(() => setLoading(false));
  }, []);

  /* ---------- autosave ---------- */
  useEffect(() => {
    if (!project) return;
    safeStorage(() => localStorage.setItem(LAST_PROJECT_KEY, project.id));
    const url = new URL(window.location.href);
    if (url.searchParams.get("project") !== project.id) {
      url.searchParams.set("project", project.id);
      window.history.replaceState(null, "", url);
    }
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    setSaveState("saving");
    const t = setTimeout(() => {
      saveProject(project)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 350);
    return () => clearTimeout(t);
  }, [project]);

  /* ---------- derived ---------- */
  const version = currentVersion(project);
  const viewVersion = (project && previewVersionId && versionById(project, previewVersionId)) || version;
  const isPreviewing = Boolean(viewVersion && version && viewVersion.id !== version.id);
  const changedIds = useMemo(() => (project && viewVersion ? changedInVersion(project, viewVersion) : []), [project, viewVersion]);
  const changedAnnotations = useMemo(
    () => (project && viewVersion ? annotationsChangedInVersion(project, viewVersion) : new Set<string>()),
    [project, viewVersion],
  );

  /* ---------- jobs ---------- */
  const runJob = useCallback(async <T,>(kind: JobKind, url: string, body: unknown, retry: () => void): Promise<T | null> => {
    if (jobRef.current) return null; // prevent duplicate submissions
    const controller = new AbortController();
    abortRef.current = controller;
    const start: Job = { kind, progress: { stage: "queued", message: "Starting" }, startedAt: Date.now() };
    jobRef.current = start;
    setJob(start);
    setError(null);
    retryRef.current = null;
    try {
      return await streamRequest<T>(
        url,
        body,
        (p) => setJob((j) => (j ? { ...j, progress: { ...j.progress, ...p } } : j)),
        controller.signal,
      );
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError("Something went wrong.", "unknown", true);
      if (e.code !== "cancelled") {
        setError({ kind, message: e.message, code: e.code, retryable: e.retryable, details: e.details });
        retryRef.current = retry;
      }
      return null;
    } finally {
      jobRef.current = null;
      abortRef.current = null;
      setJob(null);
    }
  }, []);

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  const retry = useCallback(() => retryRef.current?.(), []);
  const clearError = useCallback(() => setError(null), []);

  const select = useCallback((id: string | null, opts?: { reveal?: boolean }) => {
    setSelectedId(id);
    if (id && opts?.reveal) setReveal({ id, nonce: Date.now() });
  }, []);

  const generate = useCallback(
    async (brief: BriefInput) => {
      if (jobRef.current) return;
      let base = project;
      if (!base) {
        base = newProject(brief);
        skipSave.current = false;
      } else base = { ...base, brief };
      const working: Project = { ...base, status: "generating", lastError: null };
      setProject(working);
      setPreviewVersionId(null);
      const result = await runJob<{ spec: ScreenSpec; warnings: string[]; provider: ProviderInfo }>(
        "generate",
        "/api/generate",
        { projectId: working.id, brief },
        () => void actions.current?.generate(brief),
      );
      if (!result) {
        setProject((p) => (p && p.id === working.id ? { ...p, status: p.versions.length ? "ready" : "error", lastError: "Generation failed" } : p));
        return;
      }
      setProject((p) => {
        const cur = p && p.id === working.id ? p : working;
        return appendVersion(cur, {
          kind: "generation",
          label: cur.versions.length ? "Regenerated from brief" : "Initial generation",
          spec: result.spec,
          provider: result.provider,
          warnings: result.warnings,
        });
      });
      setSelectedId(null);
      setReview(null);
    },
    [project, runJob],
  );

  const refine = useCallback(
    async (args: RefineArgs) => {
      if (!project || !version || isPreviewing || jobRef.current) return;
      const targetIds = args.targetIds ?? (selectedId ? [selectedId] : []);
      if (!targetIds.length) return;
      const startedFrom = version.id;
      setProject({ ...project, status: "refining" });
      const result = await runJob<{ spec: ScreenSpec; provider: ProviderInfo; record: RefinementRecord }>(
        "refine",
        "/api/refine",
        { projectId: project.id, brief: project.brief, spec: version.spec, targetIds, instruction: args.instruction, quickAction: args.quickAction },
        () => void actions.current?.refine(args),
      );
      const at = new Date().toISOString();
      setProject((p) => {
        if (!p) return p;
        if (!result) {
          return {
            ...p,
            status: "ready",
            refinementLog: [...p.refinementLog, { at, versionId: startedFrom, instruction: args.instruction || args.quickAction || "", targetIds, ok: false }],
          };
        }
        const next = appendVersion(p, {
          kind: "refinement",
          label: result.record.summary.length > 70 ? `${result.record.summary.slice(0, 67)}…` : result.record.summary,
          spec: result.spec,
          provider: result.provider,
          refinement: result.record,
          warnings: result.record.warnings,
        });
        return {
          ...next,
          refinementLog: [...next.refinementLog, { at, versionId: next.currentVersionId, instruction: args.instruction || args.quickAction || "", targetIds, ok: true }],
        };
      });
      if (result) {
        const focus = result.record.affectedIds.includes(targetIds[0]) ? targetIds[0] : (result.record.affectedIds[0] ?? targetIds[0]);
        setSelectedId(focus);
        setReveal({ id: focus, nonce: Date.now() });
      }
    },
    [project, version, isPreviewing, selectedId, runJob],
  );

  const runReview = useCallback(async () => {
    if (!project || !viewVersion) return;
    const v = viewVersion;
    const result = await runJob<{ rules: ReviewFinding[]; ai: { summary: string; findings: ReviewFinding[] } | null; provider: ProviderInfo }>(
      "review",
      "/api/review",
      { projectId: project.id, brief: project.brief, spec: v.spec },
      () => void actions.current?.runReview(),
    );
    if (result) setReview({ versionId: v.id, ...result });
  }, [project, viewVersion, runJob]);

  const refreshAnnotations = useCallback(async () => {
    if (!project || !version || isPreviewing) return;
    const result = await runJob<{ spec: ScreenSpec; warnings: string[]; provider: ProviderInfo }>(
      "annotate",
      "/api/annotations",
      { projectId: project.id, brief: project.brief, spec: version.spec },
      () => void actions.current?.refreshAnnotations(),
    );
    if (result)
      setProject((p) => (p ? appendVersion(p, { kind: "annotations", label: "Refreshed annotations", spec: result.spec, provider: result.provider, warnings: result.warnings }) : p));
  }, [project, version, isPreviewing, runJob]);

  useEffect(() => {
    actions.current = { generate, refine, runReview, refreshAnnotations };
  });

  /* ---------- history ---------- */
  const mutate = useCallback((fn: (p: Project) => Project) => setProject((p) => (p ? fn(p) : p)), []);
  const undo = useCallback(() => {
    setPreviewVersionId(null);
    mutate(undoOp);
  }, [mutate]);
  const redo = useCallback(() => {
    setPreviewVersionId(null);
    mutate(redoOp);
  }, [mutate]);
  const restore = useCallback(
    (versionId: string) => {
      setPreviewVersionId(null);
      mutate((p) => restoreVersion(p, versionId));
    },
    [mutate],
  );
  const preview = useCallback((versionId: string | null) => setPreviewVersionId(versionId), []);
  const approve = useCallback(() => mutate((p) => ({ ...p, approvedVersionId: p.currentVersionId, status: "approved" })), [mutate]);
  const unapprove = useCallback(() => mutate((p) => ({ ...p, approvedVersionId: null, status: "ready" })), [mutate]);
  const rename = useCallback((name: string) => mutate((p) => ({ ...p, name: name.trim() || p.name })), [mutate]);
  const updateBrief = useCallback((brief: BriefInput) => mutate((p) => ({ ...p, brief })), [mutate]);

  /* ---------- projects ---------- */
  const openProject = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const p = await loadProject(id);
      if (p) {
        skipSave.current = true;
        if (p.status === "generating" || p.status === "refining") p.status = p.versions.length ? "ready" : "draft";
        setProject(p);
        setSelectedId(null);
        setPreviewVersionId(null);
        setReview(null);
        setError(null);
      }
    } catch {
      setError({ kind: "load", message: "Couldn't open that project.", code: "load", retryable: false });
    } finally {
      setLoading(false);
    }
  }, []);

  const startNew = useCallback(() => {
    setProject(null);
    setSelectedId(null);
    setPreviewVersionId(null);
    setReview(null);
    setError(null);
    safeStorage(() => localStorage.removeItem(LAST_PROJECT_KEY));
    const url = new URL(window.location.href);
    url.searchParams.delete("project");
    window.history.replaceState(null, "", url);
  }, []);

  const removeProject = useCallback(
    async (id: string) => {
      await apiDelete(id);
      if (project?.id === id) startNew();
    },
    [project, startNew],
  );

  return {
    provider,
    project,
    loading,
    version,
    viewVersion,
    isPreviewing,
    changedIds,
    changedAnnotations,
    selectedId,
    reveal,
    job,
    error,
    saveState,
    review,
    select,
    generate,
    refine,
    runReview,
    refreshAnnotations,
    cancel,
    retry,
    clearError,
    undo,
    redo,
    restore,
    preview,
    approve,
    unapprove,
    rename,
    updateBrief,
    openProject,
    startNew,
    removeProject,
    setError,
  };
}

export type Workbench = ReturnType<typeof useWorkbench>;
