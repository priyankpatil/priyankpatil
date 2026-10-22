-- CX evaluation: judge configuration and prompt context assembly.
--
--   select cx_eval.assemble_scoring_requests('2026-10-01');   -- sample + build JudgeContext rows
--
-- The judge reads pending rows from cx_eval.scoring_requests, so everything it
-- sees is stored and reproducible.

-- Which model and rubric score which days. A dated change log, like a
-- deployment history: the day-18 model switch (a planted incident) is a row
-- here, which is exactly where a root cause analysis should find it.
create table if not exists cx_eval.judge_config (
  effective_from date primary key,
  model          text not null,
  rubric_version text not null,
  sample_per_day int not null default 20,
  note           text
);

insert into cx_eval.rubric_versions (version, weights, notes) values
  ('v1', '{"policy_adherence": 0.30, "identity_verification": 0.20, "resolution": 0.25, "empathy": 0.15, "efficiency": 0.10}',
   'Initial rubric: pipelines/cx-eval/RUBRIC.md')
on conflict (version) do nothing;

insert into cx_eval.judge_config (effective_from, model, rubric_version, note) values
  ('2026-09-23', 'openai/gpt-oss-20b', 'v1', 'Initial judge (selected in PLAN.md → Model selection)'),
  ('2026-10-10', 'nvidia/nemotron-3-ultra-550b-a55b', 'v1', 'Switched to a faster model (planted incident: model-driven drift)')
on conflict (effective_from) do nothing;

create or replace function cx_eval.judge_config_for(p_batch date)
returns cx_eval.judge_config language sql stable as $$
  select * from cx_eval.judge_config where effective_from <= p_batch order by effective_from desc limit 1
$$;

-- ── Stage: prompt context assembly ──────────────────────────────────────────

-- Samples conversations for a batch (deterministic, so re-runs pick the same
-- ones) and stores each one's JudgeContext. Context follows the LOGGED reason,
-- as a real judge would only see the agent's tag; ground truth and CSAT are
-- deliberately left out.
create or replace function cx_eval.assemble_scoring_requests(p_batch date, p_limit int default null)
returns jsonb language plpgsql as $$
declare
  v_run    bigint;
  v_config cx_eval.judge_config;
  v_out    int;
  v_valid  int;
begin
  insert into cx_eval.pipeline_runs (stage, batch_date) values ('assemble', p_batch) returning run_id into v_run;
  v_config := cx_eval.judge_config_for(p_batch);
  if v_config.model is null then
    update cx_eval.pipeline_runs set finished_at = now(), status = 'failed', error = 'no judge_config for batch' where run_id = v_run;
    return jsonb_build_object('stage', 'assemble', 'batch', p_batch, 'status', 'failed', 'error', 'no judge_config for batch');
  end if;

  select count(*) into v_valid from cx_eval.conversations where batch_date = p_batch;

  insert into cx_eval.scoring_requests (convo_id, batch_date, rubric_version, model, context, est_tokens)
  select c.convo_id, p_batch, v_config.rubric_version, v_config.model,
         jsonb_build_object(
           'convoId', c.convo_id,
           'contactReason', c.logged_reason,
           'policySteps', to_jsonb(coalesce(s.policy_steps, '{}')),
           'guideline', coalesce(s.guideline, ''),
           'turns', t.turns),
         -- Rough budget: ~4 characters per token, plus the rubric itself.
         1100 + (t.chars + length(coalesce(s.guideline, ''))) / 4
  from cx_eval.conversations c
  left join cx_eval.ref_subflows s on s.subflow = c.logged_reason
  cross join lateral (
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('speaker', speaker, 'text', text, 'button', button)) order by turn_idx) as turns,
           sum(length(text))::int as chars
    from cx_eval.turns where convo_id = c.convo_id
  ) as t
  where c.batch_date = p_batch
  order by cx_eval.hash_unit(c.convo_id, 'sample')
  limit coalesce(p_limit, v_config.sample_per_day)
  on conflict (convo_id, rubric_version, model) do nothing;
  get diagnostics v_out = row_count;

  update cx_eval.pipeline_runs
  set finished_at = now(), status = 'ok', rows_in = v_valid, rows_out = v_out,
      detail = jsonb_build_object('model', v_config.model, 'rubric_version', v_config.rubric_version)
  where run_id = v_run;
  return jsonb_build_object('stage', 'assemble', 'batch', p_batch, 'status', 'ok', 'requests', v_out,
                            'model', v_config.model, 'rubric_version', v_config.rubric_version);
end
$$;

-- process_batch now ends with assembly, so one call takes a batch from raw
-- landing to "ready for the judge".
create or replace function cx_eval.process_batch(p_batch date)
returns jsonb language plpgsql as $$
declare
  v_validate  jsonb;
  v_transform jsonb;
  v_csat      jsonb;
  v_assemble  jsonb;
begin
  v_validate := cx_eval.validate_batch(p_batch);
  if v_validate->>'status' <> 'ok' then
    return jsonb_build_object('batch', p_batch, 'validate', v_validate);
  end if;
  v_transform := cx_eval.transform_batch(p_batch);
  if v_transform->>'status' <> 'ok' then
    return jsonb_build_object('batch', p_batch, 'validate', v_validate, 'transform', v_transform);
  end if;
  v_csat := cx_eval.simulate_csat(p_batch);
  v_assemble := cx_eval.assemble_scoring_requests(p_batch);
  return jsonb_build_object('batch', p_batch, 'validate', v_validate, 'transform', v_transform,
                            'csat', v_csat, 'assemble', v_assemble);
end
$$;
