-- CX evaluation marts: inputs (conversations, ground truth, CSAT) joined with
-- judge outputs (scores) and telemetry (pipeline_runs, judge_results).
-- Plain views so they are always current; the dashboard reads only these,
-- through the read-only cxeval_reader role.
--
-- CXI follows RUBRIC.md: pass = 100, fail = 0, na excluded with weights
-- renormalised; resolved/partial/unresolved = 100/50/0; empathy and
-- efficiency (1–5) map to (s − 1) / 4 × 100.

-- ── One row per scored conversation (latest successful result per model) ────

create or replace view cx_eval.mart_conversation_scores as
with latest as (
  select distinct on (q.convo_id, r.rubric_version, r.model)
         r.result_id, q.convo_id, q.batch_date, r.rubric_version, r.model, r.latency_ms,
         r.prompt_tokens + r.completion_tokens as tokens, r.repaired
  from cx_eval.judge_results r
  join cx_eval.scoring_requests q using (request_id)
  where r.status = 'ok'
  order by q.convo_id, r.rubric_version, r.model, r.result_id desc
),
wide as (
  select l.*,
         max(s.value) filter (where s.dimension = 'intent') as j_intent,
         max(s.value) filter (where s.dimension = 'identity_verification') as j_identity,
         max(s.value) filter (where s.dimension = 'policy_adherence') as j_policy,
         max(s.value) filter (where s.dimension = 'resolution') as j_resolution,
         max(s.value_num) filter (where s.dimension = 'empathy')::int as j_empathy,
         max(s.evidence) filter (where s.dimension = 'identity_verification') as ev_identity,
         max(s.evidence) filter (where s.dimension = 'policy_adherence') as ev_policy
  from latest l join cx_eval.scores s using (result_id)
  group by l.result_id, l.convo_id, l.batch_date, l.rubric_version, l.model, l.latency_ms, l.tokens, l.repaired
),
medians as (
  select true_subflow, percentile_cont(0.5) within group (order by n_turns) as median_turns
  from cx_eval.conversations group by 1
),
scored as (
  select w.*, c.team_id, c.agent_id, c.channel, c.member_level, c.logged_reason, c.true_flow, c.true_subflow,
         c.reason_tag_correct, c.n_turns, c.is_faq, c.gt_identity, c.gt_policy, cs.score as csat,
         case when c.n_turns <= m.median_turns then 5
              when c.n_turns <= m.median_turns * 1.25 then 4
              when c.n_turns <= m.median_turns * 1.5 then 3
              when c.n_turns <= m.median_turns * 2 then 2
              else 1 end as efficiency,
         v.weights
  from wide w
  join cx_eval.conversations c using (convo_id)
  left join cx_eval.csat_responses cs using (convo_id)
  left join medians m using (true_subflow)
  join cx_eval.rubric_versions v on v.version = w.rubric_version
)
select convo_id, batch_date, rubric_version, model, team_id, agent_id, channel, member_level,
       logged_reason, true_flow, true_subflow, reason_tag_correct, is_faq, n_turns,
       j_intent, j_identity, j_policy, j_resolution, j_empathy, efficiency,
       gt_identity, gt_policy, csat, ev_identity, ev_policy, latency_ms, tokens, repaired,
       j_intent = true_flow as intent_correct,
       case when gt_identity = 'na' then null else j_identity = gt_identity end as identity_correct,
       j_policy = gt_policy as policy_correct,
       round((
         (weights->>'policy_adherence')::numeric * case j_policy when 'pass' then 100 else 0 end
         + case when j_identity = 'na' then 0
                else (weights->>'identity_verification')::numeric * case j_identity when 'pass' then 100 else 0 end end
         + (weights->>'resolution')::numeric * case j_resolution when 'resolved' then 100 when 'partial' then 50 else 0 end
         + (weights->>'empathy')::numeric * (j_empathy - 1) / 4.0 * 100
         + (weights->>'efficiency')::numeric * (efficiency - 1) / 4.0 * 100
       ) / (1 - case when j_identity = 'na' then (weights->>'identity_verification')::numeric else 0 end), 1) as cxi,
       -- The score from the model and rubric live for this day (cx_eval.judge_config).
       -- Business metrics use only these; backtests and re-scores sit alongside.
       (model, rubric_version) = (select c.model, c.rubric_version from cx_eval.judge_config_for(batch_date) c) as is_production
from scored;

-- ── Daily business view ─────────────────────────────────────────────────────

