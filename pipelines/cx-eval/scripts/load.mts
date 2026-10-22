// Extract + load: lands ABCD conversations in cx_eval as daily raw batches.
// No business logic here; validation and transforms run as SQL in Supabase.
//
//   npx tsx pipelines/cx-eval/scripts/load.mts --days 1-30 --process
//
//   --days 1-30 | --day 7   which simulated days to deliver (default: all)
//   --process               also run cx_eval.process_batch() for each day
//   --data <dir>            dataset cache (default pipelines/cx-eval/.data)
//
// Connects with CXEVAL_DATABASE_URL, falling back to SUPABASE_DB_URL.

import pg from "pg";
import { extractAbcd, referenceFlows, referenceSubflows } from "../src/abcd.ts";
import { buildBatches, SIM_DAYS, type Batch } from "../src/source-sim.ts";

const CHUNK = 500;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function selectedDays(): number[] {
  const spec = arg("day") ?? arg("days") ?? `1-${SIM_DAYS}`;
  const [from, to = from] = spec.split("-").map(Number);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > SIM_DAYS || from > to) {
    throw new Error(`--days must be within 1-${SIM_DAYS}, got "${spec}"`);
  }
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

const dbUrl = process.env.CXEVAL_DATABASE_URL ?? process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Set CXEVAL_DATABASE_URL (or SUPABASE_DB_URL for local runs).");
  process.exit(1);
}
const days = selectedDays();
const client = new pg.Client({ connectionString: dbUrl });

async function loadReference(data: Awaited<ReturnType<typeof extractAbcd>>) {
  const flows = referenceFlows();
  await client.query(
    `INSERT INTO cx_eval.ref_flows (flow, description)
     SELECT * FROM unnest($1::text[], $2::text[])
     ON CONFLICT (flow) DO UPDATE SET description = excluded.description`,
    [flows.map((f) => f.flow), flows.map((f) => f.description)]
  );
  const subflows = referenceSubflows(data);
  await client.query(
    `INSERT INTO cx_eval.ref_subflows (subflow, flow, policy_steps, guideline, is_faq)
     SELECT s, f, ARRAY(SELECT jsonb_array_elements_text(p)), g, q
     FROM unnest($1::text[], $2::text[], $3::jsonb[], $4::text[], $5::bool[]) AS u(s, f, p, g, q)
     ON CONFLICT (subflow) DO UPDATE SET flow = excluded.flow, policy_steps = excluded.policy_steps,
       guideline = excluded.guideline, is_faq = excluded.is_faq`,
    [
      subflows.map((s) => s.subflow),
      subflows.map((s) => s.flow),
      subflows.map((s) => JSON.stringify(s.policySteps)),
      subflows.map((s) => s.guideline),
      subflows.map((s) => s.isFaq),
    ]
  );
  const missing = subflows.filter((s) => !s.guideline).map((s) => s.subflow);
  console.log(`Reference: ${flows.length} flows, ${subflows.length} subflows${missing.length ? ` (no guideline: ${missing.join(", ")})` : ""}`);
  return subflows;
}

async function loadBatch(batch: Batch, checksum: string) {
  const { rows: [run] } = await client.query(
    "INSERT INTO cx_eval.pipeline_runs (stage, batch_date) VALUES ('load', $1) RETURNING run_id",
    [batch.date]
  );
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO cx_eval.raw_batches (batch_date, source, extracted_at, row_count, incident)
       VALUES ($1, $2, now(), $3, $4)
       ON CONFLICT (batch_date) DO UPDATE SET source = excluded.source, extracted_at = excluded.extracted_at,
         loaded_at = now(), row_count = excluded.row_count, incident = excluded.incident`,
      [batch.date, `abcd_v1.1 sha256:${checksum.slice(0, 12)}`, batch.records.length, batch.incident]
    );
    for (let i = 0; i < batch.records.length; i += CHUNK) {
      const records = batch.records.slice(i, i + CHUNK);
      const labels = batch.labels.slice(i, i + CHUNK);
      await client.query(
        `INSERT INTO cx_eval.raw_conversations (convo_id, batch_date, payload)
         SELECT id, $2::date, p FROM unnest($1::text[], $3::jsonb[]) AS u(id, p)
         ON CONFLICT (convo_id) DO UPDATE SET batch_date = excluded.batch_date, payload = excluded.payload,
           loaded_at = now(), validation_status = 'pending', validated_at = NULL`,
        [records.map((r) => r.conversation_id), batch.date, records.map((r) => JSON.stringify(r))]
      );
      await client.query(
        `INSERT INTO cx_eval.labels (convo_id, true_flow, true_subflow)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
         ON CONFLICT (convo_id) DO UPDATE SET true_flow = excluded.true_flow, true_subflow = excluded.true_subflow`,
        [labels.map((l) => l.convo_id), labels.map((l) => l.true_flow), labels.map((l) => l.true_subflow)]
      );
    }
    await client.query("COMMIT");
    await client.query(
      `UPDATE cx_eval.pipeline_runs SET finished_at = now(), status = 'ok', rows_in = $2, rows_out = $2,
         detail = jsonb_build_object('incident', $3::text) WHERE run_id = $1`,
      [run.run_id, batch.records.length, batch.incident]
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    await client.query(
      "UPDATE cx_eval.pipeline_runs SET finished_at = now(), status = 'failed', error = $2 WHERE run_id = $1",
      [run.run_id, (err as Error).message]
    );
    throw err;
  }
}

await client.connect();
try {
  const started = Date.now();
  const data = await extractAbcd(arg("data") ?? "pipelines/cx-eval/.data");
  console.log(`Extracted ${data.conversations.length} conversations (sha256 ${data.checksum.slice(0, 12)})`);
  const subflows = await loadReference(data);
  const batches = buildBatches(data.conversations, subflows);

  for (const day of days) {
    const batch = batches[day - 1];
    await loadBatch(batch, data.checksum);
    let line = `day ${String(day).padStart(2)} ${batch.date}: loaded ${batch.records.length}${batch.incident ? ` [${batch.incident}]` : ""}`;
    if (process.argv.includes("--process")) {
      const { rows } = await client.query("SELECT cx_eval.process_batch($1) AS r", [batch.date]);
      const r = rows[0].r;
      line += ` → valid ${r.validate?.valid ?? "?"}, quarantined ${r.validate?.quarantined ?? "?"}, transformed ${r.transform?.rows_out ?? "?"}, csat ${r.csat?.responses ?? "?"}`;
      if (r.transform?.status === "failed" || r.validate?.status === "failed") line += ` FAILED: ${r.transform?.error ?? r.validate?.error}`;
    }
    console.log(line);
  }
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
} finally {
  await client.end();
}
