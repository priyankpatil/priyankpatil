"use client";

import { useReducedMotion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface SkillPoint {
  skill: string;
  score: number;
  color: string;
  context: string;
}

function SkillTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: SkillPoint }>;
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;

  return (
    <div
      className="max-w-[220px] rounded-xl border px-3 py-2 text-xs border-border-strong bg-surface text-text"
    >
      <p className="font-semibold">{point.skill}</p>
      <p className="mt-1 text-muted">
        {point.context}
      </p>
      <p className="mt-1 text-[0.7rem] uppercase tracking-[0.14em] text-soft">
        Proficiency {point.score}/100
      </p>
    </div>
  );
}

export default function SkillsBarChart({ data }: { data: SkillPoint[] }) {
  const reduceMotion = useReducedMotion();

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 6, right: 16, left: 8, bottom: 4 }} barCategoryGap={14}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 6" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis
          type="category"
          dataKey="skill"
          width={132}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--soft)", fontSize: 11 }}
        />
        <Tooltip cursor={{ fill: "color-mix(in srgb, var(--surface-muted) 75%, transparent)" }} content={<SkillTooltip />} />
        <Bar dataKey="score" radius={[10, 10, 10, 10]} animationDuration={650} isAnimationActive={!reduceMotion}>
          {data.map((entry) => (
            <Cell key={entry.skill} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
