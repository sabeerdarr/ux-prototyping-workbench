import { z } from "zod";
import { compareVersions } from "@/lib/ai/service";
import { BriefInput, ScreenSpec } from "@/lib/schema";
import { errorEvent, readJson, streamTask } from "@/lib/server/stream";

export const maxDuration = 300;

const Side = z.object({ label: z.string().max(60), spec: ScreenSpec });
const Body = z.object({ brief: BriefInput, from: Side, to: Side });

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = await readJson(req, Body);
  } catch (err) {
    return Response.json(errorEvent(err), { status: 400 });
  }
  return streamTask(null, (emit) => compareVersions(body, emit));
}
