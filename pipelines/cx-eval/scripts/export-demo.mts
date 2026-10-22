// Writes the static data behind /projects/cx-eval:
//   lib/cx-eval/demo.json      curated chats with every pipeline artefact (raw record,
//                              enrichment, prompt context, stored judge outputs per
//                              model × rubric) and a precomputed "wrong contact reason" run
//   lib/cx-eval/findings.json  the numbers and series behind the three findings and the
//                              judge-accuracy strip
//
//   set -a; source .env; set +a
//   npx tsx pipelines/cx-eval/scripts/export-demo.mts            # reuses cached alt runs
//   npx tsx pipelines/cx-eval/scripts/export-demo.mts --rejudge  # re-runs them (≤ 16 NVIDIA calls)
//   npx tsx pipelines/cx-eval/scripts/export-demo.mts --no-judge # never calls the judge
//
// Reads raw and enriched tables, so it needs SUPABASE_DB_URL (admin). Re-run it
// after backtests finish: the page renders whatever the warehouse holds.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { JudgeContext, JudgeOutput } from "../src/contract.ts";
import { judgeConversation } from "../src/judge/judge.ts";
import { NVIDIA_MODELS } from "../src/judge/nvidia.ts";
import { rubricV1 } from "../src/rubric/v1.ts";
import type { AltRun, DemoChat, DemoData, Findings, RawRecord, RubricId, StoredRun } from "../../../lib/cx-eval/types.ts";

// The curated chats, all from the first scored week (2026-09-23 … 09-29), which
// also has backtests (rubric v2 on gpt-oss-20b, rubric v1 on nemotron).
// alt: a plausible wrong tag (usually a sibling reason), or for a chat whose
// tag is already wrong, the true reason.
const CURATED: { id: string; label: string; blurb: string; alt: string }[] = [
  {
    id: "abcd-1501",
    label: "Clean refund",
    blurb: "Every required step, in order. The judge and the ground truth agree on everything.",
    alt: "refund_status",
  },
  {
    id: "abcd-9039",
    label: "Agent skips identity check",
    blurb: "Username recovery needs verify-identity; the agent ran a purchase check instead. The judge catches it.",
    alt: "recover_password",
  },
  {
    id: "abcd-9434",
    label: "Steps out of policy order",
    blurb: "A return where the agent updates the order before entering the customer's address. The judge catches it.",
    alt: "refund_initiate",
  },
  {
    id: "abcd-8971",
    label: "Mislabelled contact reason",
    blurb: "Logged as a refund, really a return. The wrong tag brings the wrong policy into the prompt.",
    alt: "return_stain",
  },
  {
    id: "abcd-8256",
    label: "FAQ question",
    blurb: "A washing question answered from the FAQ. No account access, so identity is not applicable.",
    alt: "return_size",
  },
  {
    id: "abcd-2642",
    label: "Troubleshooting, repaired reply",
    blurb: "A slow website. The judge's first reply failed schema validation and was repaired.",
    alt: "shopping_cart",
  },
  {
    id: "abcd-7598",
    label: "Long, frustrated customer",
    blurb: "55 turns over a disputed bill, no refund, CSAT 1. Low efficiency and a low score.",
    alt: "manage_pay_bill",
  },
  {
    id: "abcd-726",
    label: "Judge gets it wrong",
    blurb: "The agent ran the wrong identity check. Rubric v1's judge passed it; switch to rubric v2 and it is caught.",
    alt: "refund_initiate",
  },
];

const BACKTEST = { from: "2026-09-23", to: "2026-09-29" };
const ALT_MODELS = [NVIDIA_MODELS.primary, NVIDIA_MODELS.secondary];
const MAX_JUDGE_CALLS = 16;

const dbUrl = process.env.SUPABASE_DB_URL ?? process.env.CXEVAL_READ_URL;
if (!dbUrl) {
  console.error("Set SUPABASE_DB_URL (admin; reads raw and enriched tables).");
  process.exit(1);
}
const url = new URL(dbUrl);
url.searchParams.delete("sslmode");
const db = new pg.Pool({ connectionString: url.toString(), max: 2, ssl: { rejectUnauthorized: false } });

