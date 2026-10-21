/**
 * Server-side export: reads the runtime bundle and renderer sources from disk
 * and hands them to the shared builders in ../export-builders.
 */
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ScreenSpec } from "../schema";
import { buildReactZipFromSources, PROTOTYPE_FILES, renderStandaloneHtml, type ExportMeta, type PackageVersions } from "../export-builders";

export type { ExportMeta };

const root = process.cwd();
const read = (rel: string) => fs.readFile(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ root, rel), "utf8");

const RUNTIME = "public/runtime/prototype-runtime.js";
const RUNTIME_SOURCES = ["src/prototype", "src/lib/schema.ts", "src/lib/spec-tree.ts"];

async function newestMtime(rel: string): Promise<number> {
  const full = path.join(/*turbopackIgnore: true*/ root, rel);
  const stat = await fs.stat(/*turbopackIgnore: true*/ full);
  if (!stat.isDirectory()) return stat.mtimeMs;
  const entries = await fs.readdir(/*turbopackIgnore: true*/ full);
  const times = await Promise.all(entries.map((e) => newestMtime(path.join(rel, e))));
  return Math.max(stat.mtimeMs, ...times);
}

/** Rebuild the standalone runtime bundle if it's missing or older than its sources (e.g. edited during `npm run dev`). */
async function ensureRuntime(): Promise<string> {
  const built = await fs.stat(/*turbopackIgnore: true*/ path.join(root, RUNTIME)).then((s) => s.mtimeMs).catch(() => 0);
  const sources = await Promise.all(RUNTIME_SOURCES.map((s) => newestMtime(s).catch(() => 0)));
  if (!built || Math.max(...sources) > built) {
    try {
      await promisify(execFile)(process.execPath, ["scripts/build-runtime.mjs"], { cwd: root, timeout: 60_000 });
    } catch {
      if (!built) throw new Error("The prototype runtime bundle is missing. Run `npm run build:runtime` and try again.");
    }
  }
  return read(RUNTIME);
}

export async function buildStandaloneHtml(spec: ScreenSpec, meta: ExportMeta): Promise<string> {
  const [runtime, css] = await Promise.all([ensureRuntime(), read("src/prototype/prototype.css")]);
  return renderStandaloneHtml(spec, meta, runtime, css);
}

export async function buildReactZip(spec: ScreenSpec, meta: ExportMeta): Promise<Uint8Array> {
  const pkg = JSON.parse(await read("package.json")) as PackageVersions;
  const sources = Object.fromEntries(await Promise.all(PROTOTYPE_FILES.map(async (f) => [f, await read(f)] as const)));
  return buildReactZipFromSources(spec, meta, sources, pkg);
}
