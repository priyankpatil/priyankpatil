-- CX auto-evaluation pipeline (pipelines/cx-eval/PLAN.md).
--
-- ELT: scripts only land raw data (raw_conversations) and call the LLM judge.
-- Everything else is SQL in this schema, so each rule can be read and run by
-- hand in the SQL editor:
--
--   select cx_eval.validate_batch('2026-10-01');     -- checks → quarantine
--   select cx_eval.transform_batch('2026-10-01');    -- conversations, turns, ground truth
--   select cx_eval.simulate_csat('2026-10-01');      -- synthetic survey responses
--   select cx_eval.process_batch('2026-10-01');      -- all three, in order
--
-- Every stage records itself in cx_eval.pipeline_runs. Safe to re-run: each
-- function replaces its own output for the batch.

create schema if not exists cx_eval;

-- ── Reference data (loaded from ABCD kb.json / guidelines.json) ─────────────

create table if not exists cx_eval.ref_flows (
  flow        text primary key,
  description text not null
);

create table if not exists cx_eval.ref_subflows (
  subflow      text primary key,
  flow         text not null references cx_eval.ref_flows,
  -- Steps that MAY be needed, in order. Not a checklist: conversations branch.
  policy_steps text[] not null default '{}',
  guideline    text not null default '',
  is_faq       boolean not null
);

-- ── Landing: one row per record as the source system delivered it ───────────

create table if not exists cx_eval.raw_batches (
  batch_date   date primary key,
  source       text not null,
  extracted_at timestamptz not null,
  loaded_at    timestamptz not null default now(),
  row_count    int not null,
  -- Set when the simulated source deliberately misbehaves for this batch.
  incident     text
);

create table if not exists cx_eval.raw_conversations (
  convo_id          text primary key,
  batch_date        date not null references cx_eval.raw_batches on delete cascade,
  payload           jsonb not null,
  loaded_at         timestamptz not null default now(),
  validation_status text not null default 'pending'
                    check (validation_status in ('pending', 'valid', 'quarantined')),
  validated_at      timestamptz
);
create index if not exists raw_conversations_batch_idx on cx_eval.raw_conversations (batch_date);

-- Ground-truth labels, delivered separately from the support records (in a
-- real team: a human QA label set). Never shown to the judge.
create table if not exists cx_eval.labels (
  convo_id     text primary key,
  true_flow    text not null,
  true_subflow text not null,
  source       text not null default 'abcd'
);

create table if not exists cx_eval.quarantine (
  id             bigint generated always as identity primary key,
  batch_date     date not null,
  convo_id       text not null,
  check_name     text not null,
  -- 'error' keeps the record out of the pipeline; 'warn' is recorded only.
  severity       text not null check (severity in ('error', 'warn')),
  detail         text,
  quarantined_at timestamptz not null default now()
);
create index if not exists quarantine_batch_idx on cx_eval.quarantine (batch_date);

-- ── Enriched ────────────────────────────────────────────────────────────────

create table if not exists cx_eval.conversations (
  convo_id           text primary key,
  batch_date         date not null,
  started_at         timestamptz not null,
  channel            text not null,
  agent_id           text not null,
  team_id            text not null,
  member_level       text,
  logged_reason      text not null,
  logged_flow        text,
  true_flow          text,
  true_subflow       text,
  reason_tag_correct boolean,
  n_turns            int not null,
  n_agent_turns      int not null,
  n_customer_turns   int not null,
  n_actions          int not null,
  n_words            int not null,
  actions            text[] not null,
  -- Policy for the TRUE intent; ground truth is computed against this.
  policy_steps       text[] not null,
  is_faq             boolean,
  gt_identity        text check (gt_identity in ('pass', 'fail', 'na')),
  gt_on_policy       boolean,
  gt_in_order        boolean,
  gt_faq_searched    boolean,
  gt_policy          text check (gt_policy in ('pass', 'fail')),
  transformed_at     timestamptz not null default now()
);
create index if not exists conversations_batch_idx on cx_eval.conversations (batch_date);

create table if not exists cx_eval.turns (
  convo_id text not null references cx_eval.conversations on delete cascade,
  turn_idx int not null,
  speaker  text not null,
  text     text not null,
  button   text,
  primary key (convo_id, turn_idx)
);

create table if not exists cx_eval.csat_responses (
  convo_id     text primary key references cx_eval.conversations on delete cascade,
  batch_date   date not null,
  score        int not null check (score between 1 and 5),
  responded_at timestamptz not null,
  simulated    boolean not null default true
);

-- ── LLM input / output ──────────────────────────────────────────────────────

