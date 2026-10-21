import { z } from "zod";
import { generateScreen } from "@/lib/ai/service";
import { BriefInput } from "@/lib/schema";
import { errorEvent, readJson, streamTask } from "@/lib/server/stream";

export const maxDuration = 600;

const Body = z.object({ projectId: z.string().max(64).optional(), brief: BriefInput });

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = await readJson(req, Body);
  } catch (err) {
    return Response.json(errorEvent(err), { status: 400 });
  }
  const { brief } = body;
  if (brief.description.trim().length < 10 || brief.tone.trim().length < 3) {
    return Response.json(
      { type: "error", code: "bad_request", message: "Add a screen description (at least a sentence) and a tone of voice.", retryable: false },
      { status: 400 },
    );
  }
  if (brief.description.length > 8000 || brief.tone.length > 2000) {
    return Response.json({ type: "error", code: "bad_request", message: "The description or tone is too long.", retryable: false }, { status: 400 });
  }
  return streamTask(body.projectId ? `generate:${body.projectId}` : null, (emit) => generateScreen(brief, emit));
}
