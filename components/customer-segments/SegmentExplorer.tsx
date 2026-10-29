"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, XAxis, YAxis } from "recharts";
import { nearest, scale } from "@/pipelines/customer-segments/src/features.ts";
import { data, FEATURE_LABEL, gbp, int, pct, segmentColor } from "@/lib/customer-segments/data";

// Segments on real customers, and the classifier: sliders → the same log, cap
// and scale steps as training → nearest segment centre. Runs in the browser.

const SLIDER_STEPS = 1000;
const X_TICKS = [1, 2, 5, 10, 20, 50];
const Y_TICKS = [1, 7, 30, 90, 365];

// Sliders move on a log scale, matching how the model sees the values.
function fromSlider(feature: string, position: number) {
  const r = data.ranges[feature];
  const lo = Math.log(Math.max(r.min, 1)), hi = Math.log(r.max);
  const v = Math.exp(lo + (position / SLIDER_STEPS) * (hi - lo));
  return feature === "orders" ? Math.round(v) : v;
}
function toSlider(feature: string, value: number) {
  const r = data.ranges[feature];
  const lo = Math.log(Math.max(r.min, 1)), hi = Math.log(r.max);
  return Math.round(((Math.log(Math.max(value, 1)) - lo) / (hi - lo)) * SLIDER_STEPS);
}

const totalCustomers = data.segments.reduce((s, x) => s + x.customers, 0);
const totalRevenue = data.segments.reduce((s, x) => s + x.revenue, 0);

function Dot({ cx = 0, cy = 0, fill = "" }: { cx?: number; cy?: number; fill?: string }) {
  return <circle cx={cx} cy={cy} r={3} fill={fill} fillOpacity={0.55} />;
}
function You({ cx = 0, cy = 0 }: { cx?: number; cy?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={13} fill="var(--accent)" fillOpacity={0.16} />
      <circle cx={cx} cy={cy} r={6.5} fill="var(--text)" stroke="var(--surface)" strokeWidth={2} />
    </g>
  );
}