create table if not exists cx_eval.rubric_versions (
  version    text primary key,
  created_at timestamptz not null default now(),
  weights    jsonb not null,
  notes      text
);

-- One request = "score this conversation with this rubric using this model".
-- context is the exact JudgeContext (pipelines/cx-eval/src/contract.ts), so
-- every prompt is reproducible from stored data.
create table if not exists cx_eval.scoring_requests (
  request_id     bigint generated always as identity primary key,
  convo_id       text not null,
  batch_date     date not null,
  rubric_version text not null references cx_eval.rubric_versions,
  model          text not null,
  context        jsonb not null,
  est_tokens     int not null,
  status         text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  created_at     timestamptz not null default now(),
  unique (convo_id, rubric_version, model)
);
create index if not exists scoring_requests_pending_idx on cx_eval.scoring_requests (status, batch_date);

create table if not exists cx_eval.scoring_runs (
  run_id         bigint generated always as identity primary key,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  model          text not null,
  rubric_version text not null,
  n_requested    int not null default 0,
  n_ok           int not null default 0,
  n_invalid      int not null default 0,
  n_error        int not null default 0,
  p50_latency_ms int,
  p95_latency_ms int,
  total_tokens   int,
  status         text not null default 'running' check (status in ('running', 'ok', 'partial', 'failed'))
);

-- Append-only: one row per judge call outcome, including failures.
create table if not exists cx_eval.judge_results (
  result_id         bigint generated always as identity primary key,
  request_id        bigint not null references cx_eval.scoring_requests,
  run_id            bigint references cx_eval.scoring_runs,
  status            text not null check (status in ('ok', 'invalid', 'error')),
  model             text not null,
  rubric_version    text not null,
  prompt_hash       text not null,
  raw_content       text,
  error             text,
  prompt_tokens     int,
  completion_tokens int,
  latency_ms        int,
  attempts          int,
  repaired          boolean not null default false,
  judged_at         timestamptz not null default now()
);

-- Long format: one row per conversation × dimension × rubric × model.
-- Append-only; re-scoring adds rows, never overwrites.
create table if not exists cx_eval.scores (
  score_id       bigint generated always as identity primary key,
  result_id      bigint not null references cx_eval.judge_results,
  convo_id       text not null,
  batch_date     date not null,
  rubric_version text not null,
  model          text not null,
  dimension      text not null,
  value          text not null,
  value_num      numeric,
  evidence       text,
  scored_at      timestamptz not null default now()
);
create index if not exists scores_batch_dim_idx on cx_eval.scores (batch_date, dimension);
create index if not exists scores_convo_idx on cx_eval.scores (convo_id);

-- ── Telemetry ───────────────────────────────────────────────────────────────

create table if not exists cx_eval.pipeline_runs (
  run_id        bigint generated always as identity primary key,
  stage         text not null,
  batch_date    date,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'running' check (status in ('running', 'ok', 'failed')),
  rows_in       int,
  rows_out      int,
  rows_rejected int,
  detail        jsonb,
  error         text
);
create index if not exists pipeline_runs_stage_idx on cx_eval.pipeline_runs (stage, batch_date);

create table if not exists cx_eval.alerts (
  alert_id     bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  check_name   text not null,
  severity     text not null check (severity in ('info', 'warn', 'critical')),
  batch_date   date,
  message      text not null,
  detail       jsonb,
  status       text not null default 'open' check (status in ('open', 'resolved')),
  external_url text
);

-- ── Helpers ─────────────────────────────────────────────────────────────────

-- Deterministic uniform [0, 1) from a key, so synthetic data is reproducible.
create or replace function cx_eval.hash_unit(key text, salt text)
returns numeric language sql immutable as $$
  select (('x' || substr(md5(key || ':' || salt), 1, 8))::bit(32)::bigint)::numeric / 4294967296
$$;

create or replace function cx_eval.try_timestamptz(value text)
returns timestamptz language plpgsql immutable as $$
begin
  return value::timestamptz;
exception when others then
  return null;
end
$$;

create or replace function cx_eval.is_search_action(action text)
returns boolean language sql immutable as $$
  select action = 'select-faq' or action like 'search-%'
$$;

create or replace function cx_eval.word_count(value text)
returns int language sql immutable as $$
  select coalesce(array_length(regexp_split_to_array(nullif(trim(value), ''), '\s+'), 1), 0)
$$;

-- ── Ground truth (branch-aware; see PLAN.md → Data) ─────────────────────────

