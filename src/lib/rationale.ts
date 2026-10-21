/** Design rationale exports (Markdown and JSON). */
import type { Project, Version } from "./schema";

const KIND_LABEL = { decision: "Design decision", assumption: "Assumption", validate: "Needs validation" } as const;

export function rationaleJson(project: Project, version: Version) {
  const names = new Map(version.spec.components.map((c) => [c.id, c.name]));
  return {
    project: project.name,
    exportedAt: new Date().toISOString(),
    version: { number: version.number, label: version.label, kind: version.kind, createdAt: version.createdAt },
    approved: project.approvedVersionId === version.id,
    provider: version.provider,
    brief: project.brief,
    screen: { title: version.spec.title, description: version.spec.description, toneSummary: version.spec.toneSummary, platform: version.spec.platform },
    assumptions: version.spec.assumptions.map((a) => a.text),
    annotations: version.spec.annotations.map((a) => ({ ...a, elementName: names.get(a.elementId) ?? a.elementId })),
    history: project.versions.map((v) => ({
      number: v.number,
      label: v.label,
      kind: v.kind,
      createdAt: v.createdAt,
      provider: v.provider.label,
      refinement: v.refinement ?? null,
    })),
    notice: "Working prototype rationale. Assumptions and items marked 'Needs validation' have not been verified with users.",
  };
}

export function rationaleMarkdown(project: Project, version: Version): string {
  const names = new Map(version.spec.components.map((c) => [c.id, c.name]));
  const s = version.spec;
  const lines: string[] = [];
  lines.push(`# Design rationale: ${s.title}`);
  lines.push("");
  lines.push(`**Project:** ${project.name}  `);
  lines.push(`**Version:** v${version.number} (${version.label})${project.approvedVersionId === version.id ? " · **Approved**" : ""}  `);
  lines.push(`**Generated with:** ${version.provider.label}${version.provider.model ? ` (${version.provider.model})` : ""}  `);
  lines.push(`**Exported:** ${new Date().toLocaleString()}`);
  lines.push("");
  lines.push("> This documents a working prototype. Assumptions and items marked “Needs validation” have not been tested with users.");
  lines.push("");
  lines.push("## Brief");
  lines.push("");
  lines.push(`**Screen description:** ${project.brief.description}`);
  lines.push("");
  lines.push(`**Tone of voice:** ${project.brief.tone}`);
  for (const [k, label] of [["screenType", "Screen type"], ["targetUsers", "Target users"], ["primaryGoal", "Primary goal"], ["platform", "Platform"], ["visualStyle", "Visual style"]] as const) {
    const v = project.brief[k];
    if (v) lines.push("", `**${label}:** ${v}`);
  }
  lines.push("", `**How the tone was interpreted:** ${s.toneSummary}`, "");
  if (s.assumptions.length) {
    lines.push("## Key assumptions", "");
    for (const a of s.assumptions) lines.push(`- ${a.text}`);
    lines.push("");
  }
  lines.push("## Annotations", "");
  for (const a of s.annotations) {
    lines.push(`### ${a.decision}`);
    lines.push("");
    lines.push(`*${KIND_LABEL[a.kind]} · ${names.get(a.elementId) ?? a.elementId} (\`${a.elementId}\`)*`);
    lines.push("");
    lines.push(`**Why:** ${a.rationale}`);
    lines.push("");
    lines.push(`**UX principle / user need:** ${a.uxPrinciple}`);
    lines.push("");
    lines.push(`**Tone:** ${a.toneAlignment}`);
    if (a.tradeoffs.length) lines.push("", "**Trade-offs:**", ...a.tradeoffs.map((t) => `- ${t}`));
    if (a.assumptions.length) lines.push("", "**Assumptions:**", ...a.assumptions.map((t) => `- ${t}`));
    lines.push("");
  }
  const refinements = project.versions.filter((v) => v.refinement);
  if (refinements.length) {
    lines.push("## Refinement history", "");
    for (const v of refinements) {
      const r = v.refinement!;
      lines.push(`### v${v.number}: ${r.summary}`);
      lines.push("");
      lines.push(`**Request:** ${r.instruction || r.quickAction}  `);
      lines.push(`**Affected:** ${r.affectedIds.map((id) => names.get(id) ?? id).join(", ")}  `);
      lines.push(`**Expected UX impact:** ${r.uxImpact}`);
      if (r.tradeoffs.length) lines.push("", "**Trade-offs:**", ...r.tradeoffs.map((t) => `- ${t}`));
      if (r.newAssumptions.length) lines.push("", "**New assumptions:**", ...r.newAssumptions.map((t) => `- ${t}`));
      lines.push("");
    }
  }
  return lines.join("\n");
}