export default function SegmentExplorer() {
  const [positions, setPositions] = useState(() =>
    Object.fromEntries(data.model.features.map((f) => [f, toSlider(f, data.ranges[f].median)])),
  );
  const values = useMemo(() => Object.fromEntries(data.model.features.map((f) => [f, fromSlider(f, positions[f])])), [positions]);
  const result = useMemo(() => nearest(scale(data.model.scaler, values), data.model.centroids), [values]);
  const seg = data.segments[result.best.segment];
  const runner = data.segments[result.runnerUp.segment];

  // Orders are whole numbers, so points get a small sideways jitter (deterministic) to stop them stacking into stripes.
  const groups = useMemo(
    () =>
      data.segments.map((s) =>
        data.sample
          .map((p, i) => ({ p, jitter: Math.exp((((i * 2654435761) % 1000) / 1000 - 0.5) * 0.28) }))
          .filter(({ p }) => p.segment === s.segment)
          .map(({ p, jitter }) => ({ x: Math.min(p.orders * jitter, 60), y: Math.max(p.recency_days, 1) })),
      ),
    [],
  );
  const you = [{ x: Math.min(values.orders, 60), y: Math.max(values.recency_days, 1) }];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <figure className="m-0 rounded-[22px] border border-border bg-surface p-4 sm:p-6">
          <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <span className="text-sm font-semibold text-text">{int(data.sample.length)} of {int(totalCustomers)} customers, 1 Dec 2010</span>
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {data.segments.map((s) => (
                <span key={s.segment} className="flex items-center gap-1.5 text-xs text-muted">
                  <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: segmentColor(s.segment) }} />
                  {s.name}
                </span>
              ))}
            </span>
          </figcaption>
          <div className="h-[300px] sm:h-[360px]" role="img" aria-label="Scatter of customers by number of orders and days since last order, coloured by segment, with your customer marked.">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 8, bottom: 22, left: 2 }}>
                <CartesianGrid strokeDasharray="2 6" stroke="var(--border)" />
                <XAxis type="number" dataKey="x" scale="log" domain={[0.8, 60]} ticks={X_TICKS} allowDataOverflow
                  tick={{ fill: "var(--soft)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--border-strong)" }}
                  label={{ value: "Orders in the year →", position: "insideBottom", offset: -14, style: { fill: "var(--soft)", fontSize: 11 } }} />
                <YAxis type="number" dataKey="y" scale="log" domain={[1, 365]} ticks={Y_TICKS} reversed allowDataOverflow width={44}
                  tick={{ fill: "var(--soft)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--border-strong)" }}
                  label={{ value: "Days since last order", angle: -90, position: "insideLeft", offset: 12, style: { fill: "var(--soft)", fontSize: 11, textAnchor: "middle" } }} />
                {groups.map((g, i) => (
                  <Scatter key={i} data={g} fill={segmentColor(i)} shape={<Dot fill={segmentColor(i)} />} isAnimationActive={false} />
                ))}
                <Scatter data={you} shape={<You />} isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-soft">
            Recent customers are at the top. Spend, the third input, isn&apos;t on this chart, which is why some colours overlap.
          </p>
        </figure>

        <div className="flex flex-col gap-4">
          <div className="rounded-[22px] border border-border bg-surface p-5">
            <p className="text-sm font-semibold text-text">Describe a customer</p>
            <div className="mt-4 flex flex-col gap-4">
              {data.model.features.map((f) => (
                <label key={f} className="flex flex-col gap-1.5">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-xs text-muted">{FEATURE_LABEL[f].label}</span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-text">{FEATURE_LABEL[f].unit(values[f])}</span>
                  </span>
                  <input type="range" min={0} max={SLIDER_STEPS} value={positions[f]} aria-valuetext={FEATURE_LABEL[f].unit(values[f])}
                    onChange={(e) => setPositions((p) => ({ ...p, [f]: Number(e.target.value) }))} className="w-full cursor-pointer accent-accent" />
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-[22px] border bg-surface p-5" style={{ borderColor: `color-mix(in srgb, ${segmentColor(seg.segment)} 45%, transparent)` }} aria-live="polite">
            <p className="text-xs text-soft">Nearest segment</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: segmentColor(seg.segment) }}>{seg.name}</p>
            <p className="mt-1 text-sm text-muted">{seg.tagline}</p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Distance {result.best.distance.toFixed(2)}; next closest is {runner.name} at {result.runnerUp.distance.toFixed(2)}.
              {result.runnerUp.distance - result.best.distance < 0.25 && " A borderline customer."}
            </p>
            <p className="mt-3 rounded-xl bg-accent-soft px-3.5 py-2.5 text-sm leading-relaxed text-text">
              <strong className="font-semibold">Action:</strong> {seg.action}
            </p>
            <p className="mt-2 text-right text-[0.7rem] text-soft">Classified in your browser · no server call</p>
          </div>
        </div>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.segments.map((s) => (
          <li key={s.segment} className="rounded-[18px] border border-border bg-surface p-5">
            <p className="flex items-center gap-2 text-base font-semibold text-text">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: segmentColor(s.segment) }} />
              {s.name}
            </p>
            <p className="mt-1 text-sm leading-snug text-muted">{s.tagline}</p>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
              <div><dt className="text-xs text-soft">Customers</dt><dd className="tabular-nums text-text">{pct(s.customers / totalCustomers)}</dd></div>
              <div><dt className="text-xs text-soft">Revenue</dt><dd className="tabular-nums text-text">{pct(s.revenue / totalRevenue)}</dd></div>
              <div><dt className="text-xs text-soft">Last order</dt><dd className="tabular-nums text-text">{int(s.recency_days)} days ago</dd></div>
              <div><dt className="text-xs text-soft">Orders a year</dt><dd className="tabular-nums text-text">{int(s.orders)}</dd></div>
              <div><dt className="text-xs text-soft">Typical order</dt><dd className="tabular-nums text-text">{gbp(s.avg_order_value)}</dd></div>
              <div><dt className="text-xs text-soft">Returned</dt><dd className="tabular-nums text-text">{pct(s.return_rate, 1)}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-soft">Shares and medians per segment. Returned is the average share of purchased value later cancelled.</p>
    </div>
  );
}
