// k-means with k-means++ starts, plus the checks used to choose and trust it:
// silhouette (how well separated), adjusted Rand index (how stable) and
// R² of an outcome by group (how useful).

import { distance, nearest } from "./features.ts";

/** Seeded PRNG (mulberry32), so every fit is reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Fit {
  centroids: number[][];
  labels: number[];
  inertia: number;
}

function kmeansOnce(points: number[][], k: number, rand: () => number, maxIter = 100): Fit {
  // k-means++: each new start is drawn in proportion to squared distance from the nearest start.
  const centroids = [points[Math.floor(rand() * points.length)].slice()];
  const d2 = points.map((p) => distance(p, centroids[0]) ** 2);
  while (centroids.length < k) {
    const total = d2.reduce((s, v) => s + v, 0);
    let r = rand() * total;
    let i = 0;
    while (r > d2[i] && i < points.length - 1) r -= d2[i++];
    centroids.push(points[i].slice());
    points.forEach((p, j) => (d2[j] = Math.min(d2[j], distance(p, centroids[centroids.length - 1]) ** 2)));
  }

  const labels = new Array<number>(points.length).fill(-1);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    points.forEach((p, i) => {
      const s = nearest(p, centroids).best.segment;
      if (s !== labels[i]) {
        labels[i] = s;
        changed = true;
      }
    });
    if (!changed) break;
    const dims = points[0].length;
    const sums = centroids.map(() => new Array<number>(dims).fill(0));
    const counts = new Array<number>(k).fill(0);
    points.forEach((p, i) => {
      counts[labels[i]]++;
      p.forEach((v, d) => (sums[labels[i]][d] += v));
    });
    sums.forEach((s, c) => {
      if (counts[c]) centroids[c] = s.map((v) => v / counts[c]);
    });
  }
  const inertia = points.reduce((s, p, i) => s + distance(p, centroids[labels[i]]) ** 2, 0);
  return { centroids, labels, inertia };
}

/** Best of `restarts` fits by inertia. */
export function kmeans(points: number[][], k: number, seed: number, restarts = 20): Fit {
  const rand = rng(seed);
  let best: Fit | null = null;
  for (let r = 0; r < restarts; r++) {
    const fit = kmeansOnce(points, k, rand);
    if (!best || fit.inertia < best.inertia) best = fit;
  }
  return best!;
}

export const assign = (points: number[][], centroids: number[][]) => points.map((p) => nearest(p, centroids).best.segment);

/** Mean silhouette: for each point, (b − a) / max(a, b), a = own-cluster distance, b = nearest other cluster. */
export function silhouette(points: number[][], labels: number[], k: number): number {
  const n = points.length;
  let total = 0;
  const sums = new Float64Array(k);
  const counts = new Array<number>(k).fill(0);
  labels.forEach((l) => counts[l]++);
  for (let i = 0; i < n; i++) {
    sums.fill(0);
    for (let j = 0; j < n; j++) if (j !== i) sums[labels[j]] += distance(points[i], points[j]);
    const own = labels[i];
    if (counts[own] < 2) continue;
    const a = sums[own] / (counts[own] - 1);
    let b = Infinity;
    for (let c = 0; c < k; c++) if (c !== own && counts[c]) b = Math.min(b, sums[c] / counts[c]);
    total += (b - a) / Math.max(a, b);
  }
  return total / n;
}

const choose2 = (x: number) => (x * (x - 1)) / 2;

/** Adjusted Rand index: agreement between two labellings, corrected for chance (1 = identical). */
export function adjustedRand(a: number[], b: number[]): number {
  const table = new Map<string, number>();
  const rows = new Map<number, number>();
  const cols = new Map<number, number>();
  a.forEach((x, i) => {
    const key = `${x}:${b[i]}`;
    table.set(key, (table.get(key) ?? 0) + 1);
    rows.set(x, (rows.get(x) ?? 0) + 1);
    cols.set(b[i], (cols.get(b[i]) ?? 0) + 1);
  });
  const index = [...table.values()].reduce((s, v) => s + choose2(v), 0);
  const sumRows = [...rows.values()].reduce((s, v) => s + choose2(v), 0);
  const sumCols = [...cols.values()].reduce((s, v) => s + choose2(v), 0);
  const expected = (sumRows * sumCols) / choose2(a.length);
  const max = (sumRows + sumCols) / 2;
  return (index - expected) / (max - expected);
}

/** Share of an outcome's variance explained by group means. */
export function rSquared(outcome: number[], groups: number[]): number {
  const mean = outcome.reduce((s, v) => s + v, 0) / outcome.length;
  const by = new Map<number, { sum: number; n: number }>();
  outcome.forEach((v, i) => {
    const g = by.get(groups[i]) ?? { sum: 0, n: 0 };
    g.sum += v;
    g.n++;
    by.set(groups[i], g);
  });
  const total = outcome.reduce((s, v) => s + (v - mean) ** 2, 0);
  const between = [...by.values()].reduce((s, g) => s + g.n * (g.sum / g.n - mean) ** 2, 0);
  return between / total;
}
