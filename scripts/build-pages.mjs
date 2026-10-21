// Builds the static hosted demo into ./out for GitHub Pages.
// Usage: node scripts/build-pages.mjs [basePath]   (default: /ux-prototyping-workbench)
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const basePath = process.argv[2] ?? process.env.NEXT_PUBLIC_BASE_PATH ?? "/ux-prototyping-workbench";
const env = { ...process.env, NEXT_PUBLIC_STATIC_DEMO: "1", NEXT_PUBLIC_BASE_PATH: basePath };
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run("node", ["scripts/build-runtime.mjs"]);
run("npx", ["next", "build"]);
writeFileSync("out/.nojekyll", "");
console.log(`Static demo built in ./out (basePath "${basePath}")`);
