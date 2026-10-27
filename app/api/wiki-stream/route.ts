import { readFrame } from "@/lib/wiki-stream/server";

export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(await readFrame(), { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=5" } });
}
