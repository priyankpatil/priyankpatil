import { unstable_cache } from "next/cache";
import pg from "pg";
import type { WikiResponse } from "./types";
import { databaseTLS } from "./tls";

let pool: pg.Pool | undefined;
const cachedFrame = unstable_cache(async (): Promise<WikiResponse> => {
  if (!pool) {
    const url = new URL(process.env.WIKISTREAM_READ_URL!);
    url.searchParams.delete("sslmode");
    pool = new pg.Pool({
      connectionString: url.toString(), max: 1, idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 4000, statement_timeout: 4000,
      ssl: databaseTLS(url.hostname, process.env.WIKISTREAM_DATABASE_CA?.replace(/\\n/g, "\n")),
    });
    pool.on("error", () => console.error("[wiki-stream] database pool unavailable"));
  }
  const { rows } = await pool.query("select wiki_stream.read_frame() as response");
  return rows[0].response as WikiResponse;
}, ["wiki-stream-frame-v1"], { revalidate: 5 });

export async function readFrame(): Promise<WikiResponse> {
  if (!process.env.WIKISTREAM_READ_URL) return { mode: "preview", frame: null };
  try { return await cachedFrame(); }
  catch {
    console.error("[wiki-stream] snapshot unavailable; serving recorded preview");
    return { mode: "unavailable", frame: null };
  }
}
