-- CX evaluation: human calibration. A person scores a sample of conversations
-- with RUBRIC.md; agreement with the judge and with ground truth is reported
-- per dimension as raw agreement and Cohen's kappa (agreement beyond chance).

create table if not exists cx_eval.human_labels (
  convo_id      text not null,
  rater         text not null,
  intent        text,
  identity_verification text check (identity_verification in ('pass', 'fail', 'na')),
  policy_adherence      text check (policy_adherence in ('pass', 'fail')),
  resolution    text check (resolution in ('resolved', 'partial', 'unresolved')),
  empathy       int check (empathy between 1 and 5),
  notes         text,
  labelled_at   timestamptz not null default now(),
  primary key (convo_id, rater)
);

create or replace view cx_eval.mart_human_agreement as
with pairs as (
  select h.rater, d.dimension, d.human, d.judge, d.truth
  from cx_eval.human_labels h
  join cx_eval.mart_conversation_scores m using (convo_id)
  cross join lateral (values
    ('intent', h.intent, m.j_intent, m.true_flow),
    ('identity_verification', h.identity_verification, m.j_identity, m.gt_identity),
    ('policy_adherence', h.policy_adherence, m.j_policy, m.gt_policy),
    ('resolution', h.resolution, m.j_resolution, null),
    ('empathy', h.empathy::text, m.j_empathy::text, null)
  ) as d(dimension, human, judge, truth)
  where d.human is not null
),
compared as (
  select rater, dimension, 'judge' as versus, human as a, judge as b from pairs
  union all
  select rater, dimension, 'ground_truth', human, truth from pairs where truth is not null
),
observed as (
  select rater, dimension, versus, count(*) as n, avg((a = b)::int) as p_o
  from compared group by 1, 2, 3
),
expected as (
  -- Chance agreement: sum over labels of P(a = label) × P(b = label).
  select rater, dimension, versus, sum(pa * pb) as p_e
  from (
    select c.rater, c.dimension, c.versus, l.label,
           avg((c.a = l.label)::int) as pa, avg((c.b = l.label)::int) as pb
    from compared c
    join (select distinct rater, dimension, versus, a as label from compared
          union select distinct rater, dimension, versus, b from compared) as l
      using (rater, dimension, versus)
    group by 1, 2, 3, 4
  ) as marginals
  group by 1, 2, 3
)
select o.rater, o.dimension, o.versus, o.n,
       round(100 * o.p_o, 1) as agreement_pct,
       case when e.p_e < 1 then round((o.p_o - e.p_e) / (1 - e.p_e), 2) end as cohens_kappa
from observed o join expected e using (rater, dimension, versus)
order by o.dimension, o.versus;

grant select on cx_eval.mart_human_agreement to cxeval_reader;
grant select, insert, update, delete on cx_eval.human_labels to cxeval_pipeline;
