# UX Prototyping Workbench

An AI-assisted design workbench. Describe a screen and its tone of voice, and it generates a **working, interactive prototype**. Alongside the prototype you get **annotations explaining each design decision**. You can then refine individual components in plain language without regenerating the whole screen.

- **Generate**: a description plus a tone of voice produce a validated screen spec, which renders as real React components with working tabs, dialogs, menus, forms, search, and empty/loading/error/success states.
- **Inspect**: annotations are linked to elements by stable ids. Select an annotation to highlight its element (switching tabs or opening dialogs if needed). Select an element to read its rationale.
- **Refine**: select a component, pick a focus (layout, hierarchy, microcopy, tone, interaction, accessibility) and/or write an instruction. Only that component and the dependents the AI declares can change. Anything else it tries to touch is rejected and reported.
- **Explain**: every refinement records what changed, why, the expected UX impact, trade-offs, and new assumptions, and updates the affected annotations.
- **Compare and restore**: full version history with side-by-side comparison, per-component diffs, undo/redo, preview, and restore.
- **Finalize**: approve a version and export it as standalone HTML, a React + TypeScript (Vite) project, design rationale (Markdown or JSON), or the raw spec.

## Quick start

Requires Node.js 20+ (tested on Node 24).

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000.

**Without an API key the app runs in demo mode.** Generate loads a hand-built example (a nonprofit grants dashboard), and a few scripted, rule-based refinements are available. Demo content is labeled "Demo mode · no AI" and "Demo content" throughout. It is never presented as AI output.

To enable AI generation, create `.env.local`:

```bash
cp .env.example .env.local
```

Then set `ANTHROPIC_API_KEY` and restart the dev server.

## Environment variables

All variables are read **on the server only**. The key never reaches the browser.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | (unset → demo mode) | Anthropic API key |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Model used for every AI task |
| `ANTHROPIC_EFFORT` | `medium` | `low` / `medium` / `high` / `xhigh` / `max`. Higher is slower but more thorough |
| `ANTHROPIC_TIMEOUT_MS` | `300000` | Per-request timeout (the SDK also retries 429/5xx twice) |
| `ANTHROPIC_FALLBACKS` | on | Server-side refusal fallback (`fallbacks: "default"`). Set `off` to disable |
| `ANTHROPIC_BASE_URL` | Anthropic API | Standard SDK override (used by the adapter tests) |
| `DESIGN_PROVIDER` | auto | Set `demo` to force demo mode even with a key |
| `WORKBENCH_DATA_DIR` | `./data/projects` | Where projects are saved |

## Providers, and why this isn't Claude Design

**Claude Design** is available inside Claude Code (`/design`, `/design-sync`) and on claude.ai. It works through your claude.ai login, and its Claude Code integration syncs design-system components. **There is no documented public API that a running web app can call to generate designs with Claude Design**, so this app doesn't call private endpoints or pretend to.

Instead, generation runs through a **modular provider adapter** (`src/lib/ai/`) that uses the official Anthropic SDK:

- `types.ts`: the `DesignProvider` interface (generate, refine, annotate, compare, review).
- `anthropic.ts`: Anthropic API provider: streaming, adaptive thinking, structured outputs (JSON Schema from the Zod contract) with automatic fallback to prompt-plus-validation if the schema is rejected, one repair round for invalid output, refusal and truncation handling, and typed error mapping.
- `../demo/demo-provider.ts`: demo provider (no AI).
- `service.ts`: picks the provider from env, applies validation and selective patching.

The active provider is always shown in the top bar. Click it for details. If a supported Claude Design integration appears, add it as another `DesignProvider`; nothing else needs to change.

## Architecture

```
src/
  app/api/            Route handlers (all AI calls are server-side)
    generate, refine, annotations, compare, review   → NDJSON progress streams
    projects, projects/[id]                          → JSON-file persistence
    export/html, export/react                        → downloadable exports
  lib/
    schema.ts         Zod contract: 31 allowlisted component types, actions, states,
                      annotations, refinement patches, review/compare results, project model
    spec-ops.ts       Validation of untrusted output, normalization, selective patching, diffing
    prompts/          The 5 prompts: generation, refinement, annotations, comparison, review
    ai/               Provider adapter (see above)
    rule-review.ts    Deterministic accessibility/interaction checks (no AI)
    project-ops.ts    Version history: append, undo/redo pointers, restore-as-new-version
    rationale.ts      Markdown/JSON rationale export
    server/           Store, export builders, streaming helpers
  prototype/          The trusted renderer (also shipped in exports)
    renderer.tsx      Spec → React via the registry; inspection, highlighting, reveal
    components.tsx    One React implementation per component type
    runtime.tsx       Interactions as data: dialogs, tabs, toasts, state changes, removal
    prototype.css     Plain CSS scoped to .pt-root, responsive via container queries
  components/         Workbench UI (brief, canvas, inspector, history, review, projects)
```

### Safety model

- The model returns **data, not code**. Every component type, prop and interaction is allowlisted in `schema.ts` and rendered by `src/prototype/components.tsx`. There is no `eval`, `Function`, or `dangerouslySetInnerHTML` of model output.
- All output is validated. A component that fails validation becomes a visible "omitted" notice rather than crashing the screen. If more than 30% fail, the model is asked to repair its output. Dangling references, duplicate ids, bad colors and out-of-range numbers are normalized.
- **Refinements are patches.** `applyRefinementPatch` only accepts changes to the selected component, its descendants, and dependents the model explicitly declares with a reason. Out-of-scope edits are dropped and listed in the "What changed" panel.

### Version model

Versions are never deleted. Undo/redo move a pointer between versions. Restoring creates a new version that copies the old spec, interactions and annotations together. Approval is tied to a specific version.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (also builds the standalone prototype runtime first) |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Core logic tests: validation, selective patching, diffing, demo provider |
| `npm run test:adapter` | Runs the real Anthropic adapter and service against a local mock of the Messages API (no key needed) |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run build:runtime` | Rebuilds `public/runtime/prototype-runtime.js` for HTML export (export also rebuilds it automatically if stale) |

## Exports

- **Standalone HTML**: one file containing the spec, the prototype runtime and CSS. It is fully interactive and works offline.
- **React + TypeScript**: a Vite project with the renderer source and `spec.json`. Run `npm install && npm run dev`.
- **Rationale (Markdown/JSON)**: brief, tone interpretation, assumptions, all annotations, and refinement history.

Exports are **prototypes, not production code**: data is hard-coded, interactions are simulated, and there's no persistence or auth. Every export says so.

## Limitations

- **Persistence** is one JSON file per project in `./data/projects`, for a single local user. There are no accounts, no multi-user sync, and no locking across multiple server processes. Back up or commit `data/` if you need it. It is git-ignored by default.
- **Layouts are compositional**: screens are built from the 31 registry components. Highly custom visuals (illustrations, bespoke charts, animation) are approximated. Images render as labeled placeholders.
- **Demo mode** can't do free-form refinement, annotation refresh, or AI review/comparison. It says so instead of faking results.
- **Live AI calls aren't covered by automated tests.** `npm run test:adapter` verifies the request/response handling against a mock, and real model quality depends on the model and effort setting. A full screen typically takes 1–3 minutes at the default effort.
- Structured outputs: the full screen schema is large. If the API rejects it for a model, the adapter falls back to prompt-described JSON plus strict local validation for the rest of the server's lifetime.
