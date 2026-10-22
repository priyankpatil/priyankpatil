-- CX evaluation: rubric v2 and backtests.
--
--   select cx_eval.create_backtest('2026-09-23', '2026-09-29', 'v2', 'openai/gpt-oss-20b');
--
-- A backtest re-scores conversations the production judge already scored,
-- reusing their stored JudgeContext, with a different rubric or model. Its
-- scores are not production (judge_config is unchanged), so business metrics
-- are untouched; mart_judge_accuracy compares the versions on the same chats.

insert into cx_eval.rubric_versions (version, weights, notes) values
  ('v2', '{"policy_adherence": 0.30, "identity_verification": 0.20, "resolution": 0.25, "empathy": 0.15, "efficiency": 0.10}',
   'v1 rules applied as a procedure: the judge must locate required buttons and cite positions (src/rubric/v2.ts)')
on conflict (version) do nothing;

create or replace function cx_eval.create_backtest(p_from date, p_to date, p_rubric text, p_model text)
returns jsonb language plpgsql as $$
declare
  v_out int;
begin
  insert into cx_eval.scoring_requests (convo_id, batch_date, rubric_version, model, context, est_tokens)
  select q.convo_id, q.batch_date, p_rubric, p_model, q.context, q.est_tokens
  from cx_eval.scoring_requests q
  join cx_eval.judge_config_for(q.batch_date) c on c.model = q.model and c.rubric_version = q.rubric_version
  where q.batch_date between p_from and p_to and q.status = 'done'
  on conflict (convo_id, rubric_version, model) do nothing;
  get diagnostics v_out = row_count;
  return jsonb_build_object('backtest', p_rubric || ' / ' || p_model, 'from', p_from, 'to', p_to, 'requests', v_out);
end
$$;

-- Accuracy per rubric version as well as model, so backtests compare cleanly.
drop view if exists cx_eval.mart_judge_accuracy;
create view cx_eval.mart_judge_accuracy as
select batch_date, model, rubric_version, bool_and(is_production) as is_production, count(*) as scored,
       round(100.0 * avg(intent_correct::int), 1) as intent_accuracy_pct,
       round(100.0 * avg(identity_correct::int), 1) as identity_accuracy_pct,
       -- Of the chats that really skipped identity checks, how many did the judge flag?
       round(100.0 * avg((j_identity = 'fail')::int) filter (where gt_identity = 'fail'), 1) as identity_fail_recall_pct,
       count(*) filter (where gt_identity = 'fail') as identity_true_fails,
       round(100.0 * avg(policy_correct::int), 1) as policy_accuracy_pct,
       round(100.0 * avg((j_policy = 'fail')::int) filter (where gt_policy = 'fail'), 1) as policy_fail_recall_pct,
       count(*) filter (where gt_policy = 'fail') as policy_true_fails
from cx_eval.mart_conversation_scores
group by 1, 2, 3;
grant select on cx_eval.mart_judge_accuracy to cxeval_reader;
