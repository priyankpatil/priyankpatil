import { MAX_QUESTION_LENGTH } from "@/lib/nl-sql/constants";
import { runPipeline, type PipelineEvent } from "@/lib/nl-sql/pipeline";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// Leaves room for retrieval, model fallback, execution and one repair round.
export const maxDuration = 60;

const RATE_LIMIT = { limit: 10, windowSeconds: 60 * 10, prefix: "nl-sql" };

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

  // Each pipeline step is streamed as one JSON object per line, so the demo
  // can show retrieval, generation, validation and execution as they happen.
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let open = true;
      const emit = (event: PipelineEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false;
        }
      };
      await runPipeline(question.trim(), emit, req.signal);
      open = false;
      try {
        controller.close();
      } catch {
        // client already disconnected
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
