/**
 * Deterministic accessibility and interaction checks. These run without AI
 * and are labeled as automated rule checks in the UI.
 */
import type { Action, Component, ReviewFinding, ScreenSpec } from "./schema";

const GENERIC_LABELS = /^(submit|ok|okay|yes|no|click here|here|go|continue|next|more|learn more|button)$/i;

function actionsOf(c: Component): { label: string; action?: Action; danger: boolean }[] {
  switch (c.type) {
    case "button":
      return [{ label: c.props.label, action: c.action, danger: c.props.variant === "danger" }];
    case "menu":
      return c.props.items.map((i) => ({ label: i.label, action: i.action, danger: i.tone === "danger" }));
    case "table":
      return (c.props.rowActions ?? []).map((a) => ({ label: a.label, action: a.action, danger: a.tone === "danger" }));
    case "list":
      return c.props.items.flatMap((i) => [
        ...(i.actionLabel ? [{ label: i.actionLabel, action: i.action, danger: false }] : []),
        ...(i.secondaryActionLabel ? [{ label: i.secondaryActionLabel, action: i.secondaryAction, danger: false }] : []),
      ]);
    default:
      return [];
  }
}

export function ruleReview(spec: ScreenSpec): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  let n = 0;
  const add = (f: Omit<ReviewFinding, "id">) => findings.push({ id: `rule-${++n}`, ...f });

  let lastHeading = 0;
  for (const c of spec.components) {
    for (const a of actionsOf(c)) {
      if (GENERIC_LABELS.test(a.label.trim())) {
        add({
          componentId: c.id,
          severity: "low",
          category: "content",
          issue: `“${a.label}” is a generic action label in ${c.name}.`,
          recommendation: "Use a label that names the outcome, e.g. “Save draft” or “Send reminder”.",
          reference: "WCAG 2.2 SC 2.4.6 Headings and Labels",
        });
      }
      if (a.danger && a.action?.type === "remove-item") {
        add({
          componentId: c.id,
          severity: "high",
          category: "interaction",
          issue: `“${a.label}” removes content immediately with no confirmation.`,
          recommendation: "Open a confirmation dialog first, or offer an undo in the toast.",
          reference: "WCAG 2.2 SC 3.3.4 Error Prevention",
        });
      }
    }
    if ((c.type === "list" || c.type === "table") && !c.states?.empty) {
      add({
        componentId: c.id,
        severity: "medium",
        category: "states",
        issue: `${c.name} has no empty state.`,
        recommendation: "Add an empty state that explains why it's empty and what to do next.",
      });
    }
    if (c.states?.error && !c.states.error.actionLabel) {
      add({
        componentId: c.id,
        severity: "medium",
        category: "states",
        issue: `The error state for ${c.name} has no recovery action.`,
        recommendation: "Add a retry or alternative action so people aren't stuck.",
        reference: "WCAG 2.2 SC 3.3.3 Error Suggestion",
      });
    }
    if (c.type === "form") {
      if (!c.props.errorMessage && c.props.submitOutcome === "error") {
        add({ componentId: c.id, severity: "medium", category: "states", issue: "The form can fail but has no error message.", recommendation: "Explain what went wrong and whether entered data is kept." });
      }
      for (const f of c.props.fields) {
        if (f.required && !f.validationMessage) {
          add({
            componentId: c.id,
            severity: "low",
            category: "accessibility",
            issue: `Required field “${f.label}” has no specific validation message.`,
            recommendation: "Say how to fix the problem, e.g. “Enter an email like name@example.org”.",
            reference: "WCAG 2.2 SC 3.3.1 Error Identification",
          });
        }
      }
    }
    if (c.type === "image" && c.props.alt.trim().length < 8) {
      add({ componentId: c.id, severity: "medium", category: "accessibility", issue: "Image alt text is missing or too short to be meaningful.", recommendation: "Describe the image's purpose in context.", reference: "WCAG 2.2 SC 1.1.1 Non-text Content" });
    }
    if (c.type === "heading") {
      if (lastHeading && c.props.level > lastHeading + 1) {
        add({ componentId: c.id, severity: "low", category: "accessibility", issue: `Heading level jumps from h${lastHeading} to h${c.props.level}.`, recommendation: "Keep heading levels sequential so screen reader users can navigate the outline.", reference: "WCAG 2.2 SC 1.3.1 Info and Relationships" });
      }
      lastHeading = c.props.level;
    }
    if (c.type === "menu" && c.props.icon && !c.a11y?.label) {
      add({ componentId: c.id, severity: "low", category: "accessibility", issue: `${c.name} may render as an icon button without an accessible name that includes state (e.g. unread count).`, recommendation: "Add a11y.label describing the button and any status it shows.", reference: "WCAG 2.2 SC 4.1.2 Name, Role, Value" });
    }
  }
  return findings;
}