-- Identity gate: every policy step up to and including the first gate step
-- (verify-identity / validate-purchase) must happen before any later step.
-- 'na' when the policy has no gate step (including FAQ intents).
create or replace function cx_eval.gt_identity(actions text[], steps text[])
returns text language plpgsql immutable as $$
declare
  gate_idx  int;
  step      text;
  pos       int;
  last_pre  int := 0;
  first_post int;
begin
  select min(i) into gate_idx
  from generate_subscripts(steps, 1) as i
  where steps[i] in ('verify-identity', 'validate-purchase');
  if gate_idx is null then
    return 'na';
  end if;

  foreach step in array steps[1:gate_idx] loop
    pos := array_position(actions, step);
    if pos is null then
      return 'fail';
    end if;
    last_pre := greatest(last_pre, pos);
  end loop;

  select min(i) into first_post
  from generate_subscripts(actions, 1) as i
  where actions[i] = any (steps[gate_idx + 1:]);

  return case when first_post is null or last_pre < first_post then 'pass' else 'fail' end;
end
$$;

-- Only actions the policy allows for this intent. Action intents may also use
-- the general FAQ (search-faq, select-faq) but not topic searches such as
-- search-boots; FAQ intents (no policy steps) may use any search. Matches
-- the policy_adherence rule in RUBRIC.md.
create or replace function cx_eval.gt_on_policy(actions text[], steps text[])
returns boolean language sql immutable as $$
  select coalesce(bool_and(
           a = any (steps)
           or a in ('search-faq', 'select-faq')
           or (cardinality(steps) = 0 and cx_eval.is_search_action(a))), true)
  from unnest(actions) as a
$$;

-- Policy actions that were taken appear in policy order.
create or replace function cx_eval.gt_in_order(actions text[], steps text[])
returns boolean language sql immutable as $$
  select coalesce(bool_and(pos >= prev_pos), true)
  from (
    select array_position(steps, a) as pos,
           lag(array_position(steps, a)) over (order by i) as prev_pos
    from unnest(actions) with ordinality as u(a, i)
    where a = any (steps)
  ) as ordered
  where prev_pos is not null
$$;

-- ── Stage: validate ─────────────────────────────────────────────────────────

create or replace function cx_eval.validate_batch(p_batch date)
returns jsonb language plpgsql as $$
declare
  v_run    bigint;
  v_in     int;
  v_bad    int;
  v_detail jsonb;
begin
  insert into cx_eval.pipeline_runs (stage, batch_date) values ('validate', p_batch) returning run_id into v_run;
  begin
    delete from cx_eval.quarantine where batch_date = p_batch;

    insert into cx_eval.quarantine (batch_date, convo_id, check_name, severity, detail)
    select p_batch, r.convo_id, c.check_name, c.severity, c.detail
    from cx_eval.raw_conversations r
    cross join lateral (values
      ('missing_field', 'error',
        (select 'missing: ' || string_agg(k, ', ')
         from unnest(array['conversation_id', 'started_at', 'channel', 'agent_id', 'logged_reason', 'customer', 'transcript']) as k
         where not r.payload ? k)),
      ('unexpected_field', 'warn',
        (select 'unexpected: ' || string_agg(k, ', ')
         from jsonb_object_keys(r.payload) as k
         where k not in ('conversation_id', 'started_at', 'channel', 'agent_id', 'logged_reason', 'customer', 'transcript'))),
      ('id_mismatch', 'error',
        case when r.payload ? 'conversation_id' and r.payload->>'conversation_id' <> r.convo_id
             then 'payload conversation_id ' || (r.payload->>'conversation_id') end),
      ('bad_timestamp', 'error',
        case when r.payload ? 'started_at' and cx_eval.try_timestamptz(r.payload->>'started_at') is null
             then 'started_at not a timestamp: ' || left(r.payload->>'started_at', 40) end),
      ('wrong_batch', 'error',
        case when cx_eval.try_timestamptz(r.payload->>'started_at')::date <> p_batch
             then 'started_at ' || (r.payload->>'started_at') || ' is outside batch ' || p_batch end),
      ('unknown_channel', 'error',
        case when r.payload ? 'channel' and r.payload->>'channel' not in ('web_chat', 'app_chat')
             then 'channel ' || (r.payload->>'channel') end),
      ('unknown_reason', 'error',
        case when r.payload ? 'logged_reason'
              and not exists (select 1 from cx_eval.ref_subflows s where s.subflow = r.payload->>'logged_reason')
             then 'logged_reason ' || (r.payload->>'logged_reason') end),
      ('empty_transcript', 'error',
        case when r.payload ? 'transcript'
              and (jsonb_typeof(r.payload->'transcript') <> 'array' or jsonb_array_length(r.payload->'transcript') = 0)
             then 'transcript is empty or not a list' end),
      ('bad_turn', 'error',
        case when jsonb_typeof(r.payload->'transcript') = 'array' then
          (select count(*) || ' malformed turn(s)'
           from jsonb_array_elements(r.payload->'transcript') as t
           where coalesce(t->>'speaker', '') not in ('agent', 'customer', 'action')
              or coalesce(t->>'text', '') = ''
              or (t->>'speaker' = 'action' and coalesce(t->>'button', '') = '')
           having count(*) > 0)
        end)
    ) as c(check_name, severity, detail)
    where r.batch_date = p_batch and c.detail is not null;

    update cx_eval.raw_conversations r
    set validation_status = case
          when exists (select 1 from cx_eval.quarantine q
                       where q.batch_date = p_batch and q.convo_id = r.convo_id and q.severity = 'error')
          then 'quarantined' else 'valid' end,
        validated_at = now()
    where r.batch_date = p_batch;

    select count(*), count(*) filter (where validation_status = 'quarantined')
    into v_in, v_bad
    from cx_eval.raw_conversations where batch_date = p_batch;

    select coalesce(jsonb_object_agg(check_name, n), '{}') into v_detail
    from (select check_name, count(*) as n from cx_eval.quarantine where batch_date = p_batch group by 1) as x;

    update cx_eval.pipeline_runs
    set finished_at = now(), status = 'ok', rows_in = v_in, rows_out = v_in - v_bad, rows_rejected = v_bad,
        detail = jsonb_build_object('checks', v_detail)
    where run_id = v_run;
  exception when others then
    update cx_eval.pipeline_runs set finished_at = now(), status = 'failed', error = sqlerrm where run_id = v_run;
    return jsonb_build_object('stage', 'validate', 'batch', p_batch, 'status', 'failed', 'error', sqlerrm);
  end;
  return jsonb_build_object('stage', 'validate', 'batch', p_batch, 'status', 'ok',
                            'rows_in', v_in, 'valid', v_in - v_bad, 'quarantined', v_bad, 'checks', v_detail);
