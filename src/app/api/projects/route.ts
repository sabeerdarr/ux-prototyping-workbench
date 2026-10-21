import { listProjects } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ projects: await listProjects() });
}
