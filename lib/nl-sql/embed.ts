// Client for the nl-sql-embed Supabase Edge Function (gte-small, 384 dims).
// No imports, so the ingest script can load it directly with Node.

export const EMBEDDING_DIMENSIONS = 384;

function embedEndpoint(): string | null {
  if (process.env.NLSQL_EMBED_URL) return process.env.NLSQL_EMBED_URL;
  const base = process.env.SUPABASE_URL;
  return base ? `${base.replace(/\/$/, "")}/functions/v1/nl-sql-embed` : null;
}

export function embeddingsConfigured(): boolean {
  return Boolean(embedEndpoint() && process.env.NLSQL_EMBED_SECRET);
}

export async function embed(texts: string[], { timeoutMs = 4000 }: { timeoutMs?: number } = {}): Promise<number[][]> {
  const url = embedEndpoint();
  const secret = process.env.NLSQL_EMBED_SECRET;
  if (!url || !secret) throw new Error("Embeddings are not configured (SUPABASE_URL / NLSQL_EMBED_SECRET).");

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-embed-secret": secret },
    body: JSON.stringify({ input: texts }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Embedding request failed: HTTP ${res.status} ${await res.text()}`);

  const { embeddings } = (await res.json()) as { embeddings: number[][] };
  if (embeddings.length !== texts.length || embeddings.some((e) => e.length !== EMBEDDING_DIMENSIONS)) {
    throw new Error("Embedding response has an unexpected shape.");
  }
  return embeddings;
}

/** pgvector literal, e.g. "[0.1,0.2,...]". */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
