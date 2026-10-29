// Feature transforms shared by the model script and the page, so a slider value
// in the browser is scaled exactly as the training data was (FEATURES.md).

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

function quantile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo);
}

/** Fit log → cap → z-score on the training snapshot only. */
export function fitScaler(features: FeatureName[], rows: Record<string, number>[]): Scaler {
  return features.map((feature) => {
    const log = LOG_FEATURES.has(feature);
    const t = rows.map((r) => transform({ log }, r[feature])).sort((a, b) => a - b);
    const low = quantile(t, 0.01);
    const high = quantile(t, 0.99);
    const capped = t.map((v) => Math.min(Math.max(v, low), high));
    const mean = capped.reduce((s, v) => s + v, 0) / capped.length;
    const sd = Math.sqrt(capped.reduce((s, v) => s + (v - mean) ** 2, 0) / capped.length) || 1;
    return { feature, log, low, high, mean, sd };
  });
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
