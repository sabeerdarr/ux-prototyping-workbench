import { deleteProject, getProject, ProjectShape, saveProject } from "@/lib/server/store";
import type { Project } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const project = await getProject(id);
    if (!project) return Response.json({ message: "Project not found." }, { status: 404 });
    return Response.json({ project });
  } catch {
    return Response.json({ message: "Invalid project id." }, { status: 400 });
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ message: "Body must be JSON." }, { status: 400 });
  }
  const parsed = ProjectShape.safeParse((raw as { project?: unknown })?.project);
  if (!parsed.success || parsed.data.id !== id) {
    return Response.json({ message: "Project data is invalid." }, { status: 400 });
  }
  const saved = await saveProject(parsed.data as unknown as Project);
  return Response.json({ updatedAt: saved.updatedAt });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const ok = await deleteProject(id);
    return ok ? new Response(null, { status: 204 }) : Response.json({ message: "Project not found." }, { status: 404 });
  } catch {
    return Response.json({ message: "Invalid project id." }, { status: 400 });
  }
}
