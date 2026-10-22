-- CX evaluation: monitoring, alerting and the pipeline's write role.
--
--   select cx_eval.run_checks('2026-10-18');   -- evaluate every check for a batch → cx_eval.alerts
--   select cx_eval.check_freshness();          -- hourly watchdog (pg_cron)
--
-- Checks cover three layers, so an investigation can start from the right one:
--   data      quarantine rate, volume, failed stages, freshness
--   model     judge errors, latency, drift vs ground truth, accuracy
--   business  CSAT and cohort compliance
-- Alerts are idempotent per (batch, check, subject): re-running updates them in
-- place (keeping any linked issue), and alerts whose condition has cleared are
-- marked resolved, so the orchestrator can close their issues.

alter table cx_eval.alerts add column if not exists layer text;
alter table cx_eval.alerts add column if not exists subject text not null default '';
-- The run that last confirmed the alert; alerts not confirmed by the latest run resolve.
alter table cx_eval.alerts add column if not exists last_seen_run bigint;
alter table cx_eval.alerts add column if not exists resolved_at timestamptz;
create unique index if not exists alerts_dedupe_idx on cx_eval.alerts (coalesce(batch_date, '1900-01-01'), check_name, subject);

drop function if exists cx_eval.raise_alert(date, text, text, text, text, text, jsonb);
create or replace function cx_eval.raise_alert(
  p_run bigint, p_batch date, p_check text, p_layer text, p_severity text, p_subject text, p_message text, p_detail jsonb)
returns void language sql as $$
  insert into cx_eval.alerts (batch_date, check_name, layer, severity, subject, message, detail, last_seen_run)
  values (p_batch, p_check, p_layer, p_severity, coalesce(p_subject, ''), p_message, p_detail, p_run)
  on conflict (coalesce(batch_date, '1900-01-01'), check_name, subject)
  do update set severity = excluded.severity, message = excluded.message, detail = excluded.detail,
                last_seen_run = excluded.last_seen_run, status = 'open', resolved_at = null
$$;

create or replace function cx_eval.run_checks(p_batch date)
returns jsonb language plpgsql as $$
declare
  v_run bigint;
  v_n   int;
  r     record;
