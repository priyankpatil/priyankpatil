// Typed access to the pipeline's export (pipelines/customer-segments/scripts/export.mts).

import json from "./segments.json";
import type { FeatureName, Scaler } from "@/pipelines/customer-segments/src/features.ts";

export interface SegmentProfile {
  segment: number;
  name: string;
  tagline: string;
  action: string;
  customers: number;
  revenue: number;
  recency_days: number;
  orders: number;
  avg_order_value: number;
  active_months: number;
  product_breadth: number;
  return_rate: number;
  share_uk: number;
}

export interface Example {
  customer_id: number;
  country: string | null;
  segment: number;
  orders: { invoice: string; date: string; lines: number; units: number; value: number }[];
  lines: { invoice: string; date: string; stock_code: string; description: string | null; quantity: number; price: number; revenue: number }[];
  raw: Record<string, number>;
  steps: { feature: FeatureName; raw: number; transformed: number; capped: number; scaled: number }[];
  distances: { segment: number; distance: number }[];
}

export interface SegmentsData {
  generated: string;
  source: { name: string; publisher: string; author: string; license: string; url: string };
  totals: { customers: number; invoices: number; products: number; revenue: number; first_date: string; last_date: string; share_uk: number; countries: number };
  cleaning: { step: number; rule: string; reason: string; removed: number; left: number }[];
  asOf: string;
  nextAsOf: string;
  model: {
    features: FeatureName[];
    k: number;
    scaler: Scaler;
    centroids: number[][];
    silhouette: number;
    stability: { bootstraps: number; mean_ari: number; min_ari: number };
    r2: { segments: { next_revenue: number; churn: number }; rfm_score: { k: number; r2_next_revenue: number; r2_churn: number } };
  };
  ranges: Record<string, { min: number; max: number; median: number }>;
  segments: SegmentProfile[];
  examples: Example[];
  sample: { recency_days: number; orders: number; revenue: number; segment: number }[];
  value: { segment: number; customers: number; revenue: number; next_year_revenue: number; churn_rate: number }[];
  migration: { from: number; to: number | "lapsed"; customers: number; revenue_before: number; revenue_after: number }[];
  monthly: { as_of: string; segment: number; customers: number }[];
}

export const data = json as unknown as SegmentsData;

/** Segment colours: CSS variables set on the page root, light and dark. */
export const segmentColor = (segment: number) => `var(--seg-${segment})`;

export const FEATURE_LABEL: Record<string, { label: string; short: string; unit: (v: number) => string }> = {
  recency_days: { label: "Days since last order", short: "Recency (days)", unit: (v) => `${Math.round(v)} days` },
  orders: { label: "Orders in the last 12 months", short: "Orders", unit: (v) => `${Math.round(v)}` },
  revenue: { label: "Spend in the last 12 months", short: "Spend", unit: (v) => gbp(v) },
};

export const gbp = (v: number) =>
  v >= 1_000_000 ? `£${(v / 1_000_000).toFixed(1)}M` : v >= 10_000 ? `£${(v / 1000).toFixed(0)}K` : `£${Math.round(v).toLocaleString("en-GB")}`;
export const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;
export const int = (v: number) => Math.round(v).toLocaleString("en-GB");
