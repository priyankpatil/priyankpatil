// Exports what /projects/customer-segments shows to lib/customer-segments/segments.json,
// so the page is static and needs no database.
//
//   npx tsx pipelines/customer-segments/scripts/export.mts
//
// Reads the current model (model_runs.is_current) with SUPABASE_DB_URL.

import { writeFileSync } from "node:fs";
import pg from "pg";
import { cap, nearest, scale, transform, type Scaler } from "../src/features.ts";
import { rng } from "../src/kmeans.ts";
import { SEGMENTS } from "../src/segments.ts";

const OUT = "lib/customer-segments/segments.json";
const SCATTER_POINTS = 900;

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Set SUPABASE_DB_URL.");
  process.exit(1);
}
const db = new pg.Client({ connectionString: dbUrl, keepAlive: true, query_timeout: 120_000 });
await db.connect();
await db.query("set statement_timeout = 0");
const q = async <T = Record<string, unknown>,>(sql: string, params: unknown[] = []) => {
  if (process.env.DEBUG) console.log("→", sql.replace(/\s+/g, " ").slice(0, 70));
  return (await db.query(sql, params)).rows as T[];
};
const num = (v: unknown) => Number(v);

const [model] = await q<{ model_id: string; trained_on: string; features: string[]; k: number; scaler: Scaler; selection: { chosen: { set: string; k: number }; candidates: Record<string, number | string>[]; correlations: Record<string, Record<string, number>> }; stability: { mean_ari: number; min_ari: number; bootstraps: number }; baseline: { r2_next_revenue: number; r2_churn: number } }>(
  "select model_id, to_char(trained_on, 'YYYY-MM-DD') trained_on, features, k, scaler, selection, stability, baseline from customer_segments.model_runs where is_current",
);
if (!model) throw new Error("No current model; run model.mts first.");
if (model.k !== SEGMENTS.length) throw new Error(`Model has k=${model.k} but segments.ts names ${SEGMENTS.length}; update the names.`);
const asOf = model.trained_on;
const nextAsOf = `${Number(asOf.slice(0, 4)) + 1}${asOf.slice(4)}`;
const centroids = (await q<{ scaled: number[] }>("select scaled from customer_segments.centroids where model_id = $1 order by segment", [model.model_id])).map((r) => r.scaled.map(num));

// ── Data card ────────────────────────────────────────────────────────────────

const cleaning = (await q("select step, rule, reason, rows_removed, rows_left from customer_segments.cleaning_log order by step")).map((r) => ({
  step: num(r.step), rule: String(r.rule), reason: String(r.reason), removed: num(r.rows_removed), left: num(r.rows_left),
}));
const [totals] = await q(
  `select count(distinct customer_id) customers, count(distinct invoice) invoices, count(distinct stock_code) products,
          sum(revenue) revenue, to_char(min(invoice_date), 'YYYY-MM-DD') first_date, to_char(max(invoice_date), 'YYYY-MM-DD') last_date,
          (select avg((country = 'United Kingdom')::int) from customer_segments.customers) share_uk,
          (select count(distinct country) from customer_segments.customers) countries
   from customer_segments.transactions`,
);

// ── Feature walk-through: the most typical customer of each segment ─────────

type FeatureRow = Record<string, number> & { customer_id: number };
const features = (await q(
  `select customer_id, recency_days, orders, revenue::float8 revenue, avg_order_value::float8 avg_order_value, tenure_days,
          active_months, product_breadth, return_rate, trend, country_uk::int country_uk
   from customer_segments.customer_features where as_of = $1`, [asOf],
)).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, num(v)])) as FeatureRow);
const assigned = features.map((f) => ({ f, ...nearest(scale(model.scaler, f), centroids) }));

