// Exports the metrics shown under the demo on /projects/cx-eval to
// lib/cx-eval/metrics.json, so the page is static and needs no database.
//
//   npx tsx pipelines/cx-eval/scripts/export-metrics.mts
//
// Reads with CXEVAL_DATABASE_URL, falling back to SUPABASE_DB_URL.

import { writeFileSync } from "node:fs";
import pg from "pg";

const dbUrl = process.env.CXEVAL_DATABASE_URL ?? process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Set CXEVAL_DATABASE_URL (or SUPABASE_DB_URL).");
  process.exit(1);
}
const OUT = "lib/cx-eval/metrics.json";
const db = new pg.Client({ connectionString: dbUrl });
await db.connect();

const num = (v: unknown) => (v == null ? null : Number(v));

try {
  // ── Model performance ──
  // Judge setups compared on the SAME chats: those scored by every setup.
  const { rows: setups } = await db.query(`
    with setups as (
      select distinct model, rubric_version from cx_eval.mart_conversation_scores
      where batch_date <= '2026-09-29'
    ),
    shared as (
      select convo_id from cx_eval.mart_conversation_scores where batch_date <= '2026-09-29'
      group by convo_id having count(distinct (model, rubric_version)) = (select count(*) from setups)
    )
    select m.model, m.rubric_version as rubric, count(*) as n,
           round(100.0 * avg(intent_correct::int), 1) as intent,
           round(100.0 * avg(identity_correct::int), 1) as identity,
           round(100.0 * avg(policy_correct::int), 1) as policy,
           round(100.0 * avg((j_identity = 'fail')::int) filter (where gt_identity = 'fail'), 1) as identity_caught,
           count(*) filter (where gt_identity = 'fail') as identity_true_fails
    from cx_eval.mart_conversation_scores m join shared using (convo_id)
    group by 1, 2 order by 1 desc, 2`);

  const { rows: [agreement] } = await db.query(`
    select count(*) filter (where c is not null) as verdicts, round(100.0 * avg(c::int), 1) as pct
    from cx_eval.mart_conversation_scores,
         lateral (values (intent_correct), (identity_correct), (policy_correct)) as v(c)
    where is_production`);

  const { rows: [calls] } = await db.query(`
    select count(*) as calls,
           round(100.0 * avg((status = 'ok' and not repaired)::int), 1) as first_try_pct,
           count(*) filter (where repaired and status = 'ok') as repaired,
           count(*) filter (where status <> 'ok') as failed,
           percentile_disc(0.5) within group (order by latency_ms) filter (where status = 'ok') as p50_ms,
           percentile_disc(0.95) within group (order by latency_ms) filter (where status = 'ok') as p95_ms,
           round(avg(prompt_tokens + completion_tokens) filter (where status = 'ok')) as tokens
    from cx_eval.judge_results`);

  // ── Pipeline operations ──
  const { rows: pipeline } = await db.query(`
    select batch_date::text as date, loaded, quarantined, scored, p50_latency_ms as p50_ms, p95_latency_ms as p95_ms
    from cx_eval.mart_pipeline_health order by batch_date`);

  // ── Support operations ──
  const { rows: support } = await db.query(`
    select batch_date::text as date, cxi_avg as quality, csat_avg as csat, gt_identity_pass_pct as identity
    from cx_eval.mart_cxi_daily order by batch_date`);
  const { rows: teams } = await db.query(`
    select batch_date::text as date, cohort as team, gt_identity_pass_pct as identity
    from cx_eval.mart_cohort_daily where cohort_type = 'team' order by 1, 2`);
  const { rows: [supportTotals] } = await db.query(`
    select (select round(avg(cxi), 1) from cx_eval.mart_conversation_scores where is_production) as quality,
           (select round(avg(score), 2) from cx_eval.csat_responses) as csat,
           (select count(*) from cx_eval.csat_responses) as csat_n,
           (select round(100.0 * avg((gt_identity = 'pass')::int) filter (where gt_identity <> 'na'), 1) from cx_eval.conversations) as identity`);
  const { rows: config } = await db.query(`select effective_from::text as date, model from cx_eval.judge_config order by 1`);

  const totalLoaded = pipeline.reduce((n, d) => n + Number(d.loaded), 0);
  const totalHeld = pipeline.reduce((n, d) => n + Number(d.quarantined), 0);

  const byDate = new Map<string, Record<string, number | null | string>>();
  for (const t of teams) {
    const row: Record<string, number | string | null> = byDate.get(t.date) ?? { date: t.date };
    row[t.team] = num(t.identity);
    byDate.set(t.date, row);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    model: {
      agreementPct: num(agreement.pct),
      verdicts: num(agreement.verdicts),
      firstTryPct: num(calls.first_try_pct),
      calls: num(calls.calls),
      repaired: num(calls.repaired),
      failed: num(calls.failed),
      setups: setups.map((s) => ({
        model: s.model as string,
        rubric: s.rubric as string,
        n: num(s.n),
        intent: num(s.intent),
        identity: num(s.identity),
        policy: num(s.policy),
        identityCaught: num(s.identity_caught),
        identityTrueFails: num(s.identity_true_fails),
      })),
    },
    pipeline: {
      days: pipeline.length,
      loaded: totalLoaded,
      held: totalHeld,
      heldPct: Math.round((1000 * totalHeld) / totalLoaded) / 10,
      p50Ms: num(calls.p50_ms),
      p95Ms: num(calls.p95_ms),
      tokensPerChat: num(calls.tokens),
      daily: pipeline.map((d) => ({
        date: d.date,
        loaded: num(d.loaded),
        held: num(d.quarantined),
        scored: num(d.scored),
        p50: d.p50_ms == null ? null : Math.round(Number(d.p50_ms) / 100) / 10,
        p95: d.p95_ms == null ? null : Math.round(Number(d.p95_ms) / 100) / 10,
      })),
    },
    support: {
      quality: num(supportTotals.quality),
      csat: num(supportTotals.csat),
      csatResponses: num(supportTotals.csat_n),
      identityPct: num(supportTotals.identity),
      modelSwitch: config[1] ?? null,
      daily: support.map((d) => ({ date: d.date, quality: num(d.quality), csat: num(d.csat), identity: num(d.identity) })),
      teams: [...byDate.values()],
    },
  };
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`Wrote ${OUT}`);
  console.log(JSON.stringify({ model: { ...out.model }, pipeline: { ...out.pipeline, daily: undefined }, support: { ...out.support, daily: undefined, teams: undefined } }, null, 1));
} finally {
  await db.end();
}
