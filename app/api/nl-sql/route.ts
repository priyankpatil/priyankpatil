import { createGroq } from "@ai-sdk/groq";
import { streamText } from "ai";
import { MAX_QUESTION_LENGTH } from "@/lib/nl-sql";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const RATE_LIMIT = { limit: 10, windowSeconds: 60 * 10, prefix: "nl-sql" };

const SCHEMA = `
orders       (order_id, customer_id, product_id, order_date DATE, status, total_amount DECIMAL, channel)
customers    (customer_id, segment, lifetime_value DECIMAL, acquisition_date DATE, region, prime_member BOOLEAN)
products     (product_id, product_name, category, brand, price DECIMAL, margin_pct DECIMAL)
pharmacy_fills (fill_id, customer_id, drug_id, fill_date DATE, days_supply INT, copay DECIMAL, fill_status)
inventory    (product_id, warehouse_id, quantity_on_hand INT, reorder_point INT, last_restocked DATE)
`.trim();

const SYSTEM = `You are a senior SQL analyst for Amazon Pharmacy's analytics database (Redshift/PostgreSQL).
Given the schema below, write a clean, well-formatted SQL query.

Rules:
- Return ONLY the SQL — no prose, no markdown fences, no explanation
- Use meaningful column aliases
- Add inline comments (--) for non-obvious logic
- Limit result sets to 20 rows unless the user specifies otherwise
- Use DATE_TRUNC for date bucketing, ROUND() for decimals

Schema:
${SCHEMA}`;

export async function POST(req: Request) {
  const { allowed, resetSeconds } = await rateLimit(clientIp(req), RATE_LIMIT);
  if (!allowed) {
    return new Response(
      `Too many requests. Please try again in ${Math.ceil(resetSeconds / 60)} minute(s).`,
      { status: 429, headers: { "Retry-After": String(resetSeconds) } }
    );
  }

  let question: unknown;
  try {
    ({ question } = (await req.json()) as { question?: unknown });
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  if (typeof question !== "string" || !question.trim()) {
    return new Response("Question is required", { status: 400 });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return new Response(`Question must be ${MAX_QUESTION_LENGTH} characters or fewer`, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return new Response(
      "GROQ_API_KEY is not configured. Add it to your .env.local file.",
      { status: 500 }
    );
  }

  const groq = createGroq({ apiKey });

  const result = streamText({
    model: groq("llama-3.3-70b-versatile"),
    system: SYSTEM,
    prompt: question.trim(),
    maxOutputTokens: 1024,
    abortSignal: req.signal,
  });

  // Stream raw text chunks directly — avoids AI SDK protocol encoding.
  const textParts = (async function* () {
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") yield part.text;
      else if (part.type === "error") throw part.error;
    }
  })();

  // Wait for the first chunk before committing to a 200, so an upstream
  // failure (bad key, model outage) returns a clear error status instead of
  // an empty stream.
  let first: IteratorResult<string>;
  try {
    first = await textParts.next();
  } catch (err) {
    console.error("nl-sql generation failed:", err);
    return new Response("The model service is unavailable right now. Please try again shortly.", {
      status: 502,
    });
  }

  // Failures after streaming has started become stream errors, so the client
  // can tell an interrupted generation apart from a finished one.
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        if (!first.done) controller.enqueue(encoder.encode(first.value));
        for await (const text of textParts) {
          controller.enqueue(encoder.encode(text));
        }
        controller.close();
      } catch (err) {
        console.error("nl-sql generation failed mid-stream:", err);
        controller.error(new Error("Generation failed"));
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
