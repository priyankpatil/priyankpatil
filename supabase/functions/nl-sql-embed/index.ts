// Supabase Edge Function: text → 384-dim gte-small embeddings, computed
// inside Supabase (no third-party embedding API or key needed).
//
// Deploy:  supabase functions deploy nl-sql-embed --no-verify-jwt
// Secret:  supabase secrets set NLSQL_EMBED_SECRET=<random string>
// Callers send the same secret in the `x-embed-secret` header.

const session = new Supabase.ai.Session("gte-small");

const MAX_INPUTS = 64;
const MAX_CHARS = 2000;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secret = Deno.env.get("NLSQL_EMBED_SECRET");
  if (!secret || req.headers.get("x-embed-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  let input: unknown;
  try {
    ({ input } = await req.json());
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const inputs = Array.isArray(input) ? input : [input];
  if (!inputs.length || inputs.length > MAX_INPUTS || !inputs.every((t) => typeof t === "string" && t.trim())) {
    return new Response(`input must be a non-empty string or an array of up to ${MAX_INPUTS} strings`, { status: 400 });
  }

  const embeddings: number[][] = [];
  for (const text of inputs as string[]) {
    const vector = await session.run(text.slice(0, MAX_CHARS), { mean_pool: true, normalize: true });
    embeddings.push(Array.from(vector as ArrayLike<number>));
  }

  return Response.json({ model: "gte-small", dimensions: embeddings[0].length, embeddings });
});
