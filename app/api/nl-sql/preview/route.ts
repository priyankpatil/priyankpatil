import { dbConfigured, runReadOnly } from "@/lib/nl-sql/db";
import { DEMO_TABLES } from "@/lib/nl-sql/knowledge";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const RATE_LIMIT = { limit: 60, windowSeconds: 60 * 10, prefix: "nl-sql-preview" };

// Sample rows for the schema browser. The table name comes from a fixed
// allowlist, never from free text.
export async function GET(req: Request) {
  const table = new URL(req.url).searchParams.get("table") ?? "";
  if (!(DEMO_TABLES as readonly string[]).includes(table)) {
    return Response.json({ error: "Unknown table" }, { status: 400 });
  }
  if (!dbConfigured()) return Response.json({ error: "Live data is not configured" }, { status: 503 });

  const { allowed } = await rateLimit(clientIp(req), RATE_LIMIT);
  if (!allowed) return Response.json({ error: "Too many requests" }, { status: 429 });

  try {
    const result = await runReadOnly(`SELECT * FROM ${table} ORDER BY 1 LIMIT 5`);
    return Response.json(result, { headers: { "Cache-Control": "public, s-maxage=3600" } });
  } catch (err) {
    console.error("[nl-sql] preview failed:", (err as Error).message);
    return Response.json({ error: "Preview unavailable" }, { status: 503 });
  }
}
