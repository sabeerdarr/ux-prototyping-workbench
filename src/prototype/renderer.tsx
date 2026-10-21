/**
 * Renders a validated ScreenSpec through the component registry.
 * Used by the workbench canvas, version comparison, and standalone export.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Component, ComponentOf, ComponentType, ScreenSpec, StateKey } from "../lib/schema";
import { childIdsOf } from "../lib/spec-tree";
import { DialogView, LoadingBlock, REGISTRY, StateBlock, type Anchor, type RenderProps } from "./components";
import { RuntimeProvider, useRuntime } from "./runtime";

export interface InspectOptions {
  /** When true, clicks select components instead of triggering interactions. */
  enabled: boolean;
  selectedId: string | null;
  changedIds: string[];
  onSelect: (id: string) => void;
}

export interface RevealRequest {
  id: string;
  nonce: number;
}

interface HighlightState {
  selectedId: string | null;
  changed: Set<string>;
  hoverId: string | null;
  annotate: boolean;
}

const HighlightContext = createContext<HighlightState>({ selectedId: null, changed: new Set(), hoverId: null, annotate: false });

function luminance(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function Node({ id }: { id: string }) {
  const rt = useRuntime();
  const hl = useContext(HighlightContext);
  const c = rt.index.get(id);
  const renderIds = useCallback((ids: string[] | undefined): ReactNode => ids?.map((k) => <Node key={k} id={k} />) ?? null, []);
  if (!c || c.type === "dialog" || rt.state.dismissed.includes(c.id)) return null;
  const anchor = anchorFor(c, hl);
  const st = rt.effectiveState(c);
  if (c.type !== "form" && st !== "populated") {
    if (st === "loading") return <LoadingBlock c={c} anchor={anchor} />;
    if (c.states?.[st]) return <StateBlock c={c} kind={st} anchor={anchor} />;
  }
  const Impl = REGISTRY[c.type] as (p: RenderProps<ComponentType>) => ReactNode;
  return <Impl c={c as ComponentOf<ComponentType>} anchor={anchor} renderIds={renderIds} />;
}

function anchorFor(c: Component, hl: HighlightState): Anchor {
  return {
    "data-pt-id": c.id,
    "data-pt-type": c.type,
    "data-pt-annotated": hl.annotate && c.annotationIds?.length ? "true" : undefined,
    "data-pt-selected": hl.selectedId === c.id ? "true" : undefined,
    "data-pt-changed": hl.changed.has(c.id) ? "true" : undefined,
    "data-pt-hover": hl.hoverId === c.id ? "true" : undefined,
  };
}

function Overlays() {
  const rt = useRuntime();
  const hl = useContext(HighlightContext);
  const dialog = rt.state.dialog ? rt.index.get(rt.state.dialog.id) : undefined;
  const renderIds = useCallback((ids: string[] | undefined): ReactNode => ids?.map((k) => <Node key={k} id={k} />) ?? null, []);
  return (
    <>
      {dialog?.type === "dialog" && <DialogView c={dialog} anchor={anchorFor(dialog, hl)} renderIds={renderIds} />}
      <div className="pt-toasts" aria-live="polite" role="status">
        {rt.state.toasts.map((t) => (
          <div key={t.id} className="pt-toast">{t.message}</div>
        ))}
      </div>
    </>
  );
}

/** Ancestors of `id`, nearest first. */
function ancestors(spec: ScreenSpec, id: string): Component[] {
  const out: Component[] = [];
  let cur = id;
  for (let i = 0; i < 50; i++) {
    const parent = spec.components.find((c) => childIdsOf(c).includes(cur));
    if (!parent) break;
    out.push(parent);
    cur = parent.id;
  }
  return out;
}

export function PrototypeRenderer({
  spec,
  forcedState = null,
  inspect,
  reveal,
  className,
}: {
  spec: ScreenSpec;
  forcedState?: StateKey | null;
  inspect?: InspectOptions;
  reveal?: RevealRequest | null;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const api = useRef<{ openDialog: (id: string) => void; setTab: (a: string, b: string) => void } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const highlight = useMemo<HighlightState>(
    () => ({ selectedId: inspect?.selectedId ?? null, changed: new Set(inspect?.changedIds ?? []), hoverId: inspect?.enabled ? hoverId : null, annotate: Boolean(inspect) }),
    [inspect, hoverId],
  );

  // Bring a component into view: switch tabs / open dialogs that contain it, then scroll and flash.
  useEffect(() => {
    if (!reveal || !api.current) return;
    const target = spec.components.find((c) => c.id === reveal.id);
    if (!target) return;
    const chain = [target, ...ancestors(spec, reveal.id)];
    let prev = reveal.id;
    for (const a of chain.slice(1)) {
      if (a.type === "tabs") {
        const tab = a.props.tabs.find((t) => t.contentIds.includes(prev));
        if (tab) api.current.setTab(a.id, tab.id);
      }
      prev = a.id;
    }
    const dialog = chain.find((c) => c.type === "dialog");
    if (dialog) api.current.openDialog(dialog.id);
    const t = setTimeout(() => {
      const el = rootRef.current?.querySelector<HTMLElement>(`[data-pt-id="${CSS.escape(reveal.id)}"]`);
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.remove("pt-flash");
      void el.offsetWidth;
      el.classList.add("pt-flash");
    }, 60);
    return () => clearTimeout(t);
  }, [reveal, spec]);

  const theme = spec.theme;
  const onPrimary = luminance(theme.primary) > 0.4 ? "#111111" : "#ffffff";
  const style = { "--pt-primary": theme.primary, "--pt-on-primary": onPrimary, "--pt-accent": theme.accent ?? theme.primary } as CSSProperties;

  const pick = (target: EventTarget | null) => (target as HTMLElement | null)?.closest?.("[data-pt-id]")?.getAttribute("data-pt-id") ?? null;

  return (
    <div
      ref={rootRef}
      className={["pt-root", inspect?.enabled && "pt-inspecting", className].filter(Boolean).join(" ")}
      style={style}
      data-neutral={theme.neutral}
      data-radius={theme.radius}
      data-density={theme.density}
      data-font={theme.font}
      data-mode={theme.mode}
      onClickCapture={(e) => {
        if (!inspect || (!inspect.enabled && !e.altKey)) return;
        const id = pick(e.target);
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        inspect.onSelect(id);
      }}
      onMouseOver={inspect?.enabled ? (e) => setHoverId(pick(e.target)) : undefined}
      onMouseLeave={inspect?.enabled ? () => setHoverId(null) : undefined}
    >
      <HighlightContext.Provider value={highlight}>
        <RuntimeProvider
          spec={spec}
          forcedState={forcedState}
          onReveal={(a) => {
            api.current = a;
          }}
        >
          {spec.rootIds.map((id) => (
            <Node key={id} id={id} />
          ))}
          <Overlays />
        </RuntimeProvider>
      </HighlightContext.Provider>
    </div>
  );
}
