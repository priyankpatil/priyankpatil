import { createGroq } from "@ai-sdk/groq";
import { APICallError, RetryError, streamText } from "ai";

// Groq retires models regularly (llama-3.3-70b-versatile was shut down on
// 2026-08-16), so the chain is configurable: set GROQ_MODELS to a
// comma-separated list to change it without a code change. Groq rate-limits
// each model separately, so falling back across models also spreads load on
// the free tier.
export const DEFAULT_GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"];

export function groqModelChain(): string[] {
  const configured = process.env.GROQ_MODELS?.split(",").map((m) => m.trim()).filter(Boolean);
  return configured?.length ? configured : DEFAULT_GROQ_MODELS;
}

type FailureKind = "auth" | "model_unavailable" | "rate_limited" | "transient" | "rejected";

interface Failure {
  kind: FailureKind;
  retryAfterMs?: number;
  detail: string;
}

export class LlmConfigError extends Error {}
export class LlmUnavailableError extends Error {}

const FIRST_TOKEN_TIMEOUT_MS = 15_000;
const MAX_TRANSIENT_RETRIES = 1;
const MAX_INLINE_RATE_LIMIT_WAIT_MS = 2_000;
const MODEL_GONE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30_000;

// Per-instance memory of models that recently failed, so later requests skip
// them instead of paying for the same failure again.
const cooldownUntil = new Map<string, number>();

function parseRetryAfter(headers?: Record<string, string>): number | undefined {
  const value = headers?.["retry-after"] ?? headers?.["Retry-After"];
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

export function classifyFailure(err: unknown): Failure {
  const error = RetryError.isInstance(err) ? err.lastError : err;

  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? 0;
    const body = (error.responseBody ?? "").toLowerCase();
    const detail = `HTTP ${status}: ${error.message}`;

    if (status === 401 || status === 403) return { kind: "auth", detail };
    if (
      status === 404 ||
      body.includes("model_decommissioned") ||
      body.includes("model_not_found") ||
      body.includes("decommissioned") ||
      body.includes("does not exist")
    ) {
      return { kind: "model_unavailable", detail };
    }
    if (status === 429) return { kind: "rate_limited", retryAfterMs: parseRetryAfter(error.responseHeaders), detail };
    if (status === 408 || status >= 500) return { kind: "transient", detail };
    return { kind: "rejected", detail };
  }

  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return { kind: "transient", detail: error.message };
  }
  return { kind: "transient", detail: error instanceof Error ? error.message : String(error) };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true }
    );
  });
}

function providerOptionsFor(model: string) {
  // Keep reasoning short: the demo wants SQL fast, not a long chain of thought.
  if (model.startsWith("openai/gpt-oss")) return { groq: { reasoningEffort: "low" as const } };
  if (model.startsWith("qwen/")) return { groq: { reasoningFormat: "hidden" as const } };
  return undefined;
}

async function* textParts(stream: ReturnType<typeof streamText>["fullStream"]): AsyncGenerator<string> {
  for await (const part of stream) {
    if (part.type === "text-delta") yield part.text;
    else if (part.type === "error") throw part.error;
  }
}

async function firstWithTimeout(parts: AsyncGenerator<string>, ms: number): Promise<IteratorResult<string>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`No output within ${ms}ms`);
      err.name = "TimeoutError";
      reject(err);
    }, ms);
  });
  try {
    return await Promise.race([parts.next(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export interface FallbackStream {
  model: string;
  first: string;
  rest: AsyncGenerator<string>;
}

/**
 * Streams a completion from the first Groq model that produces output.
 * Failures before the first token fall through to retries or the next model,
 * so a visitor never sees a partial answer from one model followed by
 * another. Failures after streaming starts surface to the caller.
 */
export async function streamWithFallback({
  system,
  prompt,
  signal,
  maxOutputTokens = 1024,
}: {
  system: string;
  prompt: string;
  signal?: AbortSignal;
  maxOutputTokens?: number;
}): Promise<FallbackStream> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new LlmConfigError("GROQ_API_KEY is not configured.");
  const groq = createGroq({ apiKey });

  const chain = groqModelChain();
  const now = Date.now();
  const available = chain.filter((m) => (cooldownUntil.get(m) ?? 0) <= now);
  // If every model is cooling down, try them all anyway rather than failing outright.
  const candidates = available.length ? available : chain;
  const failures: string[] = [];

  for (const model of candidates) {
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw signal.reason;

      const controller = new AbortController();
      const abort = () => controller.abort(signal?.reason);
      signal?.addEventListener("abort", abort, { once: true });

      try {
        const result = streamText({
          model: groq(model),
          system,
          prompt,
          maxOutputTokens,
          maxRetries: 0, // retries are handled here, with model-aware policy
          abortSignal: controller.signal,
          providerOptions: providerOptionsFor(model),
        });
        const parts = textParts(result.fullStream);
        const first = await firstWithTimeout(parts, FIRST_TOKEN_TIMEOUT_MS);
        if (first.done) throw new Error("Model returned an empty response");
        cooldownUntil.delete(model);
        return { model, first: first.value, rest: parts };
      } catch (err) {
        controller.abort();
        signal?.removeEventListener("abort", abort);
        if (signal?.aborted) throw signal.reason;

        const failure = classifyFailure(err);
        failures.push(`${model} (attempt ${attempt + 1}): ${failure.kind} – ${failure.detail}`);
        console.warn(`[llm] ${model} failed: ${failure.kind} – ${failure.detail}`);

        if (failure.kind === "auth") {
          throw new LlmConfigError(`Groq rejected the API key (${failure.detail}).`);
        }
        if (failure.kind === "model_unavailable") {
          cooldownUntil.set(model, Date.now() + MODEL_GONE_COOLDOWN_MS);
          break;
        }
        if (failure.kind === "rate_limited") {
          const wait = failure.retryAfterMs ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS;
          if (attempt === 0 && wait <= MAX_INLINE_RATE_LIMIT_WAIT_MS) {
            await sleep(wait, signal);
            continue;
          }
          cooldownUntil.set(model, Date.now() + wait);
          break;
        }
        if (failure.kind === "transient" && attempt < MAX_TRANSIENT_RETRIES) {
          await sleep(300 * 2 ** attempt + Math.random() * 200, signal);
          continue;
        }
        break; // rejected request or retries exhausted: try the next model
      }
    }
  }

  throw new LlmUnavailableError(`All Groq models failed:\n${failures.join("\n")}`);
}
