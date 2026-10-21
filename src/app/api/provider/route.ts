import { providerStatus } from "@/lib/ai/service";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(providerStatus());
}
