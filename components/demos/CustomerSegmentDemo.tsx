"use client";

import { useMemo, useState } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, ResponsiveContainer, CartesianGrid } from "recharts";

// ── Model ───────────────────────────────────────────────────────────────────

const SEGMENTS = [
  { id: 0, name: "Champions",        color: "#4ea0ff", tagline: "High-value, recently active",          action: "Reward loyalty, ask for reviews, early access.",      centroid: { recency: 88, frequency: 22, monetary: 380, tenure: 48 } },
  { id: 1, name: "At-Risk Loyalists",color: "#f59e0b", tagline: "Strong history, declining engagement", action: "Win-back campaign with a personalised offer.",         centroid: { recency: 24, frequency: 15, monetary: 285, tenure: 40 } },
  { id: 2, name: "Promising",        color: "#10b981", tagline: "New and growing fast",                 action: "Onboard well, surface complementary products.",       centroid: { recency: 72, frequency: 5,  monetary: 140, tenure: 7  } },
  { id: 3, name: "Inactive",         color: "#6b7280", tagline: "Low engagement across all dimensions", action: "Re-engagement sequence or graceful sunset.",          centroid: { recency: 12, frequency: 2,  monetary: 60,  tenure: 20 } },
] as const;

type SID = 0 | 1 | 2 | 3;
const RANGES = { recency: 100, frequency: 30, monetary: 500, tenure: 60 };

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number, mean: number, std: number, lo: number, hi: number) {
  const u = Math.max(1e-10, r()), v = r();
  return Math.max(lo, Math.min(hi, mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)));
}

interface C { recency: number; frequency: number; monetary: number; tenure: number; segmentId: SID; }

function generate(): C[] {
  const r = rng(1337); const out: C[] = [];
  for (const s of SEGMENTS)
    for (let i = 0; i < 55; i++)
      out.push({ recency: gauss(r,s.centroid.recency,14,0,100), frequency: gauss(r,s.centroid.frequency,4,0,30), monetary: gauss(r,s.centroid.monetary,55,0,500), tenure: gauss(r,s.centroid.tenure,7,0,60), segmentId: s.id });
  return out;
}

function project(c: Omit<C,"segmentId">) {
  return {
    x: +((c.frequency/30*0.55 + c.monetary/500*0.45)*100).toFixed(1),
    y: +((c.recency/100*0.72 + c.tenure/60*0.28)*100).toFixed(1),
  };
}

function classify(inputs: Omit<C,"segmentId">) {
  const keys = Object.keys(RANGES) as (keyof typeof RANGES)[];
  const dists = SEGMENTS.map(s => Math.sqrt(keys.reduce((sum,k) => { const d=(inputs[k]-s.centroid[k])/RANGES[k]; return sum+d*d; },0)));
  const min = Math.min(...dists), idx = dists.indexOf(min) as SID;
  const invSum = dists.reduce((a,d) => a+1/(d+1e-6),0);
  const conf = (1/(min+1e-6))/invSum;
  return { segmentId: idx, confidence: conf, dists };
}

// ── Component ───────────────────────────────────────────────────────────────

function Slider({ label, value, min, max, step, format, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  format: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="font-sans text-[0.74rem] text-muted">{label}</span>
        <span className="font-mono text-[0.78rem] font-semibold tabular-nums text-text">{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)}
        className="w-full cursor-pointer accent-accent"
      />
    </label>
  );
}

function CustomDot({ cx=0, cy=0, fill="#fff" }: { cx?: number; cy?: number; fill?: string }) {
  return <circle cx={cx} cy={cy} r={3.5} fill={fill} fillOpacity={0.65} />;
}
function StarDot({ cx=0, cy=0 }: { cx?: number; cy?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={12} fill="var(--accent)" fillOpacity={0.15} />
      <circle cx={cx} cy={cy} r={7}  fill="var(--text)"   stroke="var(--accent)" strokeWidth={2} />
    </g>
  );
}

