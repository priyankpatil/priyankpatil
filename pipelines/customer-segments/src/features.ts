// Applies the scaler that model/model.py fitted and stored (model_runs.scaler),
// so a slider value in the browser is scaled exactly as the training data was
// (FEATURES.md). Keep transform and cap in step with fit_scaler/scale in model.py.

export type FeatureName =
  | "recency_days" | "orders" | "revenue" | "avg_order_value" | "tenure_days"
  | "active_months" | "product_breadth" | "return_rate" | "trend";

/** Skewed counts and amounts are compared on a log scale. */
export const LOG_FEATURES: ReadonlySet<FeatureName> = new Set(["recency_days", "orders", "revenue", "avg_order_value", "product_breadth"]);

export interface ScalerEntry {
  feature: FeatureName;
  log: boolean;
  /** Caps on the transformed value: its 1st and 99th percentiles in training. */
  low: number;
  high: number;
  mean: number;
  sd: number;
}

export type Scaler = ScalerEntry[];

export const transform = (e: Pick<ScalerEntry, "log">, x: number) => (e.log ? Math.log1p(Math.max(x, 0)) : x);
export const cap = (e: ScalerEntry, t: number) => Math.min(Math.max(t, e.low), e.high);
export const scaleOne = (e: ScalerEntry, x: number) => (cap(e, transform(e, x)) - e.mean) / e.sd;

export function scale(scaler: Scaler, raw: Record<string, number>): number[] {
  return scaler.map((e) => scaleOne(e, raw[e.feature]));
}

export function distance(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

/** Nearest centroid and runner-up: the classifier is the k-means assignment rule. */
export function nearest(point: readonly number[], centroids: readonly (readonly number[])[]) {
  const d = centroids.map((c, segment) => ({ segment, distance: distance(point, c) })).sort((a, b) => a.distance - b.distance);
  return { best: d[0], runnerUp: d[1], all: d };
}
