import pg from "pg";
import { certificate, required } from "./env.ts";
import type { SinkState } from "./state.ts";
import type { WikiFrame } from "../../../lib/wiki-stream/types.ts";
import { databaseTLS } from "../../../lib/wiki-stream/tls.ts";

export function database(variable = "WIKISTREAM_DATABASE_URL") {
  const url = new URL(required(variable));
  url.searchParams.delete("sslmode");
  return new pg.Pool({
    connectionString: url.toString(), max: 2, connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000, statement_timeout: 10_000,
    ssl: databaseTLS(url.hostname, certificate("WIKISTREAM_DATABASE_CA")),
  });
}

export async function loadState(db: pg.Pool): Promise<SinkState | null> {
  const { rows } = await db.query("select wiki_stream.get_sink_state() as state");
  return rows[0].state;
}

export async function saveState(db: pg.Pool, state: SinkState, frame: WikiFrame) {
  const { rows } = await db.query("select wiki_stream.save_sink_state($1,$2::jsonb,$3::jsonb) as revision", [state.revision, JSON.stringify(state), JSON.stringify(frame)]);
  state.revision = rows[0].revision;
}
