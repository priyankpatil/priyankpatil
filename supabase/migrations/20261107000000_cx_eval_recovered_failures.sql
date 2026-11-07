-- CX evaluation: a stage that failed and later succeeded is no longer a failure.
--
-- mart_pipeline_health counted every failed run a batch ever had, so one failed
-- load (2026-11-07, before the redaction migration was applied) re-raised a
-- critical stage_failure alert for that batch on every later run. Only failures
-- with no later successful run of the same stage now count. Failed rows stay in
-- pipeline_runs as history.

create or replace view cx_eval.mart_pipeline_health as
with runs as (
  select batch_date,
         max(finished_at) filter (where stage = 'load' and status = 'ok') as loaded_at,
         max(finished_at) filter (where stage = 'transform' and status = 'ok') as transformed_at,
         -- Failures not yet followed by a successful run of the same stage, so a
         -- stage that failed once and then recovered stops raising stage_failure.
         count(*) filter (where status = 'failed' and not exists (
           select 1 from cx_eval.pipeline_runs later
           where later.batch_date = r.batch_date and later.stage = r.stage
             and later.status = 'ok' and later.run_id > r.run_id)) as failed_stage_runs
  from cx_eval.pipeline_runs r where batch_date is not null group by 1
),
q as (
  select batch_date, count(distinct convo_id) filter (where severity = 'error') as quarantined,
         string_agg(distinct check_name, ', ') filter (where severity = 'error') as quarantine_checks,
         string_agg(distinct check_name, ', ') filter (where severity = 'warn') as warnings
  from cx_eval.quarantine group by 1
),
scoring as (
  select q.batch_date, count(*) as requests,
         count(*) filter (where q.status = 'done') as scored,
         count(*) filter (where q.status = 'failed') as score_failed,
         count(*) filter (where q.status = 'pending') as score_pending
  from cx_eval.scoring_requests q group by 1
),
latency as (
  select q.batch_date,
         percentile_disc(0.5) within group (order by r.latency_ms) as p50_latency_ms,
         percentile_disc(0.95) within group (order by r.latency_ms) as p95_latency_ms,
         round(avg(r.prompt_tokens + r.completion_tokens)) as tokens_per_chat,
         count(*) filter (where r.repaired) as repaired,
         count(*) filter (where r.status <> 'ok') as judge_errors
  from cx_eval.judge_results r join cx_eval.scoring_requests q using (request_id) group by 1
)
select b.batch_date, b.incident, b.row_count as loaded,
       coalesce(q.quarantined, 0) as quarantined,
       round(100.0 * coalesce(q.quarantined, 0) / nullif(b.row_count, 0), 1) as quarantine_pct,
       q.quarantine_checks, q.warnings,
       runs.loaded_at, runs.transformed_at, runs.failed_stage_runs,
       s.requests, s.scored, s.score_failed, s.score_pending,
       l.p50_latency_ms, l.p95_latency_ms, l.tokens_per_chat, l.repaired, l.judge_errors
from cx_eval.raw_batches b
left join runs using (batch_date)
left join q using (batch_date)
left join scoring s using (batch_date)
left join latency l using (batch_date)
order by b.batch_date;