create or replace view cx_eval.mart_cxi_daily as
with volume as (
  select batch_date,
         count(*) as conversations,
         round(100.0 * avg((gt_identity = 'pass')::int) filter (where gt_identity <> 'na'), 1) as gt_identity_pass_pct,
         round(100.0 * avg((gt_policy = 'pass')::int), 1) as gt_policy_pass_pct
  from cx_eval.conversations group by 1
),
csat as (
  select batch_date, round(avg(score), 2) as csat_avg, count(*) as csat_responses,
         round(100.0 * avg((score >= 4)::int), 1) as csat_top2_pct
  from cx_eval.csat_responses group by 1
),
judged as (
  select batch_date, string_agg(distinct model, ', ') as models, count(*) as scored,
         round(avg(cxi), 1) as cxi_avg,
         round(100.0 * avg((j_identity = 'pass')::int) filter (where j_identity <> 'na'), 1) as judge_identity_pass_pct,
         round(100.0 * avg((j_policy = 'pass')::int), 1) as judge_policy_pass_pct,
         round(100.0 * avg((j_resolution = 'resolved')::int), 1) as resolved_pct,
         round(avg(j_empathy), 2) as empathy_avg
  from cx_eval.mart_conversation_scores where is_production group by 1
),
-- Ground truth on the same scored sample, so judge and truth compare like with like.
sample_truth as (
  select batch_date,
         round(100.0 * avg((gt_identity = 'pass')::int) filter (where gt_identity <> 'na'), 1) as sample_gt_identity_pass_pct,
         round(100.0 * avg((gt_policy = 'pass')::int), 1) as sample_gt_policy_pass_pct
  from cx_eval.mart_conversation_scores where is_production group by 1
)
select b.batch_date, b.incident, coalesce(v.conversations, 0) as conversations,
       b.row_count - coalesce(v.conversations, 0) as not_transformed,
       v.gt_identity_pass_pct, v.gt_policy_pass_pct,
       c.csat_avg, c.csat_responses, c.csat_top2_pct,
       j.models, coalesce(j.scored, 0) as scored, j.cxi_avg, j.judge_identity_pass_pct, j.judge_policy_pass_pct,
       j.resolved_pct, j.empathy_avg,
       st.sample_gt_identity_pass_pct, st.sample_gt_policy_pass_pct
from cx_eval.raw_batches b
left join volume v using (batch_date)
left join csat c using (batch_date)
left join judged j using (batch_date)
left join sample_truth st using (batch_date)
order by b.batch_date;

-- ── Cohorts (population metrics from all conversations; CXI from the scored sample) ─

create or replace view cx_eval.mart_cohort_daily as
with cohorts as (
  select c.batch_date, k.cohort_type, k.cohort, c.convo_id, c.gt_identity, c.gt_policy
  from cx_eval.conversations c
  cross join lateral (values
    ('team', c.team_id), ('channel', c.channel), ('member_level', coalesce(c.member_level, 'unknown')),
    ('flow', c.true_flow)) as k(cohort_type, cohort)
)
select k.batch_date, k.cohort_type, k.cohort,
       count(*) as conversations,
       round(100.0 * avg((k.gt_identity = 'pass')::int) filter (where k.gt_identity <> 'na'), 1) as gt_identity_pass_pct,
       count(*) filter (where k.gt_identity <> 'na') as identity_applicable,
       round(100.0 * avg((k.gt_policy = 'pass')::int), 1) as gt_policy_pass_pct,
       round(avg(cs.score), 2) as csat_avg,
       count(cs.score) as csat_responses,
       count(m.cxi) as scored,
       round(avg(m.cxi), 1) as cxi_avg
from cohorts k
left join cx_eval.csat_responses cs on cs.convo_id = k.convo_id
left join cx_eval.mart_conversation_scores m on m.convo_id = k.convo_id and m.is_production
group by 1, 2, 3;

-- ── Judge accuracy against ground truth ─────────────────────────────────────

create or replace view cx_eval.mart_judge_accuracy as
select batch_date, model, count(*) as scored,
       round(100.0 * avg(intent_correct::int), 1) as intent_accuracy_pct,
       round(100.0 * avg(identity_correct::int), 1) as identity_accuracy_pct,
       -- Of the chats that really skipped identity checks, how many did the judge flag?
       round(100.0 * avg((j_identity = 'fail')::int) filter (where gt_identity = 'fail'), 1) as identity_fail_recall_pct,
       count(*) filter (where gt_identity = 'fail') as identity_true_fails,
       round(100.0 * avg(policy_correct::int), 1) as policy_accuracy_pct,
       round(100.0 * avg((j_policy = 'fail')::int) filter (where gt_policy = 'fail'), 1) as policy_fail_recall_pct,
       count(*) filter (where gt_policy = 'fail') as policy_true_fails
from cx_eval.mart_conversation_scores
group by 1, 2;

-- ── Drift: population stability index vs. the first 7 days ──────────────────
-- Trailing 3-day windows (≈60 scored chats) smooth out 20-a-day noise. The
-- same PSI on ground truth tells model drift (judge moves, truth does not)
-- apart from data drift (both move).

