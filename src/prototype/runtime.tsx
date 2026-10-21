/**
 * Prototype interaction runtime. Implements the allowlisted Action types as
 * plain state transitions; nothing from the spec is ever executed as code.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import type { Action, Component, ScreenSpec, StateKey } from "../lib/schema";

export interface ItemContext {
  sourceId: string;
  itemId?: string;
}

interface Toast {
  id: number;
  message: string;
}

export interface RuntimeState {
  tabs: Record<string, string>;
  dialog: { id: string; context?: ItemContext } | null;
  stateOverrides: Record<string, StateKey>;
  dismissed: string[];
  removedItems: Record<string, string[]>;
  search: Record<string, string>;
  activeNav: string | null;
  toasts: Toast[];
}

type Msg =
  | { t: "tab"; tabsId: string; tabId: string }
  | { t: "dialog"; dialog: RuntimeState["dialog"] }
  | { t: "state"; id: string; state: StateKey | null }
  | { t: "dismiss"; id: string }
  | { t: "remove"; listId: string; itemId: string }
  | { t: "search"; targetId: string; query: string }
  | { t: "nav"; id: string }
  | { t: "toast"; toast: Toast }
  | { t: "untoast"; id: number };

const initial: RuntimeState = {
  tabs: {},
  dialog: null,
  stateOverrides: {},
  dismissed: [],
  removedItems: {},
  search: {},
  activeNav: null,
  toasts: [],
};

function reducer(s: RuntimeState, m: Msg): RuntimeState {
  switch (m.t) {
    case "tab":
      return { ...s, tabs: { ...s.tabs, [m.tabsId]: m.tabId } };
    case "dialog":
      return { ...s, dialog: m.dialog };
    case "state": {
      const next = { ...s.stateOverrides };
      if (m.state) next[m.id] = m.state;
      else delete next[m.id];
      return { ...s, stateOverrides: next };
    }
    case "dismiss":
      return { ...s, dismissed: [...s.dismissed, m.id] };
    case "remove":
      return { ...s, removedItems: { ...s.removedItems, [m.listId]: [...(s.removedItems[m.listId] ?? []), m.itemId] } };
    case "search":
      return { ...s, search: { ...s.search, [m.targetId]: m.query } };
    case "nav":
      return { ...s, activeNav: m.id };
    case "toast":
      return { ...s, toasts: [...s.toasts.slice(-2), m.toast] };
    case "untoast":
      return { ...s, toasts: s.toasts.filter((t) => t.id !== m.id) };
  }
}

export interface Runtime {
  state: RuntimeState;
  spec: ScreenSpec;
  index: Map<string, Component>;
  forcedState: StateKey | null;
  run: (action: Action | undefined, ctx: ItemContext) => void;
  setTab: (tabsId: string, tabId: string) => void;
  setSearch: (targetId: string, query: string) => void;
  setNav: (id: string) => void;
  setComponentState: (id: string, state: StateKey | null) => void;
  closeDialog: () => void;
  toast: (message: string) => void;
  effectiveState: (c: Component) => StateKey;
}

const RuntimeContext = createContext<Runtime | null>(null);

export function useRuntime(): Runtime {
  const rt = useContext(RuntimeContext);
  if (!rt) throw new Error("Prototype runtime missing");
  return rt;
}

export function RuntimeProvider({
  spec,
  forcedState,
  children,
  onReveal,
}: {
  spec: ScreenSpec;
  forcedState: StateKey | null;
  children: ReactNode;
  onReveal?: (api: { openDialog: (id: string) => void; setTab: (tabsId: string, tabId: string) => void }) => void;
}) {
  const [state, dispatch] = useReducer(reducer, initial);
  const index = useMemo(() => new Map(spec.components.map((c) => [c.id, c])), [spec]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const toastId = useRef(0);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const toast = useCallback(
    (message: string) => {
      const id = ++toastId.current;
      dispatch({ t: "toast", toast: { id, message } });
      later(4000, () => dispatch({ t: "untoast", id }));
    },
    [later],
  );

  const run = useCallback(
    (action: Action | undefined, ctx: ItemContext) => {
      if (!action) return;
      switch (action.type) {
        case "none":
          return;
        case "open-dialog":
          if (action.targetId && index.get(action.targetId)?.type === "dialog")
            dispatch({ t: "dialog", dialog: { id: action.targetId, context: ctx } });
          else if (action.message) toast(action.message);
          return;
        case "close-dialog":
          dispatch({ t: "dialog", dialog: null });
          if (action.message) toast(action.message);
          return;
        case "toast":
          toast(action.message || "Done");
          return;
        case "navigate":
          toast(action.message ? `Prototype: ${action.message}` : "Prototype: navigates to another screen");
          return;
        case "switch-tab":
          if (action.targetId && action.tabId) dispatch({ t: "tab", tabsId: action.targetId, tabId: action.tabId });
          return;
        case "set-state": {
          const id = action.targetId ?? ctx.sourceId;
          dispatch({ t: "state", id, state: action.state ?? "populated" });
          if (action.thenState) {
            const then = action.thenState;
            later(action.delayMs ?? 1200, () => dispatch({ t: "state", id, state: then }));
          }
          if (action.message) toast(action.message);
          return;
        }
        case "reset-state":
          dispatch({ t: "state", id: action.targetId ?? ctx.sourceId, state: null });
          return;
        case "dismiss":
          dispatch({ t: "dismiss", id: action.targetId ?? ctx.sourceId });
          if (action.message) toast(action.message);
          return;
        case "remove-item": {
          const listId = action.targetId ?? ctx.sourceId;
          if (ctx.itemId) dispatch({ t: "remove", listId, itemId: ctx.itemId });
          toast(action.message || "Removed");
          return;
        }
      }
    },
    [index, later, toast],
  );

  const setTab = useCallback((tabsId: string, tabId: string) => dispatch({ t: "tab", tabsId, tabId }), []);
  const openDialog = useCallback((id: string) => dispatch({ t: "dialog", dialog: { id } }), []);

  useEffect(() => {
    onReveal?.({ openDialog, setTab });
  }, [onReveal, openDialog, setTab]);

  const runtime = useMemo<Runtime>(
    () => ({
      state,
      spec,
      index,
      forcedState,
      run,
      setTab,
      toast,
      setSearch: (targetId, query) => dispatch({ t: "search", targetId, query }),
      setNav: (id) => dispatch({ t: "nav", id }),
      setComponentState: (id, s) => dispatch({ t: "state", id, state: s }),
      closeDialog: () => dispatch({ t: "dialog", dialog: null }),
      effectiveState: (c) => {
        const override = state.stateOverrides[c.id];
        if (override) return override;
        if (forcedState && forcedState !== "populated" && c.states?.[forcedState]) return forcedState;
        if (forcedState === "populated") return "populated";
        return c.defaultState ?? "populated";
      },
    }),
    [state, spec, index, forcedState, run, setTab, toast],
  );

  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
}
