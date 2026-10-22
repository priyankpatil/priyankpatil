import type { Pool } from "pg";
import snapshotJson from "./snapshot.json";
import {
  createPool,
  queryDashboard,
  type DailyPoint,
  type DashboardQueryResult,
  type TeamPoint,
} from "./queries";

// Server-only loader for /projects/cx-eval. Reads the marts live through the
// read-only cxeval_reader role; falls back to the committed snapshot
// (pipelines/cx-eval/scripts/export-snapshot.mts) so the page always renders.

export type IncidentType = "data" | "model" | "customer";

export interface Incident {
  date: string;
  marker: string;
  label: string;
  type: IncidentType;
}

export interface Kpi {
  id: string;
  label: string;
  value: string;
  delta: { text: string; tone: "good" | "bad" | "neutral" } | null;
  caption: string;
}

export interface TeamSummary {
  team: string;
  beforePct: number | null;
  afterPct: number | null;
  beforeCsat: number | null;
  afterCsat: number | null;
}

export type TeamSeriesPoint = { date: string } & Record<string, number | null | string>;

export interface DashboardData extends DashboardQueryResult {
  source: "live" | "snapshot";
  asOf: string | null;
  lastScoredDate: string | null;
  scoredTotal: number;
  plannedTotal: number;
  kpis: Kpi[];
  incidents: Incident[];
  teamNames: string[];
  teamSeries: TeamSeriesPoint[];
  teamSummary: TeamSummary[];
  routingDate: string;
}

const snapshot = snapshotJson as unknown as DashboardQueryResult;

// Planted incidents are recorded in the warehouse (raw_batches.incident and
// judge_config); these labels only make the codes readable.
const INCIDENT_LABELS: Record<string, { label: string; type: IncidentType }> = {
  cohort_routing_start: { label: "Identity-skipping chats routed to team T4", type: "customer" },
  schema_rename: { label: "Upstream field renamed; batch quarantined", type: "data" },
};
const DEFAULT_ROUTING_DATE = "2026-10-14";

let pool: Pool | null = null;

async function loadLive(): Promise<DashboardQueryResult | null> {
  const url = process.env.CXEVAL_READ_URL;
  if (!url) return null;
  try {
    pool ??= createPool(url);
    return await queryDashboard(pool);
  } catch (err) {
    console.error("[cx-eval] live query failed, using snapshot:", (err as Error).message);
    return null;
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  const live = await loadLive();
  return derive(live ?? snapshot, live ? "live" : "snapshot");
}

// ── Derivations (small arrays only) ─────────────────────────────────────────

function weighted<T>(rows: T[], value: (r: T) => number | null, weight: (r: T) => number): number | null {
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    const v = value(r);
    const w = weight(r);
    if (v == null || !w) continue;
    sum += v * w;
    n += w;
  }
  return n ? sum / n : null;
}

function fmt(n: number | null, digits = 1, suffix = ""): string {
  return n == null ? "–" : `${n.toFixed(digits)}${suffix}`;
}

function delta(
  current: number | null,
  prior: number | null,
  digits: number,
  unit: string,
  higherIsBetter: boolean
): Kpi["delta"] {
  if (current == null || prior == null) return null;
  const d = current - prior;
  if (Number(Math.abs(d).toFixed(digits)) === 0) return { text: "No change vs prior 7 days", tone: "neutral" };
  const text = `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(digits)}${unit} vs prior 7 days`;
  const threshold = digits === 2 ? 0.05 : 1;
  const tone = Math.abs(d) < threshold ? "neutral" : d > 0 === higherIsBetter ? "good" : "bad";
  return { text, tone };
}

