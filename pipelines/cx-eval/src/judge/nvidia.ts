// Minimal client for the NVIDIA API Catalog (OpenAI-compatible chat
// completions), used only by the batch judge. It is separate from lib/llm.ts:
// batch scoring wants long timeouts and patient rate-limit backoff, while the
// site's Groq client is tuned for a visitor waiting on the first token.
//
// Free-tier behaviour seen in testing (2026-10-21): no rate-limit headers,
// occasional 429s above ~4 concurrent requests, 404 "Function ... Not found
// for account" for models the key cannot use, and some very slow responses.

export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

export const NVIDIA_MODELS = {
  /** Primary judge. Reasoning model: the final answer is in message.content. */
  primary: "openai/gpt-oss-20b",
  /** Used deliberately for the day-18 "model switch" incident. */
  secondary: "nvidia/nemotron-3-ultra-550b-a55b",
} as const;

const REQUEST_TIMEOUT_MS = 90_000;
// 429s: patient backoff (5s, 10s, 20s plus jitter), since a batch can wait.
const MAX_RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BASE_MS = 5_000;
// 5xx and network errors: shorter backoff (2s, 4s plus jitter).
const MAX_TRANSIENT_RETRIES = 2;
const TRANSIENT_BASE_MS = 2_000;
// A 90s timeout usually means the model is overloaded; one retry is enough.
const MAX_TIMEOUT_RETRIES = 1;
// Never sleep longer than this between attempts, whatever Retry-After says.
const MAX_BACKOFF_MS = 60_000;

/** Not worth retrying: missing key, rejected key, or a model this key cannot use. */
export class NvidiaConfigError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly attempts = 1
  ) {
    super(message);
    this.name = "NvidiaConfigError";
  }
}

/** The request itself was rejected (other 4xx); retrying would fail the same way. */
export class NvidiaRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly attempts = 1
  ) {
    super(message);
    this.name = "NvidiaRequestError";
  }
}

export type RetryableKind = "rate_limited" | "server" | "timeout" | "network";

/** A retryable failure that persisted after every retry. */
export class NvidiaUnavailableError extends Error {
  constructor(
    message: string,
    readonly kind: RetryableKind,
    readonly attempts: number,
    readonly status?: number
  ) {
    super(message);
    this.name = "NvidiaUnavailableError";
  }
}

export type NvidiaError = NvidiaConfigError | NvidiaRequestError | NvidiaUnavailableError;

