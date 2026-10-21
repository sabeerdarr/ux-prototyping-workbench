// Bundles the prototype renderer into a single browser script used by the
// standalone HTML export (public/runtime/prototype-runtime.js).
import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";

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
console.log("Built public/runtime/prototype-runtime.js");
