"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { AlertTriangle, Eye, Maximize2, Minimize2, Monitor, MousePointer2, RotateCcw, ScanSearch, Smartphone, Tablet, X } from "lucide-react";
import type { StateKey } from "@/lib/schema";
import { PrototypeRenderer } from "@/prototype/renderer";
import { Button, IconButton, Pill, Segmented, Spinner } from "../ui";
import type { Job, Workbench } from "./use-workbench";

type Device = "desktop" | "tablet" | "mobile";
const DEVICE_WIDTH: Record<Device, number> = { desktop: 1280, tablet: 820, mobile: 390 };
const BEZEL: Record<Device, number> = { desktop: 0, tablet: 10, mobile: 12 };

const STAGE_LABEL: Record<string, string> = {
  queued: "Starting",
  thinking: "Thinking through the design",
  writing: "Writing the specification",
  validating: "Validating the output",
  repairing: "Fixing invalid output",
  applying: "Applying changes",
  demo: "Loading demo content",
};

function useElapsed(job: Job | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!job) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [job]);
  return job ? Math.max(0, Math.round((now - job.startedAt) / 1000)) : 0;
}

function JobStatus({ job, onCancel, title }: { job: Job; onCancel: () => void; title: string }) {
  const elapsed = useElapsed(job);
  const p = job.progress;
  return (
    <div className="w-[340px] rounded-xl border border-wb-line bg-white p-4 shadow-xl" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        <Spinner className="text-wb-accent" />
        {title}
      </div>
      <div className="mt-1 text-[12px] text-wb-ink-2">{STAGE_LABEL[p.stage] ?? p.message}</div>
      <div className="relative mt-3 h-1 overflow-hidden rounded-full bg-black/[0.06]">
        <div className="wb-indeterminate absolute inset-y-0 w-2/5 rounded-full bg-wb-accent" />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-wb-ink-3 tabular-nums">
        <span>
          {elapsed}s{p.chars ? ` · ${(p.chars / 1000).toFixed(1)}k characters` : ""}
          {p.components ? ` · ~${p.components} parts drafted` : ""}
        </span>
        <button type="button" className="font-medium text-wb-ink-2 hover:text-wb-ink" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {job.kind === "generate" && elapsed > 20 && p.stage !== "demo" && (
        <p className="mt-2 text-[11px] leading-snug text-wb-ink-3">A full screen usually takes 1–3 minutes. You can keep this tab open; nothing is lost if it fails.</p>
      )}
    </div>
  );
}

