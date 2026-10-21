/** Zod-free tree helpers, safe to bundle into the standalone runtime. */
import type { Component } from "./schema";

/** Every component id a component references (children, header actions, tab panels). */
export function childIdsOf(c: Component): string[] {
  const ids = [...(c.children ?? []), ...(c.actionIds ?? [])];
  if (c.type === "tabs") for (const t of c.props.tabs) ids.push(...t.contentIds);
  return ids;
}
