import { createGroq } from "@ai-sdk/groq";
import { streamText } from "ai";

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
  const { question } = (await req.json()) as { question: string };

  if (!question?.trim()) {
    return new Response("Question is required", { status: 400 });
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
    prompt: question,
  });

  // Stream raw text chunks directly — avoids AI SDK protocol encoding
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of result.textStream) {
          controller.enqueue(encoder.encode(chunk));
        }
      } finally {
        controller.close();
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