export default function CustomerSegmentDemo() {
  const [recency,   setRecency]   = useState(70);
  const [frequency, setFrequency] = useState(8);
  const [monetary,  setMonetary]  = useState(180);
  const [tenure,    setTenure]    = useState(18);

  const customers = useMemo(generate, []);
  const result    = useMemo(() => classify({ recency, frequency, monetary, tenure }), [recency, frequency, monetary, tenure]);
  const seg       = SEGMENTS[result.segmentId];
  const newPoint  = useMemo(() => [project({ recency, frequency, monetary, tenure })], [recency, frequency, monetary, tenure]);
  const grouped   = useMemo(() => SEGMENTS.map(s => customers.filter(c => c.segmentId===s.id).map(c => project(c))), [customers]);

  const card = "rounded-[20px] border border-border bg-surface p-5 shadow-[var(--shadow)]";
  const cardLabel = "text-[0.62rem] font-bold uppercase tracking-[0.2em] text-soft";

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_340px]">

      {/* ── Scatter plot ── */}
      <div className={card}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className={cardLabel}>
            Customer Distribution · 220 customers
          </span>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {SEGMENTS.map(s => (
              <span key={s.id} className="flex items-center gap-[5px] text-[0.7rem] text-muted">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.name}
              </span>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={340}>
          <ScatterChart margin={{ top: 4, right: 4, bottom: 20, left: 4 }}>
            <CartesianGrid strokeDasharray="2 6" stroke="var(--border)" />
            <XAxis type="number" dataKey="x" domain={[0,100]} tick={false} axisLine={false} tickLine={false}
              label={{ value: "Purchase Intensity →", position: "insideBottom", offset: -8, style: { fill: "var(--soft)", fontSize: 10 } }} />
            <YAxis type="number" dataKey="y" domain={[0,100]} tick={false} axisLine={false} tickLine={false}
              label={{ value: "Engagement →", angle: -90, position: "insideLeft", offset: 14, style: { fill: "var(--soft)", fontSize: 10 } }} />
            {SEGMENTS.map((s,i) => (
              <Scatter key={s.id} data={grouped[i]} fill={s.color} shape={<CustomDot fill={s.color} />} isAnimationActive={false} />
            ))}
            <Scatter data={newPoint} fill="var(--text)" shape={<StarDot />} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* ── Right column ── */}
      <div className="flex flex-col gap-3">

        {/* Sliders */}
        <div className={card}>
          <p className={`${cardLabel} mb-4`}>
            Customer Attributes
          </p>
          <div className="flex flex-col gap-4">
            <Slider label="Recency"   value={recency}   min={0} max={100} step={1}  format={v=>`${v} days ago`} onChange={setRecency} />
            <Slider label="Frequency" value={frequency} min={0} max={30}  step={1}  format={v=>`${v} orders / yr`} onChange={setFrequency} />
            <Slider label="Avg Order" value={monetary}  min={0} max={500} step={5}  format={v=>`$${v}`}         onChange={setMonetary} />
            <Slider label="Tenure"    value={tenure}    min={0} max={60}  step={1}  format={v=>`${v} months`}   onChange={setTenure} />
          </div>
        </div>

        {/* Result — border tinted with the segment colour */}
        <div className={card} style={{ borderColor: seg.color + "55" }}>
          <p className={`${cardLabel} mb-3`}>
            Classification
          </p>
          <div className="mb-[0.4rem] flex items-baseline gap-3">
            <span className="text-[1.5rem] font-bold tracking-[-0.02em]" style={{ color: seg.color }}>{seg.name}</span>
            <span className="text-[0.75rem] text-soft">{(result.confidence*100).toFixed(0)}% confidence</span>
          </div>
          <p className="mb-3 text-[0.82rem] text-muted">{seg.tagline}</p>

          {/* Confidence bars */}
          <div className="mb-3 flex flex-col gap-2">
            {SEGMENTS.map((s,i) => {
              const inv = 1/(result.dists[i]+1e-6);
              const invS = result.dists.reduce((a,d)=>a+1/(d+1e-6),0);
              const pct  = (inv/invS)*100;
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <span className="w-28 overflow-hidden whitespace-nowrap text-[0.65rem] text-soft">{s.name}</span>
                  <div className="h-1 flex-1 overflow-hidden rounded bg-border">
                    <div
                      className="h-full rounded transition-[width] duration-[400ms] ease-in-out"
                      style={{ background: s.color, width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-[0.65rem] tabular-nums text-soft">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>

          {/* Action */}
          <div className="rounded-[10px] bg-accent-soft px-[0.8rem] py-[0.6rem] text-[0.78rem] leading-normal text-text">
            <strong>Action: </strong>{seg.action}
          </div>

          <p className="mt-2 text-right text-[0.62rem] text-soft">
            Nearest-centroid · Client-side · No server call
          </p>
        </div>
      </div>
    </div>
  );
}
