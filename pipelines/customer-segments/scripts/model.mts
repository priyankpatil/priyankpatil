// Model: compare candidate feature sets and k on the training snapshot, check
// stability and next-year usefulness against an RFM baseline, then fit the chosen
// configuration and assign every snapshot.
//
//   npx tsx pipelines/customer-segments/scripts/model.mts --explore   # print the comparison only
//   npx tsx pipelines/customer-segments/scripts/model.mts             # fit CHOSEN and write it
//
//   --features   (re)build the feature snapshots first: TRAIN_AS_OF and each 2011 month start
//   SETS=rfm,core K_RANGE=3,4   limit the comparison (for quick --explore runs)
//
// Connects with SUPABASE_DB_URL.

import pg from "pg";
import { fitScaler, nearest, scale, type FeatureName, type Scaler } from "../src/features.ts";
import { adjustedRand, assign, kmeans, rng, rSquared, silhouette } from "../src/kmeans.ts";

const TRAIN_AS_OF = "2010-12-01";
const SEED = 20101201;
const K_RANGE = (process.env.K_RANGE ?? "3,4,5,6,7,8").split(",").map(Number);
const BOOTSTRAPS = 20;

// tenure_days is not a candidate: the data starts 2009-12-01, so at the training
// snapshot every customer's tenure is capped at ~365 days (see FEATURES.md).
const FEATURE_SETS: Record<string, FeatureName[]> = {
  rfm: ["recency_days", "orders", "revenue"],
  rfm_aov: ["recency_days", "orders", "avg_order_value"],
  rfm_breadth: ["recency_days", "orders", "revenue", "product_breadth"],
  core: ["recency_days", "orders", "avg_order_value", "return_rate"],
  wide: ["recency_days", "orders", "avg_order_value", "active_months", "product_breadth", "return_rate", "trend"],
};

// Chosen after reading the --explore table (PLAN.md → Decisions).
const CHOSEN = { set: "rfm", k: 4 };

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Set SUPABASE_DB_URL.");
  process.exit(1);
}
const explore = process.argv.includes("--explore");
const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
await client.query("set statement_timeout = 0");

type FeatureRow = Record<string, number> & { customer_id: number };

async function snapshot(asOf: string): Promise<FeatureRow[]> {
  const { rows } = await client.query(
    `select customer_id, recency_days, orders, revenue::float8 as revenue, avg_order_value::float8 as avg_order_value,
            tenure_days, active_months, product_breadth, return_rate, trend
     from customer_segments.customer_features where as_of = $1 order by customer_id`,
    [asOf],
  );
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)]))) as FeatureRow[];
}

if (process.argv.includes("--features")) {
  const snapshots = [TRAIN_AS_OF, ...Array.from({ length: 12 }, (_, m) => `2011-${String(m + 1).padStart(2, "0")}-01`)];
  for (const asOf of snapshots) {
    const { rows: [r] } = await client.query<{ n: number }>("select customer_segments.build_features($1) as n", [asOf]);
    console.log(`features ${asOf}: ${r.n} customers`);
  }
}

const train = await snapshot(TRAIN_AS_OF);
if (!train.length) throw new Error(`No features for ${TRAIN_AS_OF}; run with --features first.`);
const { rows: next } = await client.query<{ customer_id: number; revenue: string; bought: boolean }>(
  "select customer_id, revenue, bought from customer_segments.next_year($1) order by customer_id",
  [TRAIN_AS_OF],
);
const nextRevenue = next.map((r) => Math.log1p(Number(r.revenue)));
const churned = next.map((r) => (r.bought ? 0 : 1));

// Correlations of the log-scaled candidates, to spot inputs that would be counted twice.
const all: FeatureName[] = ["recency_days", "orders", "revenue", "avg_order_value", "tenure_days", "active_months", "product_breadth", "return_rate", "trend"];
const allScaled = (() => { const s = fitScaler(all, train); return train.map((r) => scale(s, r)); })();
const corr = (i: number, j: number) => {
  const n = allScaled.length;
  const mi = allScaled.reduce((s, r) => s + r[i], 0) / n, mj = allScaled.reduce((s, r) => s + r[j], 0) / n;
  let c = 0, vi = 0, vj = 0;
  allScaled.forEach((r) => { c += (r[i] - mi) * (r[j] - mj); vi += (r[i] - mi) ** 2; vj += (r[j] - mj) ** 2; });
  return c / Math.sqrt(vi * vj);
};
const correlations = Object.fromEntries(all.map((a, i) => [a, Object.fromEntries(all.map((b, j) => [b, Number(corr(i, j).toFixed(2))]))]));

/** Classic RFM: quintile scores for recency, frequency and spend, summed, cut into k groups. */
function rfmGroups(rows: FeatureRow[], k: number): number[] {
  const quintile = (values: number[], higherIsBetter: boolean) => {
    const order = values.map((v, i) => [v, i] as const).sort((a, b) => (higherIsBetter ? a[0] - b[0] : b[0] - a[0]));
    const score = new Array<number>(values.length);
    order.forEach(([, i], rank) => (score[i] = 1 + Math.floor((rank / values.length) * 5)));
    return score;
  };
  const r = quintile(rows.map((x) => x.recency_days), false);
  const f = quintile(rows.map((x) => x.orders), true);
  const m = quintile(rows.map((x) => x.revenue), true);
  const total = rows.map((_, i) => r[i] + f[i] + m[i]);
  const sorted = [...total].sort((a, b) => a - b);
  return total.map((t) => Math.min(k - 1, Math.floor((sorted.indexOf(t) / sorted.length) * k)));
}