export function ErrorBanner({ wb }: { wb: Workbench }) {
  const [open, setOpen] = useState(false);
  const e = wb.error;
  if (!e) return null;
  const what = { generate: "Generation failed", refine: "Refinement failed", review: "Review failed", annotate: "Annotation refresh failed", load: "Couldn't load", save: "Couldn't save", export: "Export failed" }[e.kind];
  return (
    <div role="alert" className="mx-3 mt-3 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] text-red-900">
      <AlertTriangle size={16} className="mt-px flex-none text-red-600" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div>
          <strong className="font-semibold">{what}.</strong> {e.message}{" "}
          {e.kind === "generate" || e.kind === "refine" ? <span className="text-red-800/80">Your current design and history are unchanged.</span> : null}
        </div>
        {e.details?.length ? (
          <>
            <button type="button" className="mt-1 text-[11.5px] font-semibold underline" onClick={() => setOpen(!open)} aria-expanded={open}>
              {open ? "Hide details" : "Show details"}
            </button>
            {open && (
              <ul className="mt-1 list-disc pl-4 font-mono text-[11px] text-red-800/90">
                {e.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </div>
      {e.retryable && (
        <Button size="xs" variant="secondary" onClick={wb.retry}>
          Retry
        </Button>
      )}
      <IconButton label="Dismiss error" onClick={wb.clearError} className="h-6 w-6">
        <X size={14} />
      </IconButton>
    </div>
  );
}

/**
 * Renders the prototype at the device's real design width and scales it down
 * to fit the canvas, so "Desktop" really is a 1280px layout. The transformed
 * frame also contains the prototype's fixed-position dialogs and toasts.
 */
function DeviceFrame({ device, children }: { device: Device; children: ReactNode }) {
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    // Measure now (ResizeObserver can be delayed in background tabs), then track changes.
    setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const designW = DEVICE_WIDTH[device] + BEZEL[device];
  const scale = size.w ? Math.min(1, size.w / designW) : 1;
  const maxH = device === "mobile" ? 844 : Infinity;
  const height = Math.max(200, Math.min(maxH * scale, size.h) / scale);
  return (
    <div ref={stage} className="relative h-full w-full">
      <div className="mx-auto" style={{ width: designW * scale, height: height * scale }}>
        <div
          className={clsx(
            "wb-device flex flex-col overflow-hidden bg-white shadow-[0_1px_3px_rgb(0_0_0/0.08),0_12px_40px_-12px_rgb(0_0_0/0.25)]",
            device === "mobile" ? "rounded-[30px] border-[6px] border-[#1d1d1f]" : device === "tablet" ? "rounded-[18px] border-[5px] border-[#2a2a2c]" : "rounded-lg",
          )}
          style={{ width: designW, height, transform: `scale(${scale})`, transformOrigin: "top left" }}
        >
          {children}
        </div>
      </div>
      {scale < 0.999 && (
        <div className="pointer-events-none absolute right-1 bottom-0 rounded bg-black/55 px-1.5 py-0.5 text-[10.5px] font-medium text-white tabular-nums">
          {DEVICE_WIDTH[device]}px · {Math.round(scale * 100)}%
        </div>
      )}
    </div>
  );
}

export function Canvas({ wb }: { wb: Workbench }) {
  const [mode, setMode] = useState<"interact" | "inspect">("interact");
  const [chosenDevice, setDevice] = useState<Device | null>(null);
  const [forced, setForced] = useState<"live" | StateKey>("live");
  const [showChanges, setShowChanges] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const v = wb.viewVersion;
  const platform = v?.spec.platform;

  // Default the preview device to the platform the screen was designed for.
  const device: Device = chosenDevice ?? platform ?? "desktop";

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const busyGenerate = wb.job?.kind === "generate";
  const busyRefine = wb.job?.kind === "refine";
  const selectedName = v?.spec.components.find((c) => c.id === wb.selectedId)?.name;

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 border-b border-wb-line bg-white px-3 py-2">
      {v ? (
        <div className="flex items-center gap-1.5 pr-1">
          <span className="text-[12.5px] font-semibold">v{v.number}</span>
          <span className="max-w-[220px] truncate text-[12px] text-wb-ink-2" title={v.label}>
            {v.label}
          </span>
          {wb.isPreviewing ? <Pill tone="amber">Previewing · read-only</Pill> : <Pill tone="accent">Current</Pill>}
          {wb.project?.approvedVersionId === v.id && <Pill tone="green">Approved</Pill>}
          {!v.provider.isAI && <Pill tone="amber" title="This version was not produced by an AI model">Demo content</Pill>}
        </div>
      ) : (
        <span className="text-[12.5px] font-semibold text-wb-ink-2">Prototype</span>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Segmented
          label="Canvas mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: "interact", label: <><MousePointer2 size={13} aria-hidden="true" /> Interact</>, title: "Use the prototype. Alt+click selects a component." },
            { value: "inspect", label: <><ScanSearch size={13} aria-hidden="true" /> Inspect</>, title: "Click any component to select it" },
          ]}
        />
        <label className="flex items-center gap-1.5 text-[12px] text-wb-ink-2">
          <span className="sr-only sm:not-sr-only">State</span>
          <select
            className="h-7 rounded-md border border-wb-line-strong bg-white px-1.5 text-[12px] text-wb-ink focus:outline-2 focus:outline-wb-accent"
            value={forced}
            onChange={(e) => setForced(e.target.value as typeof forced)}
            aria-label="Preview UI state"
          >
            <option value="live">Live (as designed)</option>
            <option value="populated">Populated</option>
            <option value="empty">Empty</option>
            <option value="loading">Loading</option>
            <option value="error">Error</option>
            <option value="success">Success</option>
          </select>
        </label>
        <Segmented
          label="Device"
          value={device}
          onChange={setDevice}
          options={[
            { value: "desktop", label: <Monitor size={14} aria-label="Desktop" />, title: "Desktop" },
            { value: "tablet", label: <Tablet size={14} aria-label="Tablet" />, title: "Tablet (820px)" },
            { value: "mobile", label: <Smartphone size={14} aria-label="Mobile" />, title: "Mobile (390px)" },
          ]}
        />
        <div className="flex items-center">
          <IconButton label={showChanges ? "Hide change highlights" : "Show change highlights"} active={showChanges} onClick={() => setShowChanges(!showChanges)} disabled={!wb.changedIds.length}>
            <Eye size={15} />
          </IconButton>
          <IconButton label="Reset prototype interactions" onClick={() => setResetKey((k) => k + 1)} disabled={!v}>
            <RotateCcw size={15} />
          </IconButton>
          <IconButton label={fullscreen ? "Exit full screen" : "Full-screen preview"} onClick={() => setFullscreen(!fullscreen)} disabled={!v}>
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </IconButton>
        </div>
      </div>
    </div>
  );

  const frame = v ? (
    <DeviceFrame device={device}>
      <div className="wb-scroll h-full overflow-auto">
        <PrototypeRenderer
          key={`${v.id}-${resetKey}`}
          spec={v.spec}
          forcedState={forced === "live" ? null : forced}
          reveal={wb.reveal}
          inspect={{
            enabled: mode === "inspect",
            selectedId: wb.selectedId,
            changedIds: showChanges ? wb.changedIds : [],
            onSelect: (id) => wb.select(id),
          }}
        />
      </div>
    </DeviceFrame>
  ) : null;

  if (fullscreen && v) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-wb-canvas">
        {toolbar}
        <div className="min-h-0 flex-1 p-4">{frame}</div>
      </div>
    );
  }

  return (
    <section aria-label="Prototype canvas" className="flex min-h-0 min-w-0 flex-1 flex-col">
      {toolbar}
      <ErrorBanner wb={wb} />
      {wb.isPreviewing && v && (
        <div className="mx-3 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          You&apos;re previewing <strong className="font-semibold">v{v.number}</strong>. Refinement is paused while you look.
          <div className="ml-auto flex gap-1.5">
            <Button size="xs" variant="secondary" onClick={() => wb.restore(v.id)}>
              Restore this version
            </Button>
            <Button size="xs" variant="ghost" onClick={() => wb.preview(null)}>
              Back to current
            </Button>
          </div>
        </div>
      )}
      <div className="wb-canvas-dots relative min-h-0 flex-1 overflow-hidden p-4">
        {frame ?? <EmptyCanvas wb={wb} />}
        {wb.job && (busyGenerate || busyRefine) && (
          <div className={clsx("absolute inset-0 grid place-items-center", v && "bg-white/40 backdrop-blur-[1.5px]")}>
            <JobStatus job={wb.job} onCancel={wb.cancel} title={busyRefine ? `Refining ${selectedName ?? "component"}` : v ? "Regenerating the screen" : "Generating your prototype"} />
          </div>
        )}
      </div>
      {v && mode === "interact" && (
        <div className="border-t border-wb-line bg-white px-3 py-1.5 text-[11px] text-wb-ink-3">
          Interact mode: the prototype works like the real thing. <kbd className="rounded border border-wb-line px-1 font-mono">Alt</kbd>+click any element to select it, or switch to Inspect.
        </div>
      )}
    </section>
  );
}

function EmptyCanvas({ wb }: { wb: Workbench }) {
  if (wb.loading) {
    return (
      <div className="grid h-full place-items-center text-[12.5px] text-wb-ink-3">
        <span className="wb-pulse">Opening project…</span>
      </div>
    );
  }
  if (wb.job) return null;
  return (
    <div className="grid h-full place-items-center">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-white shadow-sm">
          <ScanSearch size={22} className="text-wb-accent" aria-hidden="true" />
        </div>
        <h2 className="text-[16px] font-semibold">Describe a screen to get started</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-wb-ink-2">
          Write what the screen is for and how it should sound, then generate. You&apos;ll get a working prototype with annotations that explain each design decision. Then select any part to refine it.
        </p>
        {wb.provider && (
          <p className="mt-3 text-[11.5px] text-wb-ink-3">
            Generation provider: <strong className="font-semibold text-wb-ink-2">{wb.provider.active.label}</strong>
            {wb.provider.active.model ? ` (${wb.provider.active.model})` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
