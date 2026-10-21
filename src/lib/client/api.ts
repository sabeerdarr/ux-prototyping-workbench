/** Browser-side API client for the workbench's server routes. */
import type { Progress } from "../ai/types";
import type { Project, ProjectSummary, ProviderInfo } from "../schema";

/**
 * The static hosted demo has no server, so API calls are answered in the
 * browser by local-backend (loaded only in that build).
 */
const STATIC_DEMO = process.env.NEXT_PUBLIC_STATIC_DEMO === "1";

async function appFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!STATIC_DEMO) return fetch(url, init);
  const { localFetch } = await import("./local-backend");
  return localFetch(url, init);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean,
    public details?: string[],
  ) {
    super(message);
  }
}

export interface ProviderStatus {
  active: ProviderInfo;
  anthropicConfigured: boolean;
  claudeDesign: { available: false; reason: string };
}

/**
 * POST to a streaming endpoint and read NDJSON progress events until the
 * final result. Throws ApiError for error events and HTTP failures.
 */
export async function streamRequest<T>(url: string, body: unknown, onProgress: (p: Progress) => void, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await appFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new ApiError("Cancelled.", "cancelled", true);
    throw new ApiError("Couldn't reach the workbench server. Is `npm run dev` still running?", "network", true);
  }
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => null)) as { message?: string; code?: string; retryable?: boolean; details?: string[] } | null;
    throw new ApiError(data?.message ?? `Request failed (${res.status}).`, data?.code ?? "http", data?.retryable ?? res.status >= 500, data?.details);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const evt = JSON.parse(line) as
          | ({ type: "progress" } & Progress)
          | { type: "result"; data: T }
          | { type: "error"; code: string; message: string; retryable: boolean; details?: string[] };
        if (evt.type === "progress") onProgress(evt);
        else if (evt.type === "result") return evt.data;
        else throw new ApiError(evt.message, evt.code, evt.retryable, evt.details);
      }
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if ((err as Error).name === "AbortError") throw new ApiError("Cancelled.", "cancelled", true);
    throw new ApiError("The connection to the server was interrupted.", "network", true);
  }
  throw new ApiError("The server closed the connection before finishing.", "network", true);
}

export async function fetchProviderStatus(): Promise<ProviderStatus> {
  const res = await appFetch("/api/provider", { cache: "no-store" });
  return res.json();
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const res = await appFetch("/api/projects", { cache: "no-store" });
  if (!res.ok) throw new ApiError("Couldn't load projects.", "http", true);
  return (await res.json()).projects;
}

export async function loadProject(id: string): Promise<Project | null> {
  const res = await appFetch(`/api/projects/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError("Couldn't load the project.", "http", true);
  return (await res.json()).project;
}

export async function saveProject(project: Project): Promise<void> {
  const res = await appFetch(`/api/projects/${encodeURIComponent(project.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project }),
  });
  if (!res.ok) throw new ApiError("Couldn't save the project.", "http", true);
}

export async function deleteProject(id: string): Promise<void> {
  const res = await appFetch(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new ApiError("Couldn't delete the project.", "http", true);
}

export async function downloadExport(kind: "html" | "react", body: unknown, filename: string) {
  const res = await appFetch(`/api/export/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(data?.message ?? "Export failed.", "http", true);
  }
  downloadBlob(await res.blob(), filename);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
