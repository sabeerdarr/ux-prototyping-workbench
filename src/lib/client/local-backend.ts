/**
 * In-browser stand-in for the server API, used only by the static hosted demo
 * (NEXT_PUBLIC_STATIC_DEMO=1, e.g. GitHub Pages). It answers the same routes
 * with the demo provider (no AI), stores projects in localStorage, and builds
 * exports client-side. Responses use the same shapes as the real routes.
 */
import { annotateWith, compareWith, generateWith, refineWith, reviewWith } from "../ai/operations";
import { ProviderError, type Progress } from "../ai/types";
import { DemoProvider } from "../demo/demo-provider";
import { buildReactZipFromSources, renderStandaloneHtml, type PackageVersions } from "../export-builders";
import { normalizeSpec } from "../spec-ops";
import type { Project, ProjectSummary } from "../schema";

const provider = new DemoProvider();
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const KEY = "wb:project:";

const json = (data: unknown, status = 200) => Response.json(data, { status });

function stream(task: (emit: (p: Progress) => void) => Promise<unknown>): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (e: unknown) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        send({ type: "result", data: await task((p) => send({ type: "progress", ...p })) });
      } catch (err) {
        if (err instanceof ProviderError) send({ type: "error", code: err.code, message: err.message, retryable: err.retryable, details: err.details });
        else send({ type: "error", code: "unknown", message: err instanceof Error ? err.message : "Something went wrong.", retryable: true });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson" } });
}

function readProject(id: string): Project | null {
  try {
    const raw = localStorage.getItem(KEY + id);
    return raw ? (JSON.parse(raw) as Project) : null;
  } catch {
    return null;
  }
}

function listProjects(): ProjectSummary[] {
  const out: ProjectSummary[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(KEY)) continue;
      const p = readProject(k.slice(KEY.length));
      if (p)
        out.push({ id: p.id, name: p.name, updatedAt: p.updatedAt, status: p.status, versionCount: p.versions.length, provider: p.provider, approved: Boolean(p.approvedVersionId) });
    }
  } catch {
    // storage unavailable: behave as an empty list
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function asset(name: string): Promise<string> {
  const res = await fetch(`${BASE}/runtime/${name}`);
  if (!res.ok) throw new Error(`Couldn't load ${name} for export.`);
  return res.text();
}

export async function localFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
  const path = url.split("?")[0];

  if (path === "/api/provider") {
    return json({
      active: provider.info,
      anthropicConfigured: false,
      claudeDesign: { available: false, reason: "This is the static hosted demo: there is no server, so no AI provider (Anthropic API or Claude Design) is connected." },
    });
  }
  if (path === "/api/projects") return json({ projects: listProjects() });

  const projectMatch = path.match(/^\/api\/projects\/([a-z0-9-]{6,64})$/);
  if (projectMatch) {
    const id = projectMatch[1];
    if (method === "GET") {
      const project = readProject(id);
      return project ? json({ project }) : json({ message: "Project not found." }, 404);
    }
    if (method === "PUT") {
      const project = { ...(body.project as Project), updatedAt: new Date().toISOString() };
      try {
        localStorage.setItem(KEY + id, JSON.stringify(project));
      } catch {
        return json({ message: "Browser storage is full or unavailable." }, 507);
      }
      return json({ updatedAt: project.updatedAt });
    }
    if (method === "DELETE") {
      localStorage.removeItem(KEY + id);
      return new Response(null, { status: 204 });
    }
  }

  switch (path) {
    case "/api/generate":
      if (!body?.brief || body.brief.description.trim().length < 10 || body.brief.tone.trim().length < 3)
        return json({ type: "error", code: "bad_request", message: "Add a screen description (at least a sentence) and a tone of voice.", retryable: false }, 400);
      return stream((emit) => generateWith(provider, body.brief, emit));
    case "/api/refine": {
      const args = { ...body };
      delete args.projectId;
      return stream((emit) => refineWith(provider, args, emit));
    }
    case "/api/annotations":
      return stream((emit) => annotateWith(provider, body, emit));
    case "/api/compare":
      return stream((emit) => compareWith(provider, body, emit));
    case "/api/review":
      return stream((emit) => reviewWith(provider, body, emit));
    case "/api/export/html": {
      try {
        const [runtime, css] = await Promise.all([asset("prototype-runtime.js"), asset("prototype.css")]);
        return new Response(renderStandaloneHtml(normalizeSpec(body.spec).spec, body.meta, runtime, css), { headers: { "Content-Type": "text/html" } });
      } catch (err) {
        return json({ message: err instanceof Error ? err.message : "Export failed." }, 500);
      }
    }
    case "/api/export/react": {
      try {
        const template = JSON.parse(await asset("react-template.json")) as { sources: Record<string, string>; pkg: PackageVersions };
        const zip = buildReactZipFromSources(normalizeSpec(body.spec).spec, body.meta, template.sources, template.pkg);
        return new Response(zip as BodyInit, { headers: { "Content-Type": "application/zip" } });
      } catch (err) {
        return json({ message: err instanceof Error ? err.message : "Export failed." }, 500);
      }
    }
  }
  return json({ message: `Not available in the hosted demo: ${method} ${path}` }, 404);
}
