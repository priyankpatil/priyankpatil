// Loads the NL → SQL knowledge base into Supabase.
//
//   SUPABASE_DB_URL=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres \
//   SUPABASE_URL=https://<ref>.supabase.co NLSQL_EMBED_SECRET=... \
//   npm run nl-sql:ingest
//
// 1. Runs every example query against the demo data (read-only) and refuses
//    to load the knowledge base if any example fails, so the model is never
//    shown broken SQL.
// 2. Embeds every document with the nl-sql-embed Edge Function.
// 3. Upserts documents and removes ones no longer in lib/nl-sql/knowledge.ts.
//
// Pass --no-embeddings to load documents without vectors (full-text search only).

import pg from "pg";
import { knowledge, type KnowledgeDoc } from "../lib/nl-sql/knowledge.ts";
import { embed, embeddingsConfigured, toVectorLiteral } from "../lib/nl-sql/embed.ts";

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Set SUPABASE_DB_URL to your project's Postgres connection string (the postgres user).");
  process.exit(1);
}
const skipEmbeddings = process.argv.includes("--no-embeddings");
if (!skipEmbeddings && !embeddingsConfigured()) {
  console.error("Set SUPABASE_URL and NLSQL_EMBED_SECRET, or pass --no-embeddings.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

async function verifyExample(doc: KnowledgeDoc): Promise<number> {
  await client.query("BEGIN READ ONLY");
  try {
    await client.query("SET LOCAL search_path = nlsql_demo");
    await client.query("SET LOCAL statement_timeout = '10s'");
    const result = await client.query(doc.sql!);
    return result.rowCount ?? 0;
  } finally {
    await client.query("ROLLBACK");
  }
}

try {
  console.log("Verifying example queries against the demo data…");
  const failures: string[] = [];
  for (const doc of knowledge.filter((d) => d.kind === "example")) {
    try {
      const rows = await verifyExample(doc);
      if (rows === 0) failures.push(`${doc.id}: returned no rows`);
      else console.log(`  ✓ ${doc.id} (${rows} rows)`);
    } catch (err) {
      failures.push(`${doc.id}: ${(err as Error).message}`);
    }
  }
  if (failures.length) {
    console.error(`\n${failures.length} example(s) failed; nothing was loaded:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }

  let vectors: (number[] | null)[] = knowledge.map(() => null);
  if (!skipEmbeddings) {
    console.log(`Embedding ${knowledge.length} documents…`);
    vectors = [];
    const texts = knowledge.map((d) => d.embedText ?? `${d.title}\n${d.content}`);
    for (let i = 0; i < texts.length; i += 16) {
      vectors.push(...(await embed(texts.slice(i, i + 16), { timeoutMs: 60_000 })));
    }
  }

  await client.query("BEGIN");
  for (const [i, doc] of knowledge.entries()) {
    await client.query(
      `INSERT INTO nlsql_rag.documents (id, kind, title, content, metadata, embedding, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::extensions.vector, now())
       ON CONFLICT (id) DO UPDATE SET
         kind = excluded.kind, title = excluded.title, content = excluded.content,
         metadata = excluded.metadata, embedding = excluded.embedding, updated_at = now()`,
      [
        doc.id,
        doc.kind,
        doc.title,
        doc.content,
        JSON.stringify({ tables: doc.tables ?? [], sql: doc.sql ?? null }),
        vectors[i] ? toVectorLiteral(vectors[i]!) : null,
      ]
    );
  }
  const removed = await client.query("DELETE FROM nlsql_rag.documents WHERE NOT (id = ANY($1))", [
    knowledge.map((d) => d.id),
  ]);
  await client.query("COMMIT");

  console.log(
    `Loaded ${knowledge.length} documents (${skipEmbeddings ? "full-text only" : "with embeddings"}); removed ${removed.rowCount ?? 0} stale.`
  );
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(err);
  process.exitCode = 1;
} finally {
  await client.end();
}