create or replace view cx_eval.mart_drift as
with long as (
  select batch_date, 'identity_verification' as dimension, j_identity as judged, gt_identity as truth from cx_eval.mart_conversation_scores where is_production
  union all select batch_date, 'policy_adherence', j_policy, gt_policy from cx_eval.mart_conversation_scores where is_production
  union all select batch_date, 'resolution', j_resolution, null from cx_eval.mart_conversation_scores where is_production
  union all select batch_date, 'empathy', j_empathy::text, null from cx_eval.mart_conversation_scores where is_production
),
bounds as (select min(batch_date) as first_day from long),
days as (select distinct batch_date from long),
baseline as (
  select dimension, source, value, count(*)::numeric / sum(count(*)) over (partition by dimension, source) as p
  from (select dimension, 'judge' as source, judged as value from long, bounds where batch_date < first_day + 7
        union all
        select dimension, 'truth', truth from long, bounds where batch_date < first_day + 7 and truth is not null) as b
  group by 1, 2, 3
),
windowed as (
  select d.batch_date, x.dimension, x.source, x.value,
         count(*)::numeric / sum(count(*)) over (partition by d.batch_date, x.dimension, x.source) as q
  from days d
  join (select batch_date, dimension, 'judge' as source, judged as value from long
        union all select batch_date, dimension, 'truth', truth from long where truth is not null) as x
    on x.batch_date between d.batch_date - 2 and d.batch_date
  group by 1, 2, 3, 4
),
psi as (
  select w.batch_date, w.dimension, w.source,
         -- 0.001 floor avoids log(0) when a value is absent from one side.
         sum((greatest(w.q, 0.001) - greatest(coalesce(b.p, 0), 0.001))
             * ln(greatest(w.q, 0.001) / greatest(coalesce(b.p, 0), 0.001))) as psi
  from windowed w
  left join baseline b using (dimension, source, value)
  group by 1, 2, 3
)
select batch_date, dimension,
       round(max(psi) filter (where source = 'judge'), 3) as judge_psi,
       round(max(psi) filter (where source = 'truth'), 3) as truth_psi,
       case when max(psi) filter (where source = 'judge') >= 0.25 then 'major'
            when max(psi) filter (where source = 'judge') >= 0.1 then 'moderate'
            else 'stable' end as judge_drift
from psi
group by 1, 2;

-- ── Pipeline health ─────────────────────────────────────────────────────────

create or replace view cx_eval.mart_pipeline_health as
with runs as (
  select batch_date,
         max(finished_at) filter (where stage = 'load' and status = 'ok') as loaded_at,
         max(finished_at) filter (where stage = 'transform' and status = 'ok') as transformed_at,
         count(*) filter (where status = 'failed') as failed_stage_runs
  from cx_eval.pipeline_runs where batch_date is not null group by 1
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

-- ── Retraining export: where the judge disagreed with ground truth ──────────
-- A labelled dataset for improving the judge (prompt fixes, few-shot examples
-- or fine-tuning): the input, the judge's answer, the right answer and why.

create or replace view cx_eval.mart_retraining_export as
select m.convo_id, m.batch_date, m.model, m.rubric_version, d.dimension, d.judged, d.expected, d.evidence,
       m.logged_reason, m.true_subflow,
       (select string_agg(upper(t.speaker) || ': ' || coalesce('[' || t.button || '] ', '') || t.text, E'\n' order by t.turn_idx)
        from cx_eval.turns t where t.convo_id = m.convo_id) as transcript
from cx_eval.mart_conversation_scores m
cross join lateral (values
  ('intent', m.j_intent, m.true_flow, null),
  ('identity_verification', m.j_identity, m.gt_identity, m.ev_identity),
  ('policy_adherence', m.j_policy, m.gt_policy, m.ev_policy)
) as d(dimension, judged, expected, evidence)
where d.judged is distinct from d.expected
  and not (d.dimension = 'identity_verification' and d.expected = 'na' and d.judged = 'na');

-- ── Read-only role for the dashboard ────────────────────────────────────────
-- Sees the mart views only (views run with their owner's rights, so no grants
-- on the underlying tables). After running, set its password:
--   alter role cxeval_reader with password '<long random password>';
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cxeval_reader') then
    create role cxeval_reader login noinherit connection limit 10;
  end if;
end
$$;
alter role cxeval_reader set statement_timeout = '10s';
alter role cxeval_reader set default_transaction_read_only = on;
grant usage on schema cx_eval to cxeval_reader;
grant select on cx_eval.mart_conversation_scores, cx_eval.mart_cxi_daily, cx_eval.mart_cohort_daily,
  cx_eval.mart_judge_accuracy, cx_eval.mart_drift, cx_eval.mart_pipeline_health,
  cx_eval.mart_retraining_export, cx_eval.alerts, cx_eval.judge_config to cxeval_reader;
