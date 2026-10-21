import { z } from "zod";
import { reviewScreen } from "@/lib/ai/service";
import { BriefInput, ScreenSpec } from "@/lib/schema";
import { errorEvent, readJson, streamTask } from "@/lib/server/stream";

export const maxDuration = 300;

const Body = z.object({ projectId: z.string().max(64), brief: BriefInput, spec: ScreenSpec });

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = await readJson(req, Body);
  } catch (err) {
    return Response.json(errorEvent(err), { status: 400 });
  }
  return streamTask(`review:${body.projectId}`, (emit) => reviewScreen(body, emit));
}
