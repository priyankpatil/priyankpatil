// Stage 4: runs the LLM judge over pending cx_eval.scoring_requests and stores
// every outcome. Each result is written as it arrives, so a crash or timeout
// loses at most the requests in flight, and a re-run picks up where it left off.
//
//   npx tsx pipelines/cx-eval/scripts/score.mts --days 1-30 --limit 50 --concurrency 4
//
//   --days 1-30 | --day 7   batches to score (default: all pending)
//   --limit N               stop after N requests (default: no limit)
//   --concurrency N         parallel judge calls (default 4; NVIDIA free tier)
//   --retry-failed          also re-run requests marked failed
//
// Writes: judge_results (one row per outcome, including failures), scores
// (one row per dimension), scoring_runs (one row per model per run).

import pg from "pg";
import type { JudgeContext, JudgeOutput, LlmDimension } from "../src/contract.ts";
import { judgeBatch, type JudgeResult } from "../src/judge/judge.ts";
import { rubricV1 } from "../src/rubric/v1.ts";
import { rubricV2 } from "../src/rubric/v2.ts";
import { dayDate, SIM_DAYS } from "../src/source-sim.ts";

const RUBRICS = { [rubricV1.version]: rubricV1, [rubricV2.version]: rubricV2 };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const daySpec = arg("day") ?? arg("days") ?? `1-${SIM_DAYS}`;
const [fromDay, toDay = fromDay] = daySpec.split("-").map(Number);
const limit = arg("limit") ? Number(arg("limit")) : null;
const concurrency = Number(arg("concurrency") ?? 4);
const statuses = process.argv.includes("--retry-failed") ? ["pending", "failed"] : ["pending"];

const dbUrl = process.env.CXEVAL_DATABASE_URL ?? process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Set CXEVAL_DATABASE_URL (or SUPABASE_DB_URL for local runs).");
  process.exit(1);
}
const db = new pg.Pool({ connectionString: dbUrl, max: 4, keepAlive: true });
// A connection dropped by the network (idle in the pool or checked out between
// queries) must not crash the run: the pool replaces it, and a failed write
// leaves its request pending for the next run.
db.on("error", (err) => console.error("[db] idle connection error:", err.message));
db.on("connect", (client) => client.on("error", (err) => console.error("[db] connection error:", err.message)));

/** Numeric form of each dimension for aggregation; null where an average is meaningless. */
function numeric(dimension: LlmDimension, output: JudgeOutput): number | null {
  const value = output[dimension];
  if (dimension === "empathy") return value as number;
  if (value === "pass" || value === "resolved") return 1;
  if (value === "partial") return 0.5;
  if (value === "fail" || value === "unresolved") return 0;
  return null; // intent (categorical) and na
}

async function store(result: JudgeResult, request: { request_id: string; batch_date: string }, runId: string) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows: [row] } = await client.query(
      `INSERT INTO cx_eval.judge_results
         (request_id, run_id, status, model, rubric_version, prompt_hash, raw_content, error,
          prompt_tokens, completion_tokens, latency_ms, attempts, repaired)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING result_id`,
      [request.request_id, runId, result.status, result.model, result.rubricVersion, result.promptHash,
       result.rawContent || null, result.error ?? null, result.usage.promptTokens, result.usage.completionTokens,
       Math.round(result.latencyMs), result.attempts, result.repaired]
    );
    if (result.status === "ok" && result.output) {
      const output = result.output;
      const dims = Object.keys(output.evidence) as LlmDimension[];
      await client.query(
        `INSERT INTO cx_eval.scores (result_id, convo_id, batch_date, rubric_version, model, dimension, value, value_num, evidence)
         SELECT $1, $2, $3, $4, $5, d, v, n, e FROM unnest($6::text[], $7::text[], $8::numeric[], $9::text[]) AS u(d, v, n, e)`,
        [row.result_id, result.convoId, request.batch_date, result.rubricVersion, result.model,
         dims, dims.map((d) => String(output[d])), dims.map((d) => numeric(d, output)), dims.map((d) => output.evidence[d])]
      );
    }
    await client.query("UPDATE cx_eval.scoring_requests SET status = $2 WHERE request_id = $1", [
      request.request_id,
      result.status === "ok" ? "done" : "failed",
    ]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const percentile = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null);

try {
  const { rows: requests } = await db.query(
    `SELECT request_id, convo_id, batch_date::text, rubric_version, model, context
     FROM cx_eval.scoring_requests
     WHERE status = ANY($1) AND batch_date BETWEEN $2 AND $3
     ORDER BY batch_date, request_id
     LIMIT $4`,
    [statuses, dayDate(fromDay), dayDate(toDay), limit]
  );
  if (!requests.length) {
    console.log("Nothing to score.");
  }

  // One scoring run per model, so telemetry compares like with like.
  const byModel = new Map<string, typeof requests>();
  for (const r of requests) byModel.set(`${r.model}|${r.rubric_version}`, [...(byModel.get(`${r.model}|${r.rubric_version}`) ?? []), r]);

  for (const [key, group] of byModel) {
    const [model, rubricVersion] = key.split("|");
    const rubric = RUBRICS[rubricVersion];
    if (!rubric) throw new Error(`No rubric implementation for version ${rubricVersion}`);
    const { rows: [run] } = await db.query(
      "INSERT INTO cx_eval.scoring_runs (model, rubric_version, n_requested) VALUES ($1, $2, $3) RETURNING run_id",
      [model, rubricVersion, group.length]
    );
    console.log(`\nRun ${run.run_id}: ${group.length} requests with ${model} (rubric ${rubricVersion}), concurrency ${concurrency}`);

    const started = Date.now();
    let done = 0;
    const results = await judgeBatch(group.map((r) => r.context as JudgeContext), {
      rubric,
      model,
      concurrency,
      onResult: async (result, i) => {
        await store(result, group[i], run.run_id);
        done++;
        const flag = result.status === "ok" ? (result.repaired ? "ok (repaired)" : "ok") : `${result.status}: ${result.error?.slice(0, 90)}`;
        console.log(`  [${String(done).padStart(3)}/${group.length}] ${group[i].batch_date} ${result.convoId.padEnd(10)} ${(result.latencyMs / 1000).toFixed(1).padStart(5)}s ${flag}`);
      },
    });

    const latencies = results.filter((r) => r.status === "ok").map((r) => r.latencyMs).sort((a, b) => a - b);
    const count = (s: string) => results.filter((r) => r.status === s).length;
    const nOk = count("ok");
    await db.query(
      `UPDATE cx_eval.scoring_runs SET finished_at = now(), n_ok = $2, n_invalid = $3, n_error = $4,
         p50_latency_ms = $5, p95_latency_ms = $6, total_tokens = $7, status = $8 WHERE run_id = $1`,
      [run.run_id, nOk, count("invalid"), count("error"), percentile(latencies, 0.5), percentile(latencies, 0.95),
       results.reduce((n, r) => n + r.usage.totalTokens, 0),
       nOk === results.length ? "ok" : nOk === 0 ? "failed" : "partial"]
    );
    console.log(`Run ${run.run_id} finished in ${((Date.now() - started) / 60000).toFixed(1)} min: ok ${nOk}, invalid ${count("invalid")}, error ${count("error")}, p50 ${((percentile(latencies, 0.5) ?? 0) / 1000).toFixed(1)}s`);
  }
} finally {
  await db.end();
}