begin
  insert into cx_eval.pipeline_runs (stage, batch_date) values ('checks', p_batch) returning run_id into v_run;

  -- ── Data layer ──
  for r in
    select h.*, avg(p.loaded) as avg_prior
    from cx_eval.mart_pipeline_health h
    left join cx_eval.mart_pipeline_health p on p.batch_date between p_batch - 7 and p_batch - 1
    where h.batch_date = p_batch
    group by h.batch_date, h.incident, h.loaded, h.quarantined, h.quarantine_pct, h.quarantine_checks, h.warnings,
             h.loaded_at, h.transformed_at, h.failed_stage_runs, h.requests, h.scored, h.score_failed, h.score_pending,
             h.p50_latency_ms, h.p95_latency_ms, h.tokens_per_chat, h.repaired, h.judge_errors
  loop
    if r.quarantine_pct >= 5 then
      perform cx_eval.raise_alert(v_run, p_batch, 'quarantine_rate', 'data', 'critical', '',
        format('%s%% of records quarantined (%s of %s): %s. Warnings: %s.', r.quarantine_pct, r.quarantined, r.loaded,
               r.quarantine_checks, coalesce(r.warnings, 'none')),
        jsonb_build_object('quarantined', r.quarantined, 'loaded', r.loaded, 'checks', r.quarantine_checks, 'warnings', r.warnings));
    end if;
    if r.avg_prior is not null and abs(r.loaded - r.avg_prior) / r.avg_prior > 0.3 then
      perform cx_eval.raise_alert(v_run, p_batch, 'volume', 'data', 'warn', '',
        format('Loaded %s records vs a 7-day average of %s.', r.loaded, round(r.avg_prior)),
        jsonb_build_object('loaded', r.loaded, 'avg_prior', round(r.avg_prior)));
    end if;
    if r.failed_stage_runs > 0 then
      perform cx_eval.raise_alert(v_run, p_batch, 'stage_failure', 'data', 'critical', '',
        format('%s pipeline stage run(s) failed for this batch.', r.failed_stage_runs),
        jsonb_build_object('failed_runs', r.failed_stage_runs));
    end if;

    -- ── Model layer: judge operations ──
    if r.requests > 0 and (r.score_failed::numeric / r.requests) > 0.1 then
      perform cx_eval.raise_alert(v_run, p_batch, 'judge_errors', 'model', 'warn', '',
        format('%s of %s scoring requests failed.', r.score_failed, r.requests),
        jsonb_build_object('failed', r.score_failed, 'requests', r.requests));
    end if;
    if r.p95_latency_ms > 60000 then
      perform cx_eval.raise_alert(v_run, p_batch, 'judge_latency', 'model', 'warn', '',
        format('p95 judge latency %ss (p50 %ss).', round(r.p95_latency_ms / 1000.0, 1), round(r.p50_latency_ms / 1000.0, 1)),
        jsonb_build_object('p50_ms', r.p50_latency_ms, 'p95_ms', r.p95_latency_ms));
    end if;
  end loop;

  -- ── Model layer: judge drift that ground truth does not explain ──
  for r in
    select d.*, (select string_agg(distinct model, ', ') from cx_eval.mart_conversation_scores m
                 where m.batch_date between p_batch - 2 and p_batch) as models
    from cx_eval.mart_drift d
    where d.batch_date = p_batch and d.judge_psi >= 0.1 and coalesce(d.truth_psi, 0) < 0.1
  loop
    perform cx_eval.raise_alert(v_run, p_batch, 'judge_drift', 'model', case when r.judge_psi >= 0.25 then 'critical' else 'warn' end,
      r.dimension,
      format('Judge scores for %s shifted (PSI %s) while ground truth did not (PSI %s). Models in window: %s.',
             r.dimension, r.judge_psi, coalesce(r.truth_psi::text, 'n/a'), r.models),
      jsonb_build_object('judge_psi', r.judge_psi, 'truth_psi', r.truth_psi, 'models', r.models));
  end loop;

  -- ── Model layer: accuracy vs ground truth (trailing 3 days vs the first 7) ──
  for r in
    with base as (
      select avg(identity_correct::int) as id_acc, avg(policy_correct::int) as pol_acc
      from cx_eval.mart_conversation_scores, (select min(batch_date) as d0 from cx_eval.raw_batches) b
      where batch_date < b.d0 + 7),
    recent as (
      select avg(identity_correct::int) as id_acc, avg(policy_correct::int) as pol_acc, count(*) as n
      from cx_eval.mart_conversation_scores where batch_date between p_batch - 2 and p_batch)
    select x.dimension, x.base_acc, x.recent_acc, recent.n
    from base, recent
    cross join lateral (values ('identity_verification', base.id_acc, recent.id_acc),
                               ('policy_adherence', base.pol_acc, recent.pol_acc)) as x(dimension, base_acc, recent_acc)
    where recent.n >= 30 and x.base_acc - x.recent_acc >= 0.15
  loop
    perform cx_eval.raise_alert(v_run, p_batch, 'judge_accuracy', 'model', 'warn', r.dimension,
      format('Judge accuracy on %s fell to %s%% (baseline %s%%) over the last 3 days.',
             r.dimension, round(100 * r.recent_acc), round(100 * r.base_acc)),
      jsonb_build_object('baseline', round(100 * r.base_acc, 1), 'recent', round(100 * r.recent_acc, 1), 'n', r.n));
  end loop;

  -- ── Business layer: CSAT (trailing 3 days vs the 7 before) ──
  for r in
    select avg(score) filter (where batch_date between p_batch - 2 and p_batch) as recent,
           avg(score) filter (where batch_date between p_batch - 9 and p_batch - 3) as prior,
           count(*) filter (where batch_date between p_batch - 2 and p_batch) as n
    from cx_eval.csat_responses
  loop
    if r.n >= 100 and r.prior - r.recent >= 0.25 then
      perform cx_eval.raise_alert(v_run, p_batch, 'csat_drop', 'business', 'warn', '',
        format('CSAT %s over the last 3 days vs %s the week before.', round(r.recent, 2), round(r.prior, 2)),
        jsonb_build_object('recent', round(r.recent, 2), 'prior', round(r.prior, 2), 'responses', r.n));
    end if;
  end loop;

  -- ── Business layer: a team's identity compliance vs its own baseline ──
  -- Population metric (all conversations, not the scored sample), so it is
  -- independent of the judge.
  for r in
    select team_id,
           avg((gt_identity = 'pass')::int) filter (where batch_date between p_batch - 2 and p_batch) as recent,
           avg((gt_identity = 'pass')::int) filter (where batch_date < p_batch - 2) as prior,
           count(*) filter (where batch_date between p_batch - 2 and p_batch) as n,
           count(*) filter (where batch_date < p_batch - 2) as n_prior
    from cx_eval.conversations
    where gt_identity <> 'na' and batch_date between p_batch - 16 and p_batch
    group by team_id
  loop
    -- A baseline needs history: ~1 week of the team's chats before comparing.
    if r.n >= 40 and r.n_prior >= 150 and r.prior - r.recent >= 0.10 then
      perform cx_eval.raise_alert(v_run, p_batch, 'cohort_compliance', 'business', 'warn', r.team_id,
        format('Team %s identity compliance %s%% over the last 3 days vs %s%% before.',
               r.team_id, round(100 * r.recent), round(100 * r.prior)),
        jsonb_build_object('team', r.team_id, 'recent', round(100 * r.recent, 1), 'prior', round(100 * r.prior, 1), 'n', r.n));
    end if;
  end loop;

  update cx_eval.alerts set status = 'resolved', resolved_at = now()
  where batch_date = p_batch and status = 'open' and last_seen_run is distinct from v_run;

  select count(*) into v_n from cx_eval.alerts where batch_date = p_batch and status = 'open';
  update cx_eval.pipeline_runs set finished_at = now(), status = 'ok', rows_out = v_n where run_id = v_run;
  return jsonb_build_object('stage', 'checks', 'batch', p_batch, 'open_alerts', v_n);
