/**
 * Local JSON-file persistence: one file per project under ./data/projects.
 * Suitable for a single-user local MVP; see README for limitations.
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Project, ProjectSummary } from "../schema";

const DATA_DIR = process.env.WORKBENCH_DATA_DIR || path.join(process.cwd(), "data", "projects");
const ID = /^[a-z0-9-]{6,64}$/;

/** Structural check on save: enough to reject garbage without re-validating every spec. */
export const ProjectShape = z.looseObject({
  id: z.string().regex(ID),
  name: z.string().max(200),
  brief: z.looseObject({ description: z.string(), tone: z.string() }),
  versions: z.array(z.looseObject({ id: z.string(), number: z.number(), spec: z.looseObject({ components: z.array(z.unknown()) }) })),
  currentVersionId: z.string().nullable(),
});

function fileFor(id: string) {
  if (!ID.test(id)) throw new Error("Invalid project id");
  return path.join(/*turbopackIgnore: true*/ DATA_DIR, `${id}.json`);
}

async function ensureDir() {
  await fs.mkdir(/*turbopackIgnore: true*/ DATA_DIR, { recursive: true });
}

export async function listProjects(): Promise<ProjectSummary[]> {
  await ensureDir();
  const files = (await fs.readdir(/*turbopackIgnore: true*/ DATA_DIR)).filter((f) => f.endsWith(".json"));
  const out: ProjectSummary[] = [];
  for (const f of files) {
    try {
      const p = JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ DATA_DIR, f), "utf8")) as Project;
      out.push({
        id: p.id,
        name: p.name,
        updatedAt: p.updatedAt,
        status: p.status,
        versionCount: p.versions.length,
        provider: p.provider,
        approved: Boolean(p.approvedVersionId),
      });
    } catch {
      // skip unreadable files rather than failing the whole list
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string): Promise<Project | null> {
  try {
    return JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ fileFor(id), "utf8")) as Project;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function saveProject(project: Project): Promise<Project> {
  await ensureDir();
  const next = { ...project, updatedAt: new Date().toISOString() };
  const file = fileFor(project.id);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(/*turbopackIgnore: true*/ tmp, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(/*turbopackIgnore: true*/ tmp, file);
  return next;
}

export async function deleteProject(id: string): Promise<boolean> {
  try {
    await fs.unlink(/*turbopackIgnore: true*/ fileFor(id));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}
