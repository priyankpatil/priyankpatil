import { Pool, types, type PoolConfig } from "pg";

// Queries behind the /projects/cx-eval dashboard. Pool-agnostic so the page
// loader (lib/cx-eval/data.ts) and the snapshot exporter
// (pipelines/cx-eval/scripts/export-snapshot.mts) run exactly the same SQL.
// Reads only the cx_eval mart views granted to the cxeval_reader role.

export interface DailyPoint {
  date: string;
  incident: string | null;
  loaded: number;
  quarantined: number;
  conversations: number;
  scored: number;
  scorePending: number;
  scoreFailed: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  models: string | null;
  cxi: number | null;
  csat: number | null;
  csatResponses: number;
  /** Ground truth over every transformed conversation that day. */
  gtIdentityPct: number | null;
  gtPolicyPct: number | null;
  /** Judge pass rates and ground truth on the same scored sample. */
  judgeIdentityPct: number | null;
  judgePolicyPct: number | null;
  sampleGtIdentityPct: number | null;
  sampleGtPolicyPct: number | null;
}

export interface TeamPoint {
  date: string;
  team: string;
  identityPct: number | null;
  identityApplicable: number;
  csat: number | null;
  csatResponses: number;
}

export interface ModelAccuracy {
  model: string;
  firstDate: string;
  lastDate: string;
  scored: number;
  intentAccuracyPct: number | null;
  identityAccuracyPct: number | null;
  identityFailRecallPct: number | null;
  identityTrueFails: number;
  policyAccuracyPct: number | null;
  policyFailRecallPct: number | null;
  policyTrueFails: number;
  p50LatencyMs: number | null;
}

export interface DriftPoint {
  date: string;
  dimension: string;
  judgePsi: number | null;
  truthPsi: number | null;
  judgeDrift: string;
}

export interface AlertRow {
  id: number;
  createdAt: string;
  checkName: string;
  severity: "info" | "warn" | "critical";
  batchDate: string | null;
  message: string;
  status: "open" | "resolved";
  externalUrl: string | null;
}

export interface JudgeConfigRow {
  effectiveFrom: string;
  model: string;
  rubricVersion: string;
  samplePerDay: number;
  note: string | null;
}

export interface Totals {
  scored: number;
  identityAccuracyPct: number | null;
  identityFailRecallPct: number | null;
  p50LatencyMs: number | null;
}

export interface DashboardQueryResult {
  fetchedAt: string;
  daily: DailyPoint[];
  teams: TeamPoint[];
  models: ModelAccuracy[];
  drift: DriftPoint[];
  alerts: AlertRow[];
  judgeConfig: JudgeConfigRow[];
  totals: Totals;
}

export function createPool(connectionString: string): Pool {
  const url = new URL(connectionString);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  // pg treats sslmode in the URL as authoritative; TLS is configured below instead.
  url.searchParams.delete("sslmode");
  const config: PoolConfig = {
    connectionString: url.toString(),
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    ssl: local ? undefined : { rejectUnauthorized: false },
  };
  const pool = new Pool(config);
  pool.on("error", (err) => console.error("[cx-eval] idle client error:", err.message));
  return pool;
}

// Dates stay as the strings Postgres sends; counts and numerics become numbers.
const typeParsers = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    switch (oid) {
      case 1082:
      case 1114:
      case 1184:
        return (value: string) => value;
      case 20:
      case 1700:
        return (value: string) => Number(value);
      default:
        return types.getTypeParser(oid, format as "text");
    }
  },
};

const DAILY_SQL = `
select d.batch_date as "date", d.incident, h.loaded, h.quarantined, d.conversations,
       d.scored, coalesce(h.score_pending, 0) as "scorePending", coalesce(h.score_failed, 0) as "scoreFailed",
       h.p50_latency_ms as "p50LatencyMs", h.p95_latency_ms as "p95LatencyMs", d.models,
       d.cxi_avg as cxi, d.csat_avg as csat, coalesce(d.csat_responses, 0) as "csatResponses",
       d.gt_identity_pass_pct as "gtIdentityPct", d.gt_policy_pass_pct as "gtPolicyPct",
       d.judge_identity_pass_pct as "judgeIdentityPct", d.judge_policy_pass_pct as "judgePolicyPct",
       d.sample_gt_identity_pass_pct as "sampleGtIdentityPct", d.sample_gt_policy_pass_pct as "sampleGtPolicyPct"
from cx_eval.mart_cxi_daily d
join cx_eval.mart_pipeline_health h using (batch_date)
order by d.batch_date`;

