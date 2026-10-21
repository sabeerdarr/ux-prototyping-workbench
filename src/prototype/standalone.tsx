/**
 * Entry point for the standalone prototype runtime bundled into HTML exports.
 * Reads the spec embedded in the page and renders it with the same registry
 * the workbench uses.
 */
import { createRoot } from "react-dom/client";
import type { ScreenSpec } from "../lib/schema";
import { PrototypeRenderer } from "./renderer";

declare global {
  interface Window {
    __PROTOTYPE_SPEC__?: unknown;
  }
}

const mount = document.getElementById("prototype-root");
const spec = window.__PROTOTYPE_SPEC__ as ScreenSpec | undefined;
// The spec was validated on the server when the export was created.
if (mount) {
  if (spec && Array.isArray(spec.components)) createRoot(mount).render(<PrototypeRenderer spec={spec} />);
  else mount.textContent = "This export does not contain a screen specification.";
}
