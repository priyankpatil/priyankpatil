-- CX evaluation: freshness is a heartbeat for the daily job.
--
-- The simulated chats ended on 2026-10-22 and each daily run replays that
-- day, so "fresh" means the daily pipeline is still completing, not that new
-- data is arriving. This still catches a job that fails or silently stops
-- (GitHub disables schedules after 60 days without commits), from inside the
-- database.
--
-- Changes from 20261022030000_cx_eval_ops.sql:
--   * one alert per outage: the subject is the last successful load, not today's
--     date, so an outage spanning midnight does not open a second alert
--   * the alert resolves itself once a load succeeds again
--   * the message says what is stale: the daily run

create or replace function cx_eval.check_freshness(p_max_hours int default 26)
returns jsonb language plpgsql as $$
declare
  v_last timestamptz;
  v_stale boolean;
begin
  select max(finished_at) into v_last from cx_eval.pipeline_runs where stage = 'load' and status = 'ok';
  v_stale := v_last is null or v_last < now() - make_interval(hours => p_max_hours);
  if v_stale then
    perform cx_eval.raise_alert(null, null, 'freshness', 'data', 'critical',
      coalesce('since ' || to_char(v_last at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), 'never'),
      format('The daily pipeline has not completed a successful load for %s hours (last: %s UTC).',
             coalesce(round(extract(epoch from now() - v_last) / 3600)::text, 'any'),
             coalesce(to_char(v_last at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), 'never')),
      jsonb_build_object('last_load', v_last, 'max_hours', p_max_hours));
  else
    update cx_eval.alerts set status = 'resolved', resolved_at = now()
    where check_name = 'freshness' and status = 'open';
  end if;
  return jsonb_build_object('last_load', v_last, 'stale', v_stale);
end
$$;

grant execute on function cx_eval.check_freshness(int) to cxeval_pipeline;