export function isNvidiaError(err: unknown): err is NvidiaError {
  return err instanceof NvidiaConfigError || err instanceof NvidiaRequestError || err instanceof NvidiaUnavailableError;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResult {
  content: string;
  usage: Usage;
  /** Wall-clock time of the successful attempt only. */
  latencyMs: number;
  /** The model the API reports, which can differ in spelling from the one requested. */
  model: string;
  finishReason: string | null;
  /** HTTP attempts made, including the successful one. */
  attempts: number;
}

export interface ChatOptions {
  model: string;
  system: string;
  user: string;
  /** Extra turns after the first user message, e.g. a repair round. */
  followUp?: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface RetryableFailure {
  kind: RetryableKind;
  status?: number;
  retryAfterMs?: number;
  detail: string;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
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

function backoffMs(failure: RetryableFailure, retry: number): number {
  if (failure.retryAfterMs !== undefined) return Math.min(failure.retryAfterMs + Math.random() * 1000, MAX_BACKOFF_MS);
  const base = failure.kind === "rate_limited" ? RATE_LIMIT_BASE_MS : TRANSIENT_BASE_MS;
  // Jitter of up to half the step spreads out workers that were throttled together.
  const step = base * 2 ** retry;
  return Math.min(step + Math.random() * step * 0.5, MAX_BACKOFF_MS);
}

function maxRetriesFor(kind: RetryableKind): number {
  if (kind === "rate_limited") return MAX_RATE_LIMIT_RETRIES;
  if (kind === "timeout") return MAX_TIMEOUT_RETRIES;
  return MAX_TRANSIENT_RETRIES;
}

function truncate(text: string, max = 300): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

interface CompletionResponse {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

/**
 * One chat completion with retries. Throws NvidiaConfigError or
 * NvidiaRequestError immediately, NvidiaUnavailableError once retries for a
 * retryable failure are exhausted, and the caller's abort reason if `signal`
 * fires. Retry budgets are per failure kind, so a 429 followed by a 502 does
 * not use up the rate-limit budget.
 */
export async function chat({
  model,
  system,
  user,
  followUp = [],
  maxTokens = 4096,
  temperature = 0,
  signal,
  timeoutMs = REQUEST_TIMEOUT_MS,
}: ChatOptions): Promise<ChatResult> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new NvidiaConfigError("NVIDIA_API_KEY is not set.", undefined, 0);

  const body = JSON.stringify({
    model,
    messages: [{ role: "system", content: system }, { role: "user", content: user }, ...followUp],
    max_tokens: maxTokens,
    temperature,
    stream: false,
  });

  const retries: Record<RetryableKind, number> = { rate_limited: 0, server: 0, timeout: 0, network: 0 };

  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) throw signal.reason;

    // Own controller so a timeout can be told apart from the caller aborting.
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const started = Date.now();
    let failure: RetryableFailure;
    try {
      const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body,
        signal: controller.signal,
      });
      const text = await res.text();

      if (res.ok) {
        let data: CompletionResponse;
        try {
          data = JSON.parse(text) as CompletionResponse;
        } catch {
          // A proxy error page with a 200 status; treat like a server error.
          throw Object.assign(new Error(`Non-JSON response body: ${truncate(text)}`), { kind: "server" });
        }
        const choice = data.choices?.[0];
        const promptTokens = data.usage?.prompt_tokens ?? 0;
        const completionTokens = data.usage?.completion_tokens ?? 0;
        return {
          // null when a reasoning model spends the whole budget thinking; the caller sees "" and can treat it as invalid.
          content: choice?.message?.content ?? "",
          usage: { promptTokens, completionTokens, totalTokens: data.usage?.total_tokens ?? promptTokens + completionTokens },
          latencyMs: Date.now() - started,
          model: data.model ?? model,
          finishReason: choice?.finish_reason ?? null,
          attempts: attempt,
        };
      }

      const detail = `HTTP ${res.status} from ${model}: ${truncate(text)}`;
      if (res.status === 401 || res.status === 403) {
        throw new NvidiaConfigError(`NVIDIA rejected the API key (${detail}).`, res.status, attempt);
      }
      if (res.status === 404) {
        throw new NvidiaConfigError(
          `Model "${model}" is not available to this NVIDIA key (${detail}). Pick a model that works for the account.`,
          res.status,
          attempt
        );
      }
      if (res.status === 429) {
        failure = { kind: "rate_limited", status: 429, retryAfterMs: parseRetryAfter(res.headers.get("retry-after")), detail };
      } else if (res.status === 408 || res.status >= 500) {
        failure = { kind: res.status === 408 || res.status === 504 ? "timeout" : "server", status: res.status, detail };
      } else {
        throw new NvidiaRequestError(`NVIDIA rejected the request (${detail}).`, res.status, attempt);
      }
    } catch (err) {
      if (isNvidiaError(err)) throw err;
      if (signal?.aborted) throw signal.reason;
      if (timedOut) {
        failure = { kind: "timeout", detail: `No response from ${model} within ${timeoutMs}ms` };
      } else if (err instanceof Error && (err as Error & { kind?: RetryableKind }).kind === "server") {
        failure = { kind: "server", detail: err.message };
      } else {
        const cause = err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : "";
        failure = { kind: "network", detail: `${err instanceof Error ? err.message : String(err)}${cause}` };
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }

    if (retries[failure.kind] >= maxRetriesFor(failure.kind)) {
      throw new NvidiaUnavailableError(
        `${failure.detail} (gave up after ${attempt} attempts)`,
        failure.kind,
        attempt,
        failure.status
      );
    }
    const wait = backoffMs(failure, retries[failure.kind]);
    retries[failure.kind]++;
    console.warn(`[nvidia] ${failure.kind} on attempt ${attempt}, retrying in ${Math.round(wait / 1000)}s: ${failure.detail}`);
    await sleep(wait, signal);
  }
}