end
$$;

-- ── Stage: transform + enrich ───────────────────────────────────────────────

create or replace function cx_eval.transform_batch(p_batch date)
returns jsonb language plpgsql as $$
declare
  v_run bigint;
  v_in  int;
  v_out int;
begin
  insert into cx_eval.pipeline_runs (stage, batch_date) values ('transform', p_batch) returning run_id into v_run;
  begin
    select count(*) into v_in
    from cx_eval.raw_conversations where batch_date = p_batch and validation_status = 'valid';

    -- Replace this batch's output (cascades to turns and csat_responses),
    -- including records that moved here from another batch on a reload.
    delete from cx_eval.conversations c
    where c.batch_date = p_batch
       or c.convo_id in (select convo_id from cx_eval.raw_conversations where batch_date = p_batch);

    drop table if exists tmp_turns;
    create temporary table tmp_turns on commit drop as
    select r.convo_id,
           t.idx::int - 1 as turn_idx,
           t.turn->>'speaker' as speaker,
           t.turn->>'text' as text,
           nullif(t.turn->>'button', '') as button
    from cx_eval.raw_conversations r
    cross join lateral jsonb_array_elements(r.payload->'transcript') with ordinality as t(turn, idx)
    where r.batch_date = p_batch and r.validation_status = 'valid';

    insert into cx_eval.conversations (
      convo_id, batch_date, started_at, channel, agent_id, team_id, member_level,
      logged_reason, logged_flow, true_flow, true_subflow, reason_tag_correct,
      n_turns, n_agent_turns, n_customer_turns, n_actions, n_words, actions,
      policy_steps, is_faq, gt_identity, gt_on_policy, gt_in_order, gt_faq_searched, gt_policy)
    select
      r.convo_id,
      p_batch,
      (r.payload->>'started_at')::timestamptz,
      r.payload->>'channel',
      r.payload->>'agent_id',
      -- Teams of 10 agents: A01–A10 → T1 … A31–A40 → T4.
      'T' || (((substr(r.payload->>'agent_id', 2)::int - 1) / 10) + 1),
      r.payload->'customer'->>'member_level',
      r.payload->>'logged_reason',
      logged.flow,
      l.true_flow,
      l.true_subflow,
      l.true_subflow = r.payload->>'logged_reason',
      t.n_turns, t.n_agent, t.n_customer, t.n_actions, t.n_words,
      t.actions,
      coalesce(truth.policy_steps, '{}'),
      truth.is_faq,
      gt.identity, gt.on_policy, gt.in_order, gt.faq_searched,
      -- Same rule as policy_adherence in RUBRIC.md: FAQ intents pass on any search.
      case when (case when truth.is_faq then gt.faq_searched else gt.on_policy and gt.in_order end)
           then 'pass' else 'fail' end
    from cx_eval.raw_conversations r
    join lateral (
      select count(*)::int as n_turns,
             count(*) filter (where speaker = 'agent')::int as n_agent,
             count(*) filter (where speaker = 'customer')::int as n_customer,
             count(*) filter (where speaker = 'action')::int as n_actions,
             coalesce(sum(cx_eval.word_count(text)) filter (where speaker <> 'action'), 0)::int as n_words,
             coalesce(array_agg(button order by turn_idx) filter (where speaker = 'action'), '{}') as actions
      from tmp_turns tt where tt.convo_id = r.convo_id
    ) as t on true
    left join cx_eval.labels l on l.convo_id = r.convo_id
    left join cx_eval.ref_subflows truth on truth.subflow = l.true_subflow
    left join cx_eval.ref_subflows logged on logged.subflow = r.payload->>'logged_reason'
    cross join lateral (
      select cx_eval.gt_identity(t.actions, coalesce(truth.policy_steps, '{}')) as identity,
             cx_eval.gt_on_policy(t.actions, coalesce(truth.policy_steps, '{}')) as on_policy,
             cx_eval.gt_in_order(t.actions, coalesce(truth.policy_steps, '{}')) as in_order,
             exists (select 1 from unnest(t.actions) as a where cx_eval.is_search_action(a)) as faq_searched
    ) as gt
    where r.batch_date = p_batch and r.validation_status = 'valid';
    get diagnostics v_out = row_count;

    insert into cx_eval.turns (convo_id, turn_idx, speaker, text, button)
    select convo_id, turn_idx, speaker, text, button from tmp_turns;

    update cx_eval.pipeline_runs
    set finished_at = now(), status = 'ok', rows_in = v_in, rows_out = v_out, rows_rejected = v_in - v_out
    where run_id = v_run;
  exception when others then
    update cx_eval.pipeline_runs set finished_at = now(), status = 'failed', error = sqlerrm where run_id = v_run;
    return jsonb_build_object('stage', 'transform', 'batch', p_batch, 'status', 'failed', 'error', sqlerrm);
  end;
  return jsonb_build_object('stage', 'transform', 'batch', p_batch, 'status', 'ok', 'rows_in', v_in, 'rows_out', v_out);