const examples = [];
for (let s = 0; s < model.k; s++) {
  const pick = assigned.filter((a) => a.best.segment === s).sort((a, b) => a.best.distance - b.best.distance)[0];
  const id = pick.f.customer_id;
  const orders = await q(
    `select invoice, to_char(min(invoice_date), 'YYYY-MM-DD') date, count(*) lines, sum(quantity) units, sum(revenue)::float8 value
     from customer_segments.transactions
     where customer_id = $1 and invoice_date >= $2::date - interval '365 days' and invoice_date < $2::date
     group by invoice order by min(invoice_date)`, [id, asOf],
  );
  const lines = await q(
    `select t.invoice, to_char(t.invoice_date, 'YYYY-MM-DD') date, t.stock_code, p.description, t.quantity, t.price::float8 price, t.revenue::float8 revenue
     from customer_segments.transactions t left join customer_segments.products p using (stock_code)
     where t.customer_id = $1 and t.invoice_date < $2::date
     order by t.invoice_date desc, t.stock_code limit 6`, [id, asOf],
  );
  const [cust] = await q("select country from customer_segments.customers where customer_id = $1", [id]);
  examples.push({
    customer_id: id,
    country: cust?.country ?? null,
    segment: s,
    orders: orders.map((o) => ({ invoice: String(o.invoice), date: String(o.date), lines: num(o.lines), units: num(o.units), value: num(o.value) })),
    lines: lines.map((l) => ({ ...l, quantity: num(l.quantity), price: num(l.price), revenue: num(l.revenue) })),
    raw: Object.fromEntries(Object.entries(pick.f).filter(([k]) => k !== "customer_id")),
    steps: model.scaler.map((e) => {
      const x = pick.f[e.feature];
      const t = transform(e, x);
      return { feature: e.feature, raw: x, transformed: t, capped: cap(e, t), scaled: (cap(e, t) - e.mean) / e.sd };
    }),
    distances: pick.all.map((d) => ({ segment: d.segment, distance: d.distance })).sort((a, b) => a.segment - b.segment),
  });
}

// ── Segments: profiles and a sample of customers for the scatter ─────────────

const profiles = (await q("select * from customer_segments.mart_segment_profile where as_of = $1 order by segment", [asOf])).map((r) => ({
  segment: num(r.segment), ...SEGMENTS[num(r.segment)], customers: num(r.customers), revenue: num(r.revenue),
  recency_days: num(r.recency_days), orders: num(r.orders), avg_order_value: num(r.avg_order_value), active_months: num(r.active_months),
  product_breadth: num(r.product_breadth), return_rate: num(r.return_rate), share_uk: num(r.share_uk),
}));

const rand = rng(7);
const sample = [...assigned].sort(() => rand() - 0.5).slice(0, SCATTER_POINTS).map((a) => ({
  recency_days: Number(a.f.recency_days.toFixed(1)), orders: a.f.orders, revenue: Math.round(a.f.revenue), segment: a.best.segment,
}));

// Feature ranges for the sliders: 1st to 99th percentile of the raw training values.
const pct = (values: number[], p: number) => { const s = [...values].sort((a, b) => a - b); return s[Math.floor((s.length - 1) * p)]; };
const ranges = Object.fromEntries(model.features.map((f) => {
  const v = features.map((r) => r[f]);
  return [f, { min: pct(v, 0.01), max: pct(v, 0.99), median: pct(v, 0.5) }];
}));

// ── Did it work ──────────────────────────────────────────────────────────────

const value = (await q("select * from customer_segments.mart_segment_value order by segment")).map((r) => ({
  segment: num(r.segment), customers: num(r.customers), revenue: num(r.revenue), next_year_revenue: num(r.next_year_revenue), churn_rate: num(r.churn_rate),
}));
const migration = (await q("select from_segment, to_segment, customers, revenue_before, revenue_after from customer_segments.mart_migration")).map((r) => ({
  from: num(r.from_segment), to: r.to_segment === "lapsed" ? "lapsed" : num(r.to_segment), customers: num(r.customers),
  revenue_before: num(r.revenue_before), revenue_after: num(r.revenue_after),
}));
const monthly = (await q(
  `select to_char(as_of, 'YYYY-MM-DD') as_of, segment, count(*) customers
   from customer_segments.assignments where model_id = $1 group by 1, 2 order by 1, 2`, [model.model_id],
)).map((r) => ({ as_of: String(r.as_of), segment: num(r.segment), customers: num(r.customers) }));
const chosen = model.selection.candidates.find((c) => c.set === model.selection.chosen.set && c.k === model.selection.chosen.k)!;

const out = {
  generated: new Date().toISOString().slice(0, 10),
  source: {
    name: "Online Retail II", publisher: "UCI Machine Learning Repository", author: "Daqing Chen", license: "CC BY 4.0",
    url: "https://archive.ics.uci.edu/dataset/502/online+retail+ii",
  },
  totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, k.endsWith("date") ? v : num(v)])),
  cleaning,
  asOf,
  nextAsOf,
  model: {
    features: model.features, k: model.k, scaler: model.scaler, centroids,
    silhouette: num(chosen.silhouette), stability: model.stability,
    r2: { segments: { next_revenue: num(chosen.r2_next_revenue), churn: num(chosen.r2_churn) }, rfm_score: model.baseline },
    candidates: model.selection.candidates,
  },
  ranges,
  segments: profiles,
  examples,
  sample,
  value,
  migration,
  monthly,
};
writeFileSync(OUT, `${JSON.stringify(out)}\n`);
console.log(`Wrote ${OUT} (${(JSON.stringify(out).length / 1024).toFixed(0)} KB)`);
await db.end();