const out = (name: string) => fileURLToPath(new URL(`../../../lib/cx-eval/${name}`, import.meta.url));
const rejudge = process.argv.includes("--rejudge");
const noJudge = process.argv.includes("--no-judge");

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query(sql, params)).rows as T[];
}
async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const rows = await q<T>(sql, params);
  if (rows.length !== 1) throw new Error(`expected 1 row, got ${rows.length}: ${sql.slice(0, 80)}`);
  return rows[0];
}

const ISO = (col: string) => `to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

// ── Curated chats ───────────────────────────────────────────────────────────

interface RefSubflow {
  policy_steps: string[];
  guideline: string;
}

async function ref(subflow: string): Promise<RefSubflow> {
  return one<RefSubflow>("select policy_steps, guideline from cx_eval.ref_subflows where subflow = $1", [subflow]);
}

function sameTurns(a: unknown, b: unknown): boolean {
  const norm = (turns: unknown) =>
    JSON.stringify(
      (turns as { speaker: string; text: string; button?: string | null }[]).map((t) => [t.speaker, t.text, t.button ?? null])
    );
  return norm(a) === norm(b);
}

async function loadChat(c: (typeof CURATED)[number]): Promise<Omit<DemoChat, "alt"> & { altReason: string }> {
  const raw = await one<{ payload: RawRecord; batch_date: string }>(
    "select payload, batch_date::text from cx_eval.raw_conversations where convo_id = $1",
    [c.id]
  );
  const conv = await one<Record<string, unknown>>(
    `select c.team_id, c.n_turns, c.n_agent_turns, c.n_customer_turns, c.n_actions, c.n_words, c.actions,
            c.true_flow, c.true_subflow, c.reason_tag_correct, c.policy_steps, c.is_faq, c.gt_identity, c.gt_policy,
            c.gt_on_policy, c.gt_in_order, c.gt_faq_searched, cs.score as csat,
            (select percentile_cont(0.5) within group (order by n_turns) from cx_eval.conversations x
             where x.true_subflow = c.true_subflow)::float8 as median_turns
     from cx_eval.conversations c left join cx_eval.csat_responses cs using (convo_id)
     where c.convo_id = $1`,
    [c.id]
  );
  const prod = await one<{ context: JudgeContext; est_tokens: number; model: string; rubric_version: string }>(
    `select q.context, q.est_tokens, q.model, q.rubric_version
     from cx_eval.scoring_requests q, cx_eval.judge_config_for(q.batch_date) jc
     where q.convo_id = $1 and q.model = jc.model and q.rubric_version = jc.rubric_version`,
    [c.id]
  );
  // The demo rebuilds the judge's input from the raw record; prove it equals what the pipeline stored.
  if (!sameTurns(prod.context.turns, raw.payload.transcript)) throw new Error(`${c.id}: stored context turns differ from raw transcript`);
  if (prod.context.contactReason !== raw.payload.logged_reason) throw new Error(`${c.id}: context reason differs from raw`);

  const results = await q<{
    result_id: number;
    model: string;
    rubric_version: RubricId;
    raw_content: string;
    latency_ms: number;
    prompt_tokens: number;
    completion_tokens: number;
    repaired: boolean;
    attempts: number;
    prompt_hash: string;
    judged_at: string;
    is_production: boolean;
  }>(
    `select distinct on (r.model, r.rubric_version)
            r.result_id::int, r.model, r.rubric_version, r.raw_content, r.latency_ms, r.prompt_tokens, r.completion_tokens,
            r.repaired, r.attempts, r.prompt_hash, ${ISO("r.judged_at")} as judged_at,
            (r.model, r.rubric_version) = (jc.model, jc.rubric_version) as is_production
     from cx_eval.judge_results r
     join cx_eval.scoring_requests q using (request_id)
     cross join lateral cx_eval.judge_config_for(q.batch_date) jc
     where q.convo_id = $1 and r.status = 'ok'
     order by r.model, r.rubric_version, r.result_id desc`,
    [c.id]
  );
  const runs: StoredRun[] = [];
  for (const r of results) {
    const rows = await q<{ score_id: number; dimension: string; value: string; value_num: number | null; evidence: string | null }>(
      "select score_id::int, dimension, value, value_num::float8, evidence from cx_eval.scores where result_id = $1 order by score_id",
      [r.result_id]
    );
    const get = (d: string) => rows.find((x) => x.dimension === d);
    const output: JudgeOutput = {
      intent: get("intent")!.value as JudgeOutput["intent"],
      identity_verification: get("identity_verification")!.value as JudgeOutput["identity_verification"],
      policy_adherence: get("policy_adherence")!.value as JudgeOutput["policy_adherence"],
      resolution: get("resolution")!.value as JudgeOutput["resolution"],
      empathy: Number(get("empathy")!.value),
      evidence: {
        intent: get("intent")!.evidence ?? "",
        identity_verification: get("identity_verification")!.evidence ?? "",
        policy_adherence: get("policy_adherence")!.evidence ?? "",
        resolution: get("resolution")!.evidence ?? "",
        empathy: get("empathy")!.evidence ?? "",
      },
    };
    runs.push({
      model: r.model,
      rubric: r.rubric_version,
      role: r.is_production ? "production" : "backtest",
      output,
      rawContent: r.raw_content,
      latencyMs: r.latency_ms,
      promptTokens: r.prompt_tokens,
      completionTokens: r.completion_tokens,
      repaired: r.repaired,
      attempts: r.attempts,
      promptHash: r.prompt_hash,
      judgedAt: r.judged_at,
      resultId: r.result_id,
      scoreRows: rows.map((x) => ({ scoreId: x.score_id, dimension: x.dimension, value: x.value, valueNum: x.value_num })),
    });
  }
  runs.sort((a, b) => Number(b.role === "production") - Number(a.role === "production") || a.rubric.localeCompare(b.rubric));

  // Efficiency exactly as the marts compute it (turns vs the median for the true intent).
  const ratio = (conv.n_turns as number) / (conv.median_turns as number);
  const efficiency = ratio <= 1 ? 5 : ratio <= 1.25 ? 4 : ratio <= 1.5 ? 3 : ratio <= 2 ? 2 : 1;

  return {
    id: c.id,
    label: c.label,
    blurb: c.blurb,
    batchDate: raw.batch_date,
    raw: raw.payload,
    context: {
      contactReason: prod.context.contactReason,
      policySteps: prod.context.policySteps,
      guideline: prod.context.guideline,
      estTokens: prod.est_tokens,
    },
    enrich: {
      teamId: conv.team_id as string,
      nTurns: conv.n_turns as number,
      nAgentTurns: conv.n_agent_turns as number,
      nCustomerTurns: conv.n_customer_turns as number,
      nActions: conv.n_actions as number,
      nWords: conv.n_words as number,
      actions: conv.actions as string[],
      trueFlow: conv.true_flow as string,
      trueSubflow: conv.true_subflow as string,
      reasonTagCorrect: conv.reason_tag_correct as boolean,
      truePolicySteps: conv.policy_steps as string[],
      isFaq: conv.is_faq as boolean,
      gtIdentity: conv.gt_identity as DemoChat["enrich"]["gtIdentity"],
      gtPolicy: conv.gt_policy as DemoChat["enrich"]["gtPolicy"],
      gtOnPolicy: conv.gt_on_policy as boolean,
      gtInOrder: conv.gt_in_order as boolean,
      gtFaqSearched: conv.gt_faq_searched as boolean,
      medianTurns: conv.median_turns as number,
      efficiency,
      csat: (conv.csat as number | null) ?? null,
    },
    runs,
    altReason: c.alt,
  };
}

// ── Alt-reason judge runs (cached in demo.json between exports) ─────────────

async function previousAltRuns(): Promise<Map<string, AltRun>> {
  const cache = new Map<string, AltRun>();
  try {
    const prev = JSON.parse(await readFile(out("demo.json"), "utf8")) as DemoData;
    for (const chat of prev.chats) {
      for (const run of chat.alt.runs) {
        if (run.status === "ok") cache.set(`${chat.id}|${chat.alt.contactReason}|${run.model}|${run.rubric}`, run);
      }
    }
  } catch {
    // first export
  }
  return cache;
}

async function altRuns(chats: Awaited<ReturnType<typeof loadChat>>[]): Promise<DemoChat[]> {
  const cache = rejudge ? new Map<string, AltRun>() : await previousAltRuns();
  const result: DemoChat[] = [];
  const jobs: { chat: DemoChat; model: string; context: JudgeContext }[] = [];

  for (const { altReason, ...chat } of chats) {
    const r = await ref(altReason);
    const demo: DemoChat = {
      ...chat,
      alt: {
        kind: chat.enrich.reasonTagCorrect ? "mislabel" : "correct",
        contactReason: altReason,
        policySteps: r.policy_steps,
        guideline: r.guideline,
        runs: [],
      },
    };
    if (chat.enrich.reasonTagCorrect === (altReason === chat.enrich.trueSubflow)) {
      throw new Error(`${chat.id}: alt reason should ${chat.enrich.reasonTagCorrect ? "differ from" : "equal"} the true reason`);
    }
    const context: JudgeContext = {
      convoId: chat.id,
      contactReason: altReason,
      policySteps: r.policy_steps,
      guideline: r.guideline,
      turns: chat.raw.transcript!.map((t) => ({ speaker: t.speaker as "agent", text: t.text, ...(t.button ? { button: t.button } : {}) })),
    };
    for (const model of ALT_MODELS) {
      const cached = cache.get(`${chat.id}|${altReason}|${model}|v1`);
      if (cached) demo.alt.runs.push(cached);
      else if (!noJudge) jobs.push({ chat: demo, model, context });
    }
    result.push(demo);
  }

  if (jobs.length > MAX_JUDGE_CALLS) throw new Error(`refusing to make ${jobs.length} judge calls (max ${MAX_JUDGE_CALLS})`);
  if (jobs.length) console.log(`Judging ${jobs.length} alt-reason variants (concurrency 4)…`);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const r = await judgeConversation({ rubric: rubricV1, context: job.context, model: job.model }).catch((err: Error) => ({
        status: "error" as const,
        output: undefined,
        rawContent: "",
        latencyMs: 0,
        usage: { promptTokens: 0, completionTokens: 0 },
        repaired: false,
        error: err.message,
      }));
      console.log(`  ${job.chat.id} ${job.model}: ${r.status}${"error" in r && r.error ? ` (${r.error.slice(0, 120)})` : ""}`);
      job.chat.alt.runs.push({
        model: job.model,
        rubric: "v1",
        status: r.status,
        output: r.output,
        rawContent: r.rawContent,
        latencyMs: r.latencyMs,
        promptTokens: r.usage.promptTokens,
        completionTokens: r.usage.completionTokens,
        repaired: r.repaired,
        judgedAt: new Date().toISOString().slice(0, 19) + "Z",
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker));
  for (const chat of result) chat.alt.runs.sort((a, b) => ALT_MODELS.indexOf(a.model as never) - ALT_MODELS.indexOf(b.model as never));
  return result;
}

// ── Findings ────────────────────────────────────────────────────────────────

const num = (v: unknown) => (v == null ? null : Number(v));

async function findings(): Promise<Findings> {
  const hero = await one<{ conversations: number; days: number; scored: number; verdicts: number; agree_pct: number }>(
    `select (select count(*) from cx_eval.raw_conversations)::int as conversations,
            (select count(*) from cx_eval.raw_batches)::int as days,
            count(*)::int as scored,
            (count(intent_correct) + count(identity_correct) + count(policy_correct))::int as verdicts,
            round(100.0 * (count(*) filter (where intent_correct) + count(*) filter (where identity_correct)
                           + count(*) filter (where policy_correct))
                  / nullif(count(intent_correct) + count(identity_correct) + count(policy_correct), 0), 1)::float8 as agree_pct
     from cx_eval.mart_conversation_scores where is_production`
  );

  // a. Team T4 (customer-driven)
  const routingDate = (await one<{ d: string }>("select batch_date::text as d from cx_eval.raw_batches where incident = 'cohort_routing_start'")).d;
  const idPct = (cond: string) =>
    `round(100.0 * avg((gt_identity = 'pass')::int) filter (where gt_identity <> 'na' ${cond}), 1)::float8`;
  const teamSeries = await q<{ date: string; t4: number; others: number; company: number }>(
    `select batch_date::text as date, ${idPct("and team_id = 'T4'")} as t4, ${idPct("and team_id <> 'T4'")} as others, ${idPct("")} as company
     from cx_eval.conversations group by 1 order by 1`
  );
  const period = async (op: string) =>
    one<{ t4: number; others: number; company: number }>(
      `select ${idPct("and team_id = 'T4'")} as t4, ${idPct("and team_id <> 'T4'")} as others, ${idPct("")} as company
       from cx_eval.conversations where batch_date ${op} $1`,
      [routingDate]
    );
  const teamCsat = await one<{ t4_before: number; t4_after: number; others_before: number; others_after: number }>(
    `select round(avg(s.score) filter (where c.team_id = 'T4' and c.batch_date < $1), 2)::float8 as t4_before,
            round(avg(s.score) filter (where c.team_id = 'T4' and c.batch_date >= $1), 2)::float8 as t4_after,
            round(avg(s.score) filter (where c.team_id <> 'T4' and c.batch_date < $1), 2)::float8 as others_before,
            round(avg(s.score) filter (where c.team_id <> 'T4' and c.batch_date >= $1), 2)::float8 as others_after
     from cx_eval.conversations c join cx_eval.csat_responses s using (convo_id)`,
    [routingDate]
  );

  // b. Model switch (model-driven)
  const configs = await q<{ effective_from: string; model: string }>(
    "select effective_from::text, model from cx_eval.judge_config order by effective_from"
  );
  if (configs.length < 2) throw new Error("expected a model switch in judge_config");
  const switchDate = configs[1].effective_from;
  const modelSeries = await q<{ date: string; cxi: number | null; csat: number | null }>(
    "select batch_date::text as date, cxi_avg::float8 as cxi, csat_avg::float8 as csat from cx_eval.mart_cxi_daily order by 1"
  );
  const modelPeriod = async (op: string) =>
    one<{ cxi: number; csat: number; empathy: number; resolved_pct: number }>(
      `select round(avg(cxi), 1)::float8 as cxi, round(avg(j_empathy), 2)::float8 as empathy,
              round(100.0 * avg((j_resolution = 'resolved')::int), 1)::float8 as resolved_pct,
              (select round(avg(score), 2)::float8 from cx_eval.csat_responses where batch_date ${op} $1) as csat
       from cx_eval.mart_conversation_scores where is_production and batch_date ${op} $1`,
      [switchDate]
    );
  const [mBefore, mAfter] = [await modelPeriod("<"), await modelPeriod(">=")];
  const modelBacktest = await one<{
    n: number;
    planned: number;
    p_cxi: number;
    s_cxi: number;
    p_emp: number;
    s_emp: number;
    p_res: number;
    s_res: number;
  }>(
    `with p as (select * from cx_eval.mart_conversation_scores where model = $1 and rubric_version = 'v1' and batch_date between $3 and $4),
          s as (select * from cx_eval.mart_conversation_scores where model = $2 and rubric_version = 'v1' and batch_date between $3 and $4)
     select count(*)::int as n,
            (select count(*) from cx_eval.scoring_requests where model = $2 and rubric_version = 'v1' and batch_date between $3 and $4)::int as planned,
            round(avg(p.cxi), 1)::float8 as p_cxi, round(avg(s.cxi), 1)::float8 as s_cxi,
            round(avg(p.j_empathy), 2)::float8 as p_emp, round(avg(s.j_empathy), 2)::float8 as s_emp,
            round(100.0 * avg((p.j_resolution = 'resolved')::int), 1)::float8 as p_res,
            round(100.0 * avg((s.j_resolution = 'resolved')::int), 1)::float8 as s_res
     from p join s using (convo_id)`,
    [configs[0].model, configs[1].model, BACKTEST.from, BACKTEST.to]
  );

  // c. Quarantine (data-driven)
  const renameDate = (await one<{ d: string }>("select batch_date::text as d from cx_eval.raw_batches where incident = 'schema_rename'")).d;
  const health = await q<{ date: string; loaded: number; quarantined: number }>(
    "select batch_date::text as date, loaded::int, quarantined::int from cx_eval.mart_pipeline_health order by 1"
  );
  const cut = await one<{ last_valid: string | null; first_bad: string | null }>(
    `select ${ISO("max((payload->>'started_at')::timestamptz) filter (where validation_status = 'valid')")} as last_valid,
            ${ISO("min((payload->>'started_at')::timestamptz) filter (where validation_status = 'quarantined')")} as first_bad
     from cx_eval.raw_conversations where batch_date = $1`,
    [renameDate]
  );
  const csatCounts = await one<{ that_day: number; typical: number }>(
    `select count(*) filter (where batch_date = $1)::int as that_day,
            (select percentile_cont(0.5) within group (order by n) from
              (select count(*) as n from cx_eval.csat_responses where batch_date <> $1 group by batch_date) x)::float8 as typical
     from cx_eval.csat_responses`,
    [renameDate]
  );

  // Trust strip
  const production = await q<{ model: string; rubric: string; n: number; intent: number; identity: number; policy: number }>(
    `select model, rubric_version as rubric, count(*)::int as n,
            round(100.0 * avg(intent_correct::int), 1)::float8 as intent,
            round(100.0 * avg(identity_correct::int), 1)::float8 as identity,
            round(100.0 * avg(policy_correct::int), 1)::float8 as policy
     from cx_eval.mart_conversation_scores where is_production group by 1, 2 order by min(batch_date)`
  );
  const rb = await one<{
    planned: number;
    n: number;
    true_fails: number;
    v1_recall: number | null;
    v2_recall: number | null;
    v1_acc: number | null;
    v2_acc: number | null;
  }>(
    `with a as (select * from cx_eval.mart_conversation_scores where model = $1 and rubric_version = 'v1' and batch_date between $2 and $3),
          b as (select * from cx_eval.mart_conversation_scores where model = $1 and rubric_version = 'v2' and batch_date between $2 and $3)
     select (select count(*) from cx_eval.scoring_requests where model = $1 and rubric_version = 'v2' and batch_date between $2 and $3)::int as planned,
            count(*)::int as n,
            count(*) filter (where a.gt_identity = 'fail')::int as true_fails,
            round(100.0 * avg((a.j_identity = 'fail')::int) filter (where a.gt_identity = 'fail'), 1)::float8 as v1_recall,
            round(100.0 * avg((b.j_identity = 'fail')::int) filter (where a.gt_identity = 'fail'), 1)::float8 as v2_recall,
            round(100.0 * avg(a.identity_correct::int), 1)::float8 as v1_acc,
            round(100.0 * avg(b.identity_correct::int), 1)::float8 as v2_acc
     from a join b using (convo_id)`,
    [configs[0].model, BACKTEST.from, BACKTEST.to]
  );

  return {
    generatedAt: new Date().toISOString(),
    hero: {
      conversations: hero.conversations,
      days: hero.days,
      scoredProduction: hero.scored,
      checkableVerdicts: hero.verdicts,
      checkableAgreementPct: hero.agree_pct,
    },
    team: {
      routingDate,
      series: teamSeries.map((r) => ({ date: r.date, t4: num(r.t4), others: num(r.others), company: num(r.company) })),
      before: await period("<"),
      after: await period(">="),
      csat: {
        t4Before: teamCsat.t4_before,
        t4After: teamCsat.t4_after,
        othersBefore: teamCsat.others_before,
        othersAfter: teamCsat.others_after,
      },
    },
    model: {
      switchDate,
      fromModel: configs[0].model,
      toModel: configs[1].model,
      series: modelSeries.map((r) => ({ date: r.date, cxi: num(r.cxi), csat: num(r.csat) })),
      before: { cxi: mBefore.cxi, csat: mBefore.csat, empathy: mBefore.empathy, resolvedPct: mBefore.resolved_pct },
      after: { cxi: mAfter.cxi, csat: mAfter.csat, empathy: mAfter.empathy, resolvedPct: mAfter.resolved_pct },
      backtest: modelBacktest.n
        ? {
            ...BACKTEST,
            n: modelBacktest.n,
            planned: modelBacktest.planned,
            primary: { cxi: modelBacktest.p_cxi, empathy: modelBacktest.p_emp, resolvedPct: modelBacktest.p_res },
            secondary: { cxi: modelBacktest.s_cxi, empathy: modelBacktest.s_emp, resolvedPct: modelBacktest.s_res },
          }
        : null,
    },
    quarantine: {
      date: renameDate,
      series: health,
      loaded: health.reduce((n, d) => n + d.loaded, 0),
      quarantined: health.reduce((n, d) => n + d.quarantined, 0),
      lastValidAt: cut.last_valid,
      firstQuarantinedAt: cut.first_bad,
      csatResponses: csatCounts.that_day,
      typicalCsatResponses: Math.round(csatCounts.typical),
    },
    trust: {
      production: production.map((r) => ({
        model: r.model,
        rubric: r.rubric,
        n: r.n,
        intentPct: r.intent,
        identityPct: r.identity,
        policyPct: r.policy,
      })),
      rubricBacktest: rb.n
        ? {
            ...BACKTEST,
            model: configs[0].model,
            planned: rb.planned,
            n: rb.n,
            trueFails: rb.true_fails,
            v1Recall: rb.v1_recall,
            v2Recall: rb.v2_recall,
            v1IdentityPct: rb.v1_acc,
            v2IdentityPct: rb.v2_acc,
          }
        : null,
    },
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

try {
  const loaded = [];
  for (const c of CURATED) loaded.push(await loadChat(c));
  const chats = await altRuns(loaded);
  const knownReasons = (await q<{ subflow: string }>("select subflow from cx_eval.ref_subflows order by 1")).map((r) => r.subflow);
  const demo: DemoData = { generatedAt: new Date().toISOString(), knownReasons, chats };
  const f = await findings();

  const demoText = JSON.stringify(demo) + "\n";
  await writeFile(out("demo.json"), demoText);
  await writeFile(out("findings.json"), JSON.stringify(f, null, 1) + "\n");

  console.log(`Wrote demo.json (${(demoText.length / 1024).toFixed(0)} KB, ${chats.length} chats) and findings.json.`);
  for (const c of chats) {
    const runs = c.runs.map((r) => `${r.model.split("/")[1]}/${r.rubric}`).join(", ");
    const alt = c.alt.runs.map((r) => `${r.model.split("/")[1]}:${r.status}`).join(", ") || "none";
    console.log(`  ${c.id.padEnd(11)} ${c.label.padEnd(32)} stored: ${runs} | alt (${c.alt.contactReason}): ${alt}`);
  }
  const bt = f.model.backtest;
  const rbt = f.trust.rubricBacktest;
  console.log(`Model backtest: ${bt ? `${bt.n}/${bt.planned}` : "none"} · rubric v2 backtest: ${rbt ? `${rbt.n}/${rbt.planned}` : "none"}`);
} finally {
  await db.end();
}