end
$$;

-- ── Stage: synthetic CSAT (simulation of an upstream survey system) ─────────

-- ~25% respond. Scores lean on true compliance and length plus noise, so CSAT
-- is a realistic, imperfect signal of the experience.
create or replace function cx_eval.simulate_csat(p_batch date)
returns jsonb language plpgsql as $$
declare
  v_run bigint;
  v_out int;
begin
  insert into cx_eval.pipeline_runs (stage, batch_date) values ('simulate_csat', p_batch) returning run_id into v_run;
  delete from cx_eval.csat_responses where batch_date = p_batch;

  insert into cx_eval.csat_responses (convo_id, batch_date, score, responded_at)
  select c.convo_id, p_batch,
         least(5, greatest(1, round(
           4.3
           - case when c.gt_identity = 'fail' then 1.3 else 0 end
           - case when c.gt_policy = 'fail' then 0.9 else 0 end
           - case when c.n_turns > 32 then 0.6 else 0 end
           + (cx_eval.hash_unit(c.convo_id, 'csat-noise') - 0.5) * 2.0
         )))::int,
         c.started_at + make_interval(mins => 30 + (cx_eval.hash_unit(c.convo_id, 'csat-delay') * 600)::int)
  from cx_eval.conversations c
  where c.batch_date = p_batch and cx_eval.hash_unit(c.convo_id, 'csat-respond') < 0.25;
  get diagnostics v_out = row_count;

  update cx_eval.pipeline_runs set finished_at = now(), status = 'ok', rows_out = v_out where run_id = v_run;
  return jsonb_build_object('stage', 'simulate_csat', 'batch', p_batch, 'status', 'ok', 'responses', v_out);
end
$$;

-- ── Orchestration entry point for one batch ─────────────────────────────────

create or replace function cx_eval.process_batch(p_batch date)
returns jsonb language plpgsql as $$
declare
  v_validate  jsonb;
  v_transform jsonb;
  v_csat      jsonb;
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
  return jsonb_build_object('batch', p_batch, 'validate', v_validate, 'transform', v_transform, 'csat', v_csat);
end
$$;

-- Not exposed through Supabase's API roles.
revoke all on schema cx_eval from public;