const TEAMS_SQL = `
select batch_date as "date", cohort as team, gt_identity_pass_pct as "identityPct",
       identity_applicable as "identityApplicable", csat_avg as csat, csat_responses as "csatResponses"
from cx_eval.mart_cohort_daily
where cohort_type = 'team'
order by batch_date, cohort`;

const MODELS_SQL = `
select model, min(batch_date) as "firstDate", max(batch_date) as "lastDate", count(*) as scored,
       round(100.0 * avg(intent_correct::int), 1) as "intentAccuracyPct",
       round(100.0 * avg(identity_correct::int), 1) as "identityAccuracyPct",
       round(100.0 * avg((j_identity = 'fail')::int) filter (where gt_identity = 'fail'), 1) as "identityFailRecallPct",
       count(*) filter (where gt_identity = 'fail') as "identityTrueFails",
       round(100.0 * avg(policy_correct::int), 1) as "policyAccuracyPct",
       round(100.0 * avg((j_policy = 'fail')::int) filter (where gt_policy = 'fail'), 1) as "policyFailRecallPct",
       count(*) filter (where gt_policy = 'fail') as "policyTrueFails",
       percentile_disc(0.5) within group (order by latency_ms) as "p50LatencyMs"
from cx_eval.mart_conversation_scores
where is_production
group by model
order by min(batch_date)`;

const TOTALS_SQL = `
select count(*) as scored,
       round(100.0 * avg(identity_correct::int), 1) as "identityAccuracyPct",
       round(100.0 * avg((j_identity = 'fail')::int) filter (where gt_identity = 'fail'), 1) as "identityFailRecallPct",
       percentile_disc(0.5) within group (order by latency_ms) as "p50LatencyMs"
from cx_eval.mart_conversation_scores
where is_production`;

const DRIFT_SQL = `
select batch_date as "date", dimension, judge_psi as "judgePsi", truth_psi as "truthPsi", judge_drift as "judgeDrift"
from cx_eval.mart_drift
order by batch_date, dimension`;

const ALERTS_SQL = `
select alert_id as id, created_at as "createdAt", check_name as "checkName", severity,
       batch_date as "batchDate", message, status, external_url as "externalUrl"
from cx_eval.alerts
order by status = 'open' desc, array_position(array['critical', 'warn', 'info'], severity),
         batch_date desc nulls last, created_at desc
limit 25`;

const CONFIG_SQL = `
select effective_from as "effectiveFrom", model, rubric_version as "rubricVersion",
       sample_per_day as "samplePerDay", note
from cx_eval.judge_config
order by effective_from`;

/** Runs every dashboard query. Throws on failure; callers decide the fallback. */
export async function queryDashboard(pool: Pool): Promise<DashboardQueryResult> {
  const run = async <T>(text: string): Promise<T[]> => (await pool.query({ text, types: typeParsers })).rows as T[];
  // The pool has two connections, so these run two at a time.
  const [daily, teams, models, totals, drift, alerts, judgeConfig] = await Promise.all([
    run<DailyPoint>(DAILY_SQL),
    run<TeamPoint>(TEAMS_SQL),
    run<ModelAccuracy>(MODELS_SQL),
    run<Totals>(TOTALS_SQL),
    run<DriftPoint>(DRIFT_SQL),
    run<AlertRow>(ALERTS_SQL),
    run<JudgeConfigRow>(CONFIG_SQL),
  ]);
  return {
    fetchedAt: new Date().toISOString(),
    daily,
    teams,
    models,
    drift,
    alerts,
    judgeConfig,
    totals: totals[0] ?? { scored: 0, identityAccuracyPct: null, identityFailRecallPct: null, p50LatencyMs: null },
  };
}
