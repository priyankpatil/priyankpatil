import { createHash } from "node:crypto";
import type { JudgeContext, JudgeOutput, RubricVersion } from "../contract.ts";
import { chat, NvidiaConfigError, NVIDIA_MODELS, type ChatResult, type Usage } from "./nvidia.ts";
import { parseJudgeOutput } from "./parse.ts";

// Scores one conversation with the LLM judge and returns a row-shaped result
// for cx_eval.scores / scoring telemetry. The rubric is a parameter, never
// imported, so rubric versions can change without touching the client.

export type JudgeStatus = "ok" | "invalid" | "error";

export interface JudgeResult {
  convoId: string;
  /** ok: valid output. invalid: the model answered but not with valid JSON, even after repair. error: no answer. */
  status: JudgeStatus;
  output?: JudgeOutput;
  /** The reply that produced `output` (the repaired one if repaired), or the last reply seen. "" on error. */
  rawContent: string;
  error?: string;
  /** Model as reported by the API (falls back to the requested id). */
  model: string;
  rubricVersion: string;
  /** sha256 of the rendered prompt; identical prompts hash identically across runs. */
  promptHash: string;
  /** Summed over the first call and the repair call. */
  usage: Usage;
  latencyMs: number;
  /** HTTP attempts across both calls, including retries. */
  attempts: number;
  repaired: boolean;
}

const MAX_TOKENS = 4096;

const ZERO_USAGE: Usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

function addUsage(a: Usage, b: Usage): Usage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

/** NUL-separated so ("ab", "c") and ("a", "bc") hash differently. */
export function promptHash(system: string, user: string): string {
  return createHash("sha256").update(system).update("\u0000").update(user).digest("hex");
}

function repairPrompt(error: string): string {
  return [
    "Your previous reply could not be used. Validation error:",
    error,
    "Reply with the corrected JSON object only: no prose, no code fences, no keys other than those required.",
  ].join("\n");
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function attemptsOf(err: unknown): number {
  const attempts = (err as { attempts?: unknown } | null)?.attempts;
  return typeof attempts === "number" ? attempts : 1;
}

export async function judgeConversation({
  rubric,
  context,
  model = NVIDIA_MODELS.primary,
  signal,
}: {
  rubric: RubricVersion;
  context: JudgeContext;
  model?: string;
  signal?: AbortSignal;
}): Promise<JudgeResult> {
  const { system, user } = rubric.buildPrompt(context);
  const result: JudgeResult = {
    convoId: context.convoId,
    status: "error",
    rawContent: "",
    model,
    rubricVersion: rubric.version,
    promptHash: promptHash(system, user),
    usage: ZERO_USAGE,
    latencyMs: 0,
    attempts: 0,
    repaired: false,
  };
  const record = (r: ChatResult) => {
    result.model = r.model;
    result.usage = addUsage(result.usage, r.usage);
    result.latencyMs += r.latencyMs;
    result.attempts += r.attempts;
    result.rawContent = r.content;
  };

  let first: ChatResult;
  try {
    first = await chat({ model, system, user, maxTokens: MAX_TOKENS, signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    // Config errors are rethrown so a batch can stop paying for the same failure.
    if (err instanceof NvidiaConfigError) throw err;
    return { ...result, error: errorMessage(err), attempts: attemptsOf(err) };
  }
  record(first);

  const parsed = parseJudgeOutput(first.content);
  if (parsed.ok) return { ...result, status: "ok", output: parsed.value };

  // One repair round: show the model its own reply and the exact error.
  const firstError = parsed.error + (first.finishReason === "length" ? " (The reply hit the token limit.)" : "");
  let second: ChatResult;
  try {
    second = await chat({
      model,
      system,
      user,
      followUp: [
        { role: "assistant", content: first.content },
        { role: "user", content: repairPrompt(firstError) },
      ],
      maxTokens: MAX_TOKENS,
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (err instanceof NvidiaConfigError) throw err;
    result.attempts += attemptsOf(err);
    return { ...result, status: "invalid", error: `${firstError} Repair call failed: ${errorMessage(err)}` };
  }
  record(second);

  const repaired = parseJudgeOutput(second.content);
  if (repaired.ok) return { ...result, status: "ok", output: repaired.value, repaired: true };
  return { ...result, status: "invalid", error: `First reply: ${firstError} After repair: ${repaired.error}` };
}

/**
 * Scores many conversations with at most `concurrency` requests in flight,
 * calling onResult as each one finishes so the caller can write incrementally.
 * A failed item becomes an "error" result and the batch carries on, except
 * that a configuration error (bad key, unavailable model) marks the remaining
 * items as errors without calling the API, since every call would fail alike.
 * Results are returned in input order. If onResult throws, the batch still
 * finishes and then throws, so a failed write is never silent.
 */
export async function judgeBatch(
  items: JudgeContext[],
  {
    rubric,
    model = NVIDIA_MODELS.primary,
    concurrency = 4,
    onResult,
    signal,
  }: {
    rubric: RubricVersion;
    model?: string;
    concurrency?: number;
    onResult?: (result: JudgeResult, index: number) => void | Promise<void>;
    signal?: AbortSignal;
  }
): Promise<JudgeResult[]> {
  const results: JudgeResult[] = new Array(items.length);
  const callbackErrors: string[] = [];
  let configError: NvidiaConfigError | undefined;
  let next = 0;

  const errorResult = (context: JudgeContext, error: string, attempts: number): JudgeResult => {
    let hash = "";
    try {
      const p = rubric.buildPrompt(context);
      hash = promptHash(p.system, p.user);
    } catch {
      // buildPrompt itself failed; the error message says so.
    }
    return {
      convoId: context.convoId,
      status: "error",
      rawContent: "",
      error,
      model,
      rubricVersion: rubric.version,
      promptHash: hash,
      usage: ZERO_USAGE,
      latencyMs: 0,
      attempts,
      repaired: false,
    };
  };

  const scoreOne = async (context: JudgeContext): Promise<JudgeResult> => {
    if (configError) return errorResult(context, `Skipped after configuration error: ${configError.message}`, 0);
    try {
      return await judgeConversation({ rubric, context, model, signal });
    } catch (err) {
      if (signal?.aborted) throw err;
      if (err instanceof NvidiaConfigError) configError ??= err;
      return errorResult(context, errorMessage(err), attemptsOf(err));
    }
  };

  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      const result = await scoreOne(items[index]);
      results[index] = result;
      try {
        await onResult?.(result, index);
      } catch (err) {
        callbackErrors.push(`${result.convoId}: ${errorMessage(err)}`);
      }
    }
  };

  const workers = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workers }, worker));

  if (callbackErrors.length) {
    throw new Error(`onResult failed for ${callbackErrors.length} of ${items.length} results:\n${callbackErrors.join("\n")}`);
  }
  return results;
}
