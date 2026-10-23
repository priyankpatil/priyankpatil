// Short excerpts of the real pipeline code, shown in the demo's "How it's
// built" blocks. Trimmed from pipelines/cx-eval/scripts/load.mts and
// supabase/migrations/20261022000000_cx_eval.sql; keep them in sync if those change.

export const LOADER_SNIPPET = `// load.mts: lands one day's batch; no business logic here
for (const day of days) {
  const batch = batches[day - 1];          // ~335 chats from the support system

  await db.query("BEGIN");
  await db.query(
    \`INSERT INTO cx_eval.raw_batches (batch_date, source, row_count)
     VALUES ($1, $2, $3)
     ON CONFLICT (batch_date) DO UPDATE SET row_count = excluded.row_count\`,
    [batch.date, source, batch.records.length]
  );
  // Each record is stored as raw JSON, exactly as it arrived.
  // Re-loading a day replaces its rows instead of duplicating them.
  await db.query(
    \`INSERT INTO cx_eval.raw_conversations (convo_id, batch_date, payload)
     SELECT id, $2, p FROM unnest($1::text[], $3::jsonb[]) AS u(id, p)
     ON CONFLICT (convo_id) DO UPDATE
       SET payload = excluded.payload, validation_status = 'pending'\`,
    [ids, batch.date, records.map((r) => JSON.stringify(r))]
  );
  await db.query("COMMIT");

  // Every step after landing is SQL inside the database.
  await db.query("SELECT cx_eval.process_batch($1)", [batch.date]);
}`;

export const VALIDATE_SNIPPET = `-- validate_batch(day): every record is checked; failures are kept with the reason
insert into cx_eval.quarantine (batch_date, convo_id, check_name, severity, detail)
select p_batch, r.convo_id, c.check_name, c.severity, c.detail
from cx_eval.raw_conversations r
cross join lateral (values
  ('missing_field', 'error',
     (select 'missing: ' || string_agg(k, ', ')
      from unnest(array['conversation_id', 'started_at', 'channel', 'agent_id',
                        'logged_reason', 'customer', 'transcript']) as k
      where not r.payload ? k)),
  ('unknown_reason', 'error',
     case when not exists (select 1 from cx_eval.ref_subflows s
                           where s.subflow = r.payload->>'logged_reason')
          then 'logged_reason ' || (r.payload->>'logged_reason') end),
  -- … six more checks: timestamps, batch date, channel, turns …
) as c(check_name, severity, detail)
where r.batch_date = p_batch and c.detail is not null;

-- Records with an error never reach the LLM or a report.
update cx_eval.raw_conversations r
set validation_status = case when exists (
      select 1 from cx_eval.quarantine q
      where q.convo_id = r.convo_id and q.severity = 'error')
    then 'quarantined' else 'valid' end
where r.batch_date = p_batch;`;

export const TRANSFORM_SNIPPET = `-- transform_batch(day): valid records become tables, with the ground truth computed
insert into cx_eval.turns (convo_id, turn_idx, speaker, text, button)
select r.convo_id, t.idx - 1, t.turn->>'speaker', t.turn->>'text', t.turn->>'button'
from cx_eval.raw_conversations r
cross join lateral jsonb_array_elements(r.payload->'transcript') with ordinality as t(turn, idx)
where r.batch_date = p_batch and r.validation_status = 'valid';

insert into cx_eval.conversations (convo_id, team_id, logged_reason, true_subflow, actions,
                                   policy_steps, gt_identity, gt_on_policy, gt_in_order, …)
select r.convo_id,
       'T' || ((substr(r.payload->>'agent_id', 2)::int - 1) / 10 + 1),   -- 10 agents per team
       r.payload->>'logged_reason',
       l.true_subflow,
       t.actions,                                   -- buttons clicked, in order
       truth.policy_steps,                          -- policy for the REAL reason
       cx_eval.gt_identity(t.actions, truth.policy_steps),
       cx_eval.gt_on_policy(t.actions, truth.policy_steps),
       cx_eval.gt_in_order(t.actions, truth.policy_steps), …
from cx_eval.raw_conversations r
join cx_eval.labels l using (convo_id)
join cx_eval.ref_subflows truth on truth.subflow = l.true_subflow
…

-- gt_identity(): every policy step up to the identity check must happen
-- before any later policy step; 'na' when the policy has no identity check
create function cx_eval.gt_identity(actions text[], steps text[]) returns text as $$
declare gate_idx int; step text; pos int; last_pre int := 0; first_post int;
begin
  select min(i) into gate_idx from generate_subscripts(steps, 1) as i
  where steps[i] in ('verify-identity', 'validate-purchase');
  if gate_idx is null then return 'na'; end if;

  foreach step in array steps[1:gate_idx] loop
    pos := array_position(actions, step);
    if pos is null then return 'fail'; end if;       -- a required step never happened
    last_pre := greatest(last_pre, pos);
  end loop;

  select min(i) into first_post from generate_subscripts(actions, 1) as i
  where actions[i] = any (steps[gate_idx + 1:]);
  return case when first_post is null or last_pre < first_post then 'pass' else 'fail' end;
end $$ language plpgsql;`;
