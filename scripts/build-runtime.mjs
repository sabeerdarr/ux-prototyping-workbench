// Bundles the prototype renderer into a single browser script used by the
// standalone HTML export (public/runtime/prototype-runtime.js), and writes the
// renderer sources used by the React export in the static hosted demo
// (public/runtime/react-template.json).
import { build } from "esbuild";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";

// Keep in sync with PROTOTYPE_FILES in src/lib/export-builders.ts.
const PROTOTYPE_FILES = [
  "src/prototype/components.tsx",
  "src/prototype/icons.tsx",
  "src/prototype/renderer.tsx",
  "src/prototype/runtime.tsx",
  "src/prototype/prototype.css",
  "src/lib/schema.ts",
  "src/lib/spec-tree.ts",
];

await mkdir("public/runtime", { recursive: true });
await build({
  entryPoints: ["src/prototype/standalone.tsx"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  outfile: "public/runtime/prototype-runtime.js",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
await copyFile("src/prototype/prototype.css", "public/runtime/prototype.css");

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const sources = Object.fromEntries(await Promise.all(PROTOTYPE_FILES.map(async (f) => [f, await readFile(f, "utf8")])));
await writeFile(
  "public/runtime/react-template.json",
  JSON.stringify({ sources, pkg: { dependencies: pkg.dependencies, devDependencies: pkg.devDependencies } }),
);
console.log("Built public/runtime (prototype-runtime.js, prototype.css, react-template.json)");
