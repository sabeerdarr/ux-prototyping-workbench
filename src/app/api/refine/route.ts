import { z } from "zod";
import { refineScreen } from "@/lib/ai/service";
import { BriefInput, QuickAction, ScreenSpec } from "@/lib/schema";
import { errorEvent, readJson, streamTask } from "@/lib/server/stream";

export const maxDuration = 600;

const Body = z.object({
  projectId: z.string().max(64),
  brief: BriefInput,
  spec: ScreenSpec,
  targetIds: z.array(z.string()).min(1).max(10),
  instruction: z.string().max(2000),
  quickAction: QuickAction.optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = await readJson(req, Body);
  } catch (err) {
    return Response.json(errorEvent(err), { status: 400 });
  }
  if (!body.instruction.trim() && !body.quickAction) {
    return Response.json(
      { type: "error", code: "bad_request", message: "Describe the change or pick a quick action.", retryable: false },
      { status: 400 },
    );
  }
  const { projectId, ...args } = body;
  return streamTask(`refine:${projectId}`, (emit) => refineScreen(args, emit));
}