interface Candidate {
  set: string;
  k: number;
  silhouette: number;
  smallest_share: number;
  stability: number;
  r2_next_revenue: number;
  r2_churn: number;
}

function evaluate(set: string, k: number, scaler: Scaler, points: number[][]) {
  const fit = kmeans(points, k, SEED);
  const rand = rng(SEED + k);
  const aris: number[] = [];
  for (let b = 0; b < BOOTSTRAPS; b++) {
    const sample = points.map(() => points[Math.floor(rand() * points.length)]);
    aris.push(adjustedRand(fit.labels, assign(points, kmeans(sample, k, SEED + b + 1, 5).centroids)));
  }
  const sizes = Array.from({ length: k }, (_, c) => fit.labels.filter((l) => l === c).length / points.length);
  const candidate: Candidate = {
    set, k,
    silhouette: silhouette(points, fit.labels, k),
    smallest_share: Math.min(...sizes),
    stability: aris.reduce((s, v) => s + v, 0) / aris.length,
    r2_next_revenue: rSquared(nextRevenue, fit.labels),
    r2_churn: rSquared(churned, fit.labels),
  };
  return { candidate, fit, aris, scaler };
}

const round = (v: number) => Number(v.toFixed(3));
const selection: Candidate[] = [];
for (const [set, features] of Object.entries(FEATURE_SETS)) {
  const scaler = fitScaler(features, train);
  const points = train.map((r) => scale(scaler, r));
  if (process.env.SETS && !process.env.SETS.split(",").includes(set)) continue;
  for (const k of K_RANGE) {
    const { candidate } = evaluate(set, k, scaler, points);
    selection.push(candidate);
    console.log(set.padEnd(5), k, Object.entries(candidate).slice(2).map(([n, v]) => `${n}=${round(v as number)}`).join("  "));
  }
}
const baseline = K_RANGE.map((k) => {
  const groups = rfmGroups(train, k);
  return { k, r2_next_revenue: round(rSquared(nextRevenue, groups)), r2_churn: round(rSquared(churned, groups)) };
});
console.log("RFM baseline", baseline);

if (explore) {
  console.log("Correlations (log-scaled, capped):");
  console.table(correlations);
  await client.end();
  process.exit(0);
}

// ── Fit the chosen configuration and write it ────────────────────────────────

const features = FEATURE_SETS[CHOSEN.set];
const scaler = fitScaler(features, train);
const points = train.map((r) => scale(scaler, r));
const { fit, aris } = evaluate(CHOSEN.set, CHOSEN.k, scaler, points);

// Number segments by average revenue, highest first, so segment 0 is always the most valuable.
const revenueBy = fit.centroids.map((_, c) => {
  const members = train.filter((_, i) => fit.labels[i] === c);
  return members.reduce((s, r) => s + r.revenue, 0) / members.length;
});
const order = revenueBy.map((v, c) => [v, c] as const).sort((a, b) => b[0] - a[0]).map(([, c]) => c);
const centroids = order.map((c) => fit.centroids[c]);

await client.query("begin");
await client.query("update customer_segments.model_runs set is_current = false where is_current");
const { rows: [run] } = await client.query<{ model_id: string }>(
  `insert into customer_segments.model_runs (trained_on, features, k, seed, scaler, selection, stability, baseline, is_current)
   values ($1, $2, $3, $4, $5, $6, $7, $8, true) returning model_id`,
  [
    TRAIN_AS_OF, features, CHOSEN.k, SEED, JSON.stringify(scaler),
    JSON.stringify({ chosen: CHOSEN, candidates: selection, correlations }),
    JSON.stringify({ bootstraps: BOOTSTRAPS, mean_ari: round(aris.reduce((s, v) => s + v, 0) / aris.length), min_ari: round(Math.min(...aris)) }),
    JSON.stringify(baseline.find((b) => b.k === CHOSEN.k)),
  ],
);
for (const [segment, c] of centroids.entries()) {
  await client.query("insert into customer_segments.centroids values ($1, $2, $3)", [run.model_id, segment, c]);
}

const { rows: snaps } = await client.query<{ as_of: string }>("select distinct to_char(as_of, 'YYYY-MM-DD') as as_of from customer_segments.customer_features order by 1");
for (const { as_of } of snaps) {
  const rows = as_of === TRAIN_AS_OF ? train : await snapshot(as_of);
  const assigned = rows.map((r) => ({ id: r.customer_id, ...nearest(scale(scaler, r), centroids) }));
  await client.query(
    `insert into customer_segments.assignments
     select $1, $2, * from unnest($3::int[], $4::smallint[], $5::real[], $6::smallint[], $7::real[])`,
    [run.model_id, as_of, assigned.map((a) => a.id), assigned.map((a) => a.best.segment), assigned.map((a) => a.best.distance),
      assigned.map((a) => a.runnerUp.segment), assigned.map((a) => a.runnerUp.distance)],
  );
}
await client.query("commit");
console.log(`Model ${run.model_id}: ${features.join(", ")} · k=${CHOSEN.k} · ${snaps.length} snapshots assigned`);
await client.end();
