import { z } from "zod";
import { ScreenSpec } from "@/lib/schema";
import { normalizeSpec } from "@/lib/spec-ops";
import { buildReactZip } from "@/lib/server/export";

const Body = z.object({
  spec: ScreenSpec,
  meta: z.object({
    projectName: z.string().max(200),
    versionNumber: z.number(),
    versionLabel: z.string().max(200),
    providerLabel: z.string().max(100),
    approved: z.boolean(),
  }),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: "Invalid export request." }, { status: 400 });
  try {
    const zip = await buildReactZip(normalizeSpec(parsed.data.spec).spec, parsed.data.meta);
    return new Response(zip as BodyInit, { headers: { "Content-Type": "application/zip" } });
  } catch (err) {
    return Response.json({ message: err instanceof Error ? err.message : "Export failed." }, { status: 500 });
  }
}