end
$$;

-- Watchdog: runs inside the database, so it fires even if the orchestrator
-- (GitHub Actions) stops running. Freshness = time since the last successful load.
create or replace function cx_eval.check_freshness(p_max_hours int default 26)
returns jsonb language plpgsql as $$
declare
  v_last timestamptz;
begin
  select max(finished_at) into v_last from cx_eval.pipeline_runs where stage = 'load' and status = 'ok';
  if v_last is null or v_last < now() - make_interval(hours => p_max_hours) then
    perform cx_eval.raise_alert(null, null, 'freshness', 'data', 'critical', to_char(now(), 'YYYY-MM-DD'),
      format('No successful load for %s hours (last: %s).',
             coalesce(round(extract(epoch from now() - v_last) / 3600)::text, 'ever'), coalesce(v_last::text, 'never')),
      jsonb_build_object('last_load', v_last, 'max_hours', p_max_hours));
  end if;
  return jsonb_build_object('last_load', v_last, 'stale', v_last is null or v_last < now() - make_interval(hours => p_max_hours));
end
$$;

create extension if not exists pg_cron;
select cron.schedule('cx-eval-freshness', '15 * * * *', 'select cx_eval.check_freshness()')
where not exists (select 1 from cron.job where jobname = 'cx-eval-freshness');

-- ── Write role for the orchestrator (GitHub Actions) ────────────────────────
-- Can run the pipeline in cx_eval and nothing else. Set its password after running:
--   alter role cxeval_pipeline with password '<long random password>';
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cxeval_pipeline') then
    create role cxeval_pipeline login noinherit connection limit 10;
  end if;
end
$$;
grant usage on schema cx_eval to cxeval_pipeline;
grant select, insert, update, delete on all tables in schema cx_eval to cxeval_pipeline;
grant usage on all sequences in schema cx_eval to cxeval_pipeline;
grant execute on all functions in schema cx_eval to cxeval_pipeline;