function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function derive(q: DashboardQueryResult, source: DashboardData["source"]): DashboardData {
  const daily = q.daily;
  const scoredDays = daily.filter((d) => d.scored > 0);
  const lastScoredDate = scoredDays.at(-1)?.date ?? null;
  const asOf = daily.at(-1)?.date ?? null;

  // CXI comes from the scored sample, so its windows are the last scored days.
  const cxiLast = scoredDays.slice(-7);
  const cxiPrior = scoredDays.slice(-14, -7);
  const cxiNow = weighted(cxiLast, (d) => d.cxi, (d) => d.scored);
  const cxiBefore = weighted(cxiPrior, (d) => d.cxi, (d) => d.scored);

  const last7 = daily.slice(-7);
  const prior7 = daily.slice(-14, -7);
  const csatNow = weighted(last7, (d) => d.csat, (d) => d.csatResponses);
  const csatBefore = weighted(prior7, (d) => d.csat, (d) => d.csatResponses);

  const teamDays = (days: DailyPoint[]) => {
    const set = new Set(days.map((d) => d.date));
    return q.teams.filter((t) => set.has(t.date));
  };
  const idPct = (rows: TeamPoint[]) => weighted(rows, (t) => t.identityPct, (t) => t.identityApplicable);
  const idAll = idPct(q.teams);
  const idNow = idPct(teamDays(last7));
  const idBefore = idPct(teamDays(prior7));

  const loaded = daily.reduce((n, d) => n + d.loaded, 0);
  const quarantined = daily.reduce((n, d) => n + d.quarantined, 0);
  const worst = daily.reduce<DailyPoint | null>((w, d) => (!w || d.quarantined > w.quarantined ? d : w), null);

  const scoredTotal = daily.reduce((n, d) => n + d.scored, 0);
  const plannedTotal = daily.reduce((n, d) => n + d.scored + d.scorePending + d.scoreFailed, 0);
  const p95 = weighted(scoredDays, (d) => d.p95LatencyMs, (d) => d.scored);

  const kpis: Kpi[] = [
    {
      id: "cxi",
      label: "CX Index",
      value: fmt(cxiNow),
      delta: delta(cxiNow, cxiBefore, 1, " pts", true),
      caption: cxiLast.length
        ? `Rubric-weighted 0–100 score from the LLM judge, last ${cxiLast.length} scored days.`
        : "Rubric-weighted 0–100 score from the LLM judge; no scored days yet.",
    },
    {
      id: "csat",
      label: "CSAT (simulated)",
      value: fmt(csatNow, 2, " / 5"),
      delta: delta(csatNow, csatBefore, 2, "", true),
      caption: "Average post-chat survey score, last 7 days. Synthetic, tied to true compliance.",
    },
    {
      id: "gt-identity",
      label: "Identity compliance",
      value: fmt(idNow, 1, "%"),
      delta: delta(idNow, idBefore, 1, " pts", true),
      caption: `Chats where the agent verified identity before changes, computed from logged actions (all days: ${fmt(idAll, 1, "%")}).`,
    },
    {
      id: "judge-identity",
      label: "Judge identity accuracy",
      value: fmt(q.totals.identityAccuracyPct, 1, "%"),
      delta: null,
      caption:
        q.totals.identityFailRecallPct == null
          ? "How often the judge's identity verdict matches ground truth."
          : `Matches ground truth this often, but catches only ${fmt(q.totals.identityFailRecallPct, 0, "%")} of real identity failures.`,
    },
    {
      id: "quarantine",
      label: "Quarantine rate",
      value: fmt(loaded ? (100 * quarantined) / loaded : null, 1, "%"),
      delta: null,
      caption:
        worst && worst.quarantined
          ? worst.quarantined === quarantined
            ? `All ${quarantined} held-back records (of ${loaded.toLocaleString("en-US")}) came from the ${shortDate(worst.date)} batch.`
            : `${quarantined} of ${loaded.toLocaleString("en-US")} records failed validation; ${worst.quarantined} on ${shortDate(worst.date)}.`
          : "Records held back by ingestion checks.",
    },
    {
      id: "latency",
      label: "p50 scoring latency",
      value: q.totals.p50LatencyMs == null ? "–" : `${(q.totals.p50LatencyMs / 1000).toFixed(1)} s`,
      delta: null,
      caption: `Time for one judge call per chat${p95 == null ? "" : `; p95 around ${(p95 / 1000).toFixed(0)} s`}. Free-tier NVIDIA API.`,
    },
  ];

  // Incidents: the model switch from judge_config, the rest from raw_batches.
  const incidents: Incident[] = [];
  for (const c of q.judgeConfig.slice(1)) {
    incidents.push({ date: c.effectiveFrom, marker: "", label: `Judge model switched to ${c.model.split("/").pop()}`, type: "model" });
  }
  for (const d of daily) {
    if (!d.incident) continue;
    const known = INCIDENT_LABELS[d.incident];
    incidents.push({ date: d.date, marker: "", label: known?.label ?? d.incident, type: known?.type ?? "data" });
  }
  incidents.sort((a, b) => a.date.localeCompare(b.date));
  incidents.forEach((inc, i) => (inc.marker = String(i + 1)));

  const routingDate = daily.find((d) => d.incident === "cohort_routing_start")?.date ?? DEFAULT_ROUTING_DATE;
  const teamNames = [...new Set(q.teams.map((t) => t.team))].sort();
  const byDate = new Map<string, TeamSeriesPoint>();
  for (const t of q.teams) {
    const row = byDate.get(t.date) ?? { date: t.date };
    row[t.team] = t.identityPct;
    byDate.set(t.date, row);
  }
  const teamSummary = teamNames.map((team) => {
    const rows = q.teams.filter((t) => t.team === team);
    const before = rows.filter((t) => t.date < routingDate);
    const after = rows.filter((t) => t.date >= routingDate);
    const csat = (r: TeamPoint[]) => weighted(r, (t) => t.csat, (t) => t.csatResponses);
    return { team, beforePct: idPct(before), afterPct: idPct(after), beforeCsat: csat(before), afterCsat: csat(after) };
  });

  return {
    ...q,
    source,
    asOf,
    lastScoredDate,
    scoredTotal,
    plannedTotal,
    kpis,
    incidents,
    teamNames,
    teamSeries: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    teamSummary,
    routingDate,
  };
}
