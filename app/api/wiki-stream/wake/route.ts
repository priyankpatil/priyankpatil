import { clientIp, rateLimit } from "@/lib/rate-limit";
import { wakeWorker } from "@/lib/wiki-stream/wake";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(req: Request) {
  const headers = { "Cache-Control": "no-store" };
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return Response.json({ status: "unavailable" }, { status: 403, headers });
  const result = await rateLimit(clientIp(req), { prefix: "wiki-stream-wake", limit: 3, windowSeconds: 60 });
  if (!result.allowed) return Response.json({ status: "rate_limited" }, {
    status: 429, headers: { ...headers, "Retry-After": String(result.resetSeconds) },
  });
  const status = await wakeWorker();
  return Response.json({ status }, { status: status === "unavailable" ? 503 : 202, headers });
}
