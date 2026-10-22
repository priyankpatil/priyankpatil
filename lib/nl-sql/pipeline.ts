import { buildRepairPrompt, buildSystemPrompt, retrieveContext, type RetrievalMode } from "@/lib/nl-sql/context";
import { dbConfigured, logQuery, runReadOnly, type QueryResultSet } from "@/lib/nl-sql/db";
import { cleanSql, refusalReason, validateSql } from "@/lib/nl-sql/validate";
import { LlmConfigError, streamWithFallback } from "@/lib/llm";

export type Stage = "retrieve" | "generate" | "validate" | "execute";

/** Events streamed to the browser as newline-delimited JSON. */
export type PipelineEvent =
  | { type: "stage"; stage: Stage; status: "start" | "done" | "error"; detail?: string }
  | { type: "context"; mode: RetrievalMode; tables: string[]; definitions: string[]; examples: string[] }
  | { type: "sql_delta"; text: string }
  | { type: "sql_reset"; reason: string }
  | { type: "sql"; sql: string }
  | ({ type: "result" } & QueryResultSet)
  | { type: "notice"; message: string }
  | { type: "error"; message: string }
  | { type: "done"; model: string | null; attempts: number; executed: boolean; latencyMs: number };

const MAX_ATTEMPTS = 2; // first try + one self-correction round

// Connection-level failures (not the SQL's fault): skip repair, still show the SQL.
function isUnavailable(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return (
    ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET", "28P01", "28000", "53300", "57P01", "57P03"].includes(e.code ?? "") ||
    /timeout exceeded when trying to connect|Connection terminated/i.test(e.message ?? "")
  );
}

function friendlyDbError(err: unknown): string {
  const e = err as { code?: string; message?: string };
  if (e.code === "57014") return "The query took too long and was cancelled (4s limit).";
  return (e.message ?? String(err)).slice(0, 300);
}

export async function runPipeline(
  question: string,
  emit: (event: PipelineEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const started = Date.now();
  let model: string | null = null;
  let attempts = 0;
  let finalSql: string | null = null;
  let status = "error";
  let lastError: string | null = null;
  let result: QueryResultSet | null = null;
  let retrievedIds: string[] = [];

  try {
    emit({ type: "stage", stage: "retrieve", status: "start" });
    const context = await retrieveContext(question);
    retrievedIds = context.ids;
    emit({
      type: "context",
      mode: context.mode,
      tables: context.tables,
      definitions: context.definitions.map((d) => d.title),
      examples: context.examples.map((e) => e.question),
    });
    emit({ type: "stage", stage: "retrieve", status: "done", detail: context.mode });

    const system = buildSystemPrompt(context);
    const canExecute = dbConfigured() && !context.dbUnavailable;
    let prompt = question;

    while (attempts < MAX_ATTEMPTS) {
      attempts++;

      emit({ type: "stage", stage: "generate", status: "start" });
      const stream = await streamWithFallback({ system, prompt, signal });
      model = stream.model;
      let raw = stream.first;
      emit({ type: "sql_delta", text: stream.first });
      for await (const text of stream.rest) {
        raw += text;
        emit({ type: "sql_delta", text });
      }
      emit({ type: "stage", stage: "generate", status: "done", detail: model });

      emit({ type: "stage", stage: "validate", status: "start" });
      const refusal = refusalReason(raw);
      if (refusal) {
        lastError = refusal;
        status = "refused";
        emit({ type: "sql", sql: "" }); // clear the streamed refusal from the SQL panel
        emit({ type: "stage", stage: "validate", status: "error", detail: "Out of scope" });
        emit({ type: "error", message: refusal });
        return;
      }
      const validation = validateSql(raw);
      if (!validation.ok) {
        lastError = validation.error!;
        emit({ type: "stage", stage: "validate", status: "error", detail: lastError });
        if (attempts < MAX_ATTEMPTS) {
          emit({ type: "sql_reset", reason: lastError });
          prompt = buildRepairPrompt(question, cleanSql(raw), lastError);
          continue;
        }
        status = "invalid";
        emit({ type: "error", message: `The generated SQL didn't pass validation: ${lastError}` });
        return;
      }
      finalSql = validation.sql;
      emit({ type: "sql", sql: finalSql });
      emit({ type: "stage", stage: "validate", status: "done" });

      if (!canExecute) {
        if (context.dbUnavailable) {
          emit({ type: "notice", message: "Live data is unavailable right now, so the query wasn't run. The SQL above is ready to use." });
          status = "db_unavailable";
        } else {
          status = "generated";
        }
        return;
      }

      emit({ type: "stage", stage: "execute", status: "start" });
      try {
        result = await runReadOnly(finalSql);
        emit({ type: "result", ...result });
        emit({ type: "stage", stage: "execute", status: "done", detail: `${result.rowCount} rows` });
        status = "ok";
        return;
      } catch (err) {
        if (isUnavailable(err)) {
          lastError = (err as Error).message;
          console.error("[nl-sql] database unavailable:", lastError);
          emit({ type: "stage", stage: "execute", status: "error", detail: "Database unavailable" });
          emit({ type: "notice", message: "Live data is unavailable right now, so the query wasn't run. The SQL above is ready to use." });
          status = "db_unavailable";
          return;
        }
        lastError = friendlyDbError(err);
        emit({ type: "stage", stage: "execute", status: "error", detail: lastError });
        if (attempts < MAX_ATTEMPTS) {
          emit({ type: "sql_reset", reason: lastError });
          prompt = buildRepairPrompt(question, finalSql, lastError);
          continue;
        }
        status = "execution_error";
        emit({ type: "error", message: `The query failed to run: ${lastError}` });
        return;
      }
    }
  } catch (err) {
    if (signal?.aborted) {
      status = "aborted";
      return;
    }
    lastError = (err as Error).message;
    status = "model_error";
    console.error("[nl-sql] pipeline failed:", err);
    emit({
      type: "error",
      message:
        err instanceof LlmConfigError
          ? "The demo is temporarily unavailable. Please try again later."
          : "The model service is busy right now. Please try again in a minute.",
    });
  } finally {
    const latencyMs = Date.now() - started;
    emit({ type: "done", model, attempts, executed: result !== null, latencyMs });
    if (dbConfigured() && status !== "db_unavailable") {
      await logQuery({
        question,
        sql: finalSql,
        status,
        error: status === "ok" || status === "generated" ? null : lastError,
        model,
        attempts,
        retrievedIds,
        rowCount: result?.rowCount ?? null,
        latencyMs,
      });
    }
  }
}
