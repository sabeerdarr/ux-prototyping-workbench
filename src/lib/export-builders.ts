/**
 * Export builders shared by the server routes and the static hosted demo.
 * Artifacts are assembled from the validated spec plus the app's own trusted
 * renderer source; nothing model-generated is executed.
 */
import { zipSync, strToU8 } from "fflate";
import type { ScreenSpec } from "./schema";

export interface ExportMeta {
  projectName: string;
  versionNumber: number;
  versionLabel: string;
  providerLabel: string;
  approved: boolean;
}

/** JSON that is safe to place inside a <script> element. */
const LS = new RegExp(String.fromCharCode(0x2028), "g");
const PS = new RegExp(String.fromCharCode(0x2029), "g");

function scriptSafeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(LS, "\\u2028").replace(PS, "\\u2029");
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** Single-file interactive prototype: spec + runtime bundle + CSS inlined. */
export function renderStandaloneHtml(spec: ScreenSpec, meta: ExportMeta, runtime: string, css: string): string {
  const title = `${spec.title} · ${meta.projectName}`;
  const stamp = new Date().toISOString().slice(0, 10);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
html, body { margin: 0; height: 100%; }
body { font-family: system-ui, sans-serif; background: #f6f6f4; }
.export-banner { font: 12px/1.4 system-ui, sans-serif; background: #1d1d1f; color: #f5f5f7; padding: 8px 14px; display: flex; gap: 12px; justify-content: space-between; flex-wrap: wrap; }
.export-banner strong { font-weight: 600; }
#prototype-root { min-height: calc(100% - 34px); }
${css}
</style>
</head>
<body>
<div class="export-banner" role="note">
  <span><strong>Interactive prototype</strong>, not production code. Data and interactions are simulated.</span>
  <span>${escapeHtml(meta.projectName)} · v${meta.versionNumber}${meta.approved ? " (approved)" : ""} · ${escapeHtml(meta.providerLabel)} · exported ${stamp}</span>
</div>
<div id="prototype-root"></div>
<script>window.__PROTOTYPE_SPEC__ = ${scriptSafeJson(spec)};</script>
<script>${runtime.replace(/<\/script/gi, "<\\/script")}</script>
</body>
</html>
`;
}

export const PROTOTYPE_FILES = [
  "src/prototype/components.tsx",
  "src/prototype/icons.tsx",
  "src/prototype/renderer.tsx",
  "src/prototype/runtime.tsx",
  "src/prototype/prototype.css",
  "src/lib/schema.ts",
  "src/lib/spec-tree.ts",
];

export interface PackageVersions {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

/** Runnable Vite + React + TypeScript project built from the renderer source files. */
export function buildReactZipFromSources(spec: ScreenSpec, meta: ExportMeta, sources: Record<string, string>, pkg: PackageVersions): Uint8Array {
  const slug = meta.projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "prototype";
  const files: Record<string, Uint8Array> = {};
  for (const f of PROTOTYPE_FILES) {
    if (typeof sources[f] !== "string") throw new Error(`Export template is missing ${f}.`);
    files[f] = strToU8(sources[f]);
  }

  files["src/spec.json"] = strToU8(JSON.stringify(spec, null, 2));
  files["src/main.tsx"] = strToU8(`import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { ScreenSpec } from "./lib/schema";
import { PrototypeRenderer } from "./prototype/renderer";
import "./prototype/prototype.css";
import spec from "./spec.json";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrototypeRenderer spec={spec as ScreenSpec} />
  </StrictMode>,
);
`);
  files["index.html"] = strToU8(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(spec.title)}</title>
    <style>html, body, #root { margin: 0; min-height: 100%; }</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`);
  files["package.json"] = strToU8(
    JSON.stringify(
      {
        name: slug,
        private: true,
        version: `0.${meta.versionNumber}.0`,
        type: "module",
        scripts: { dev: "vite", build: "tsc --noEmit && vite build", preview: "vite preview" },
        dependencies: {
          react: pkg.dependencies.react,
          "react-dom": pkg.dependencies["react-dom"],
          "lucide-react": pkg.dependencies["lucide-react"],
          zod: pkg.dependencies.zod,
        },
        devDependencies: {
          "@types/react": pkg.devDependencies["@types/react"],
          "@types/react-dom": pkg.devDependencies["@types/react-dom"],
          "@vitejs/plugin-react": "^5.0.0",
          typescript: pkg.devDependencies.typescript,
          vite: "^7.0.0",
        },
      },
      null,
      2,
    ),
  );
  files["vite.config.ts"] = strToU8(`import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });
`);
  files["tsconfig.json"] = strToU8(
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["DOM", "DOM.Iterable", "ES2022"],
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: true,
          resolveJsonModule: true,
          skipLibCheck: true,
          noEmit: true,
          isolatedModules: true,
        },
        include: ["src"],
      },
      null,
      2,
    ),
  );
  files["README.md"] = strToU8(`# ${spec.title}

Exported from the UX Prototyping Workbench: project **${meta.projectName}**, version ${meta.versionNumber} (${meta.versionLabel})${meta.approved ? ", approved" : ""}.
Generated with: ${meta.providerLabel}.

> **This is a working prototype, not production-ready application code.**
> Data is hard-coded in \`src/spec.json\`, interactions are simulated (no network calls,
> no persistence, no authentication), and the component library is a prototyping registry.
> Use it to review, test and hand off the design, then rebuild it in your production stack.

## Run it

\`\`\`bash
npm install
npm run dev
\`\`\`

## How it's built

- \`src/spec.json\`: the screen specification (components, content, states, interactions, annotations).
- \`src/prototype/renderer.tsx\`: renders the spec through a fixed component registry.
- \`src/prototype/components.tsx\`: React implementations of each allowlisted component type.
- \`src/prototype/runtime.tsx\`: simulated interactions (dialogs, tabs, toasts, state changes).
- \`src/lib/schema.ts\`: the Zod/TypeScript contract for the spec.

Edit \`spec.json\` to change content; edit the components to change how things look.
`);
  return zipSync(files, { level: 6 });
}
