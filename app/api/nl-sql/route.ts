import { LlmConfigError, streamWithFallback } from "@/lib/llm";
import { MAX_QUESTION_LENGTH } from "@/lib/nl-sql";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// Leaves room for retries and model fallback before the first token.
export const maxDuration = 30;

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

  let stream: Awaited<ReturnType<typeof streamWithFallback>>;
  try {
    stream = await streamWithFallback({ system: SYSTEM, prompt: question.trim(), signal: req.signal });
  } catch (err) {
    console.error("nl-sql generation failed:", err);
    if (err instanceof LlmConfigError) {
      return new Response("The demo is temporarily unavailable. Please try again later.", { status: 503 });
    }
    return new Response("The model service is busy right now. Please try again in a minute.", { status: 503 });
  }

  // Failures after streaming has started become stream errors, so the client
  // can tell an interrupted generation apart from a finished one.
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(stream.first));
        for await (const text of stream.rest) {
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
      "X-Model": stream.model,
    },
  });
}
