import { buildContext, buildPrompt, estimateTokens, findChat, MODELS, RUBRICS } from "@/lib/cx-eval/demo";
import { judgeConversation, promptHash } from "@/lib/cx-eval/judge-server";
import type { LiveEvent } from "@/lib/cx-eval/types";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// "Run it live" for the CX eval demo: re-judges one of the curated chats with
// the pipeline's own rubric and judge client. Inputs are ids only (never free
// text), so the prompt is always one the pipeline would build. Any failure
// degrades to the stored result: the client replays it with a notice.

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const RATE_LIMIT = { limit: 6, windowSeconds: 60 * 10, prefix: "cx-eval-judge" };
// Leave headroom under maxDuration for the stream to close cleanly.
const JUDGE_BUDGET_MS = 50_000;

function bad(message: string) {
  return new Response(message, { status: 400 });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("Invalid JSON body");
  }
  const { convoId, model, rubric, mislabel = false } = body;
  const chat = typeof convoId === "string" ? findChat(convoId) : undefined;
  if (!chat) return bad("Unknown conversation: only the curated demo chats can be judged.");
  if (!MODELS.some((m) => m.id === model)) return bad("Unknown model.");
  if (rubric !== "v1" && rubric !== "v2") return bad("Unknown rubric.");
  if (typeof mislabel !== "boolean") return bad("mislabel must be a boolean.");

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let open = true;
      const emit = (event: LiveEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false;
        }
      };
      const finish = () => {
        emit({ type: "done" });
        open = false;
        try {
          controller.close();
        } catch {
          // client already disconnected
        }
      };

      const { system, user } = buildPrompt(chat, rubric, mislabel);
      emit({
        type: "prompt",
        promptHash: promptHash(system, user),
        estTokens: estimateTokens(system + user),
        contactReason: mislabel ? chat.alt.contactReason : chat.context.contactReason,
      });

      const { allowed, resetSeconds } = await rateLimit(clientIp(req), RATE_LIMIT);
      if (!allowed) {
        emit({ type: "fallback", reason: `Live runs are limited to ${RATE_LIMIT.limit} per 10 minutes; try again in ${Math.ceil(resetSeconds / 60)} min.` });
        return finish();
      }
      if (!process.env.NVIDIA_API_KEY) {
        emit({ type: "fallback", reason: "The live judge is not configured on this deployment." });
        return finish();
      }

      emit({ type: "judge_start", model: model as string });
      const signal = AbortSignal.any([req.signal, AbortSignal.timeout(JUDGE_BUDGET_MS)]);
      try {
        const r = await judgeConversation({
          rubric: RUBRICS[rubric],
          context: buildContext(chat, mislabel),
          model: model as string,
          signal,
        });
        if (r.status === "error") {
          console.error("[cx-eval] live judge error:", r.error);
          emit({ type: "fallback", reason: "The judge API did not answer (free-tier capacity)." });
        } else {
          emit({
            type: "result",
            status: r.status,
            output: r.output,
            rawContent: r.rawContent,
            error: r.error,
            model: r.model,
            latencyMs: r.latencyMs,
            promptTokens: r.usage.promptTokens,
            completionTokens: r.usage.completionTokens,
            repaired: r.repaired,
            attempts: r.attempts,
          });
        }
      } catch (err) {
        if (req.signal.aborted) return finish();
        const timedOut = err instanceof DOMException && err.name === "TimeoutError";
        console.error("[cx-eval] live judge failed:", err instanceof Error ? err.message : err);
        emit({
          type: "fallback",
          reason: timedOut ? `The judge took longer than ${JUDGE_BUDGET_MS / 1000} s.` : "The judge API is unavailable right now.",
        });
      }
      finish();
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
