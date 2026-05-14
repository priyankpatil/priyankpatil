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
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: "0.74rem", color: "var(--muted)", fontFamily: "var(--font-sans)" }}>{label}</span>
        <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", fontFamily: "var(--font-mono)", tabularNums: true } as React.CSSProperties}>{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)}
        style={{ width: "100%", accentColor: "var(--accent)", cursor: "pointer" }}
      />
    </div>
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

  const card: React.CSSProperties = {
    border: "1px solid var(--border)", borderRadius: "20px",
    background: "var(--surface)", boxShadow: "var(--shadow)",
    padding: "1.25rem",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1rem", alignItems: "start" }}>

      {/* ── Scatter plot ── */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <span style={{ color: "var(--soft)", fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase" }}>
            Customer Distribution · 220 customers
          </span>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            {SEGMENTS.map(s => (
              <span key={s.id} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.7rem", color: "var(--muted)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, display: "inline-block" }} />
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
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>

        {/* Sliders */}
        <div style={card}>
          <p style={{ color: "var(--soft)", fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "1rem" }}>
            Customer Attributes
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Slider label="Recency"   value={recency}   min={0} max={100} step={1}  format={v=>`${v} days ago`} onChange={setRecency} />
            <Slider label="Frequency" value={frequency} min={0} max={30}  step={1}  format={v=>`${v} orders / yr`} onChange={setFrequency} />
            <Slider label="Avg Order" value={monetary}  min={0} max={500} step={5}  format={v=>`$${v}`}         onChange={setMonetary} />
            <Slider label="Tenure"    value={tenure}    min={0} max={60}  step={1}  format={v=>`${v} months`}   onChange={setTenure} />
          </div>
        </div>

        {/* Result */}
        <div style={{ ...card, borderColor: seg.color + "55" }}>
          <p style={{ color: "var(--soft)", fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
            Classification
          </p>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "0.4rem" }}>
            <span style={{ fontSize: "1.5rem", fontWeight: 700, color: seg.color, letterSpacing: "-0.02em" }}>{seg.name}</span>
            <span style={{ fontSize: "0.75rem", color: "var(--soft)" }}>{(result.confidence*100).toFixed(0)}% confidence</span>
          </div>
          <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "0.75rem" }}>{seg.tagline}</p>

          {/* Confidence bars */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
            {SEGMENTS.map((s,i) => {
              const inv = 1/(result.dists[i]+1e-6);
              const invS = result.dists.reduce((a,d)=>a+1/(d+1e-6),0);
              const pct  = (inv/invS)*100;
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.65rem", width: "7rem", whiteSpace: "nowrap", overflow: "hidden", color: "var(--soft)" }}>{s.name}</span>
                  <div style={{ flex: 1, height: "4px", borderRadius: "4px", background: "var(--border)", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: "4px", background: s.color, width: `${pct}%`, transition: "width 0.4s ease" }} />
                  </div>
                  <span style={{ fontSize: "0.65rem", width: "2rem", textAlign: "right", color: "var(--soft)", fontVariantNumeric: "tabular-nums" }}>{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>

          {/* Action */}
          <div style={{ background: "var(--accent-soft)", borderRadius: "10px", padding: "0.6rem 0.8rem", fontSize: "0.78rem", color: "var(--text)", lineHeight: 1.5 }}>
            <strong>Action: </strong>{seg.action}
          </div>

          <p style={{ fontSize: "0.62rem", color: "var(--soft)", textAlign: "right", marginTop: "0.5rem" }}>
            Nearest-centroid · Client-side · No server call
          </p>
        </div>
      </div>
    </div>
  );
}
