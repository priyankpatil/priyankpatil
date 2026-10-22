import { Pool, types, type PoolConfig, type QueryArrayConfig } from "pg";

// The site connects as the dedicated nlsql_app role (see the Supabase
// migration): SELECT on the demo tables, read on the knowledge base, insert
// on the query log, and nothing else. Use the Supabase pooler connection
// string (transaction mode, port 6543) for serverless.

export const MAX_RESULT_ROWS = 100;
const STATEMENT_TIMEOUT_MS = 4000;

let pool: Pool | null = null;

export function dbConfigured(): boolean {
  return Boolean(process.env.NLSQL_DATABASE_URL);
}

function poolConfig(): PoolConfig {
  const url = new URL(process.env.NLSQL_DATABASE_URL!);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  // pg treats sslmode in the URL as authoritative; TLS is configured below instead.
  url.searchParams.delete("sslmode");
  const ca = process.env.NLSQL_DATABASE_CA;
  return {
    connectionString: url.toString(),
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    ssl: local ? undefined : ca ? { ca } : { rejectUnauthorized: false },
  };
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(poolConfig());
    pool.on("error", (err) => console.error("[nl-sql] idle client error:", err.message));
  }
  return pool;
}

// Keep dates and timestamps as the strings Postgres sends (no timezone
// shifting through JS Date), and return counts and numerics as numbers.
const typeParsers = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    switch (oid) {
      case 1082: // date
      case 1114: // timestamp
      case 1184: // timestamptz
        return (value: string) => value;
      case 20: // int8
      case 1700: // numeric
        return (value: string) => {
          const n = Number(value);
          return Number.isFinite(n) ? n : value;
        };
      default:
        return types.getTypeParser(oid, format as "text");
    }
  },
};

export interface QueryResultSet {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
}

/**
 * Runs one validated SELECT in a read-only transaction with a statement
 * timeout and a row cap, then rolls back.
 */
export async function runReadOnly(sql: string): Promise<QueryResultSet> {
  const client = await getPool().connect();
  const started = Date.now();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    await client.query("SET LOCAL search_path = nlsql_demo");
    // The extended protocol makes Postgres reject more than one statement, so
    // SQL that slips past the validator cannot smuggle in a second query.
    const query: QueryArrayConfig & { queryMode: "extended" } = {
      text: `SELECT * FROM (\n${sql}\n) AS nlsql_result LIMIT ${MAX_RESULT_ROWS + 1}`,
      rowMode: "array",
      types: typeParsers,
      queryMode: "extended",
    };
    const result = await client.query(query);
    const rows = result.rows as unknown[][];
    return {
      columns: result.fields.map((f) => f.name),
      rows: rows.slice(0, MAX_RESULT_ROWS),
      rowCount: Math.min(rows.length, MAX_RESULT_ROWS),
      truncated: rows.length > MAX_RESULT_ROWS,
      durationMs: Date.now() - started,
    };
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}

export interface RetrievedDoc {
  id: string;
  kind: "table" | "glossary" | "rule" | "example";
  title: string;
  content: string;
  metadata: { tables?: string[]; sql?: string | null };
  score: number;
}

export async function hybridSearch(question: string, embedding: number[] | null, limit = 12): Promise<RetrievedDoc[]> {
  const { rows } = await getPool().query(
    "SELECT id, kind, title, content, metadata, score FROM nlsql_rag.hybrid_search($1, $2::extensions.vector, $3)",
    [question, embedding ? `[${embedding.join(",")}]` : null, limit]
  );
  return rows as RetrievedDoc[];
}

export interface QueryLogEntry {
  question: string;
  sql: string | null;
  status: string;
  error: string | null;
  model: string | null;
  attempts: number;
  retrievedIds: string[];
  rowCount: number | null;
  latencyMs: number;
}

export async function logQuery(entry: QueryLogEntry): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO nlsql_rag.query_log
         (question, generated_sql, status, error, model, attempts, retrieved_ids, row_count, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        entry.question,
        entry.sql,
        entry.status,
        entry.error,
        entry.model,
        entry.attempts,
        entry.retrievedIds,
        entry.rowCount,
        entry.latencyMs,
      ]
    );
  } catch (err) {
    console.error("[nl-sql] failed to write query log:", (err as Error).message);
  }
}
