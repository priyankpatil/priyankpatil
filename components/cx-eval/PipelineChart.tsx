"use client";

import { useReducedMotion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyPoint } from "@/lib/cx-eval/queries";
import { ChartTooltip, Legend, SERIES, gridStroke, xAxisProps, yAxisProps } from "./chart-kit";

// Records loaded per daily batch, split into those that passed validation and
// those quarantined. Stacked, so the total height is always the batch size.
export default function PipelineChart({ daily }: { daily: DailyPoint[] }) {
  const reduceMotion = useReducedMotion();
  const data = daily.map((d) => ({ ...d, passed: d.loaded - d.quarantined }));
  const worst = daily.reduce((w, d) => (d.quarantined > w.quarantined ? d : w), daily[0]);

  return (
    <div>
      <Legend
        rows={[
          { label: "Passed validation", color: SERIES.primary },
          { label: "Quarantined", color: SERIES.secondary },
        ]}
      />
      <div
        className="mt-3 h-52"
        role="img"
        aria-label={`Records loaded per day, split into passed and quarantined.${
          worst?.quarantined ? ` ${worst.quarantined} of ${worst.loaded} quarantined on ${worst.date}.` : ""
        }`}
      >
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 200 }}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="2 6" vertical={false} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip
              cursor={{ fill: "color-mix(in srgb, var(--surface-muted) 75%, transparent)" }}
              content={
                <ChartTooltip
                  rows={[
                    { key: "loaded", label: "Loaded", color: "transparent" },
                    { key: "passed", label: "Passed", color: SERIES.primary },
                    { key: "quarantined", label: "Quarantined", color: SERIES.secondary },
                    { key: "scored", label: "Scored by judge", color: "transparent" },
                  ]}
                />
              }
            />
            <Bar dataKey="passed" stackId="a" fill={SERIES.primary} isAnimationActive={!reduceMotion} />
            <Bar dataKey="quarantined" stackId="a" fill={SERIES.secondary} radius={[3, 3, 0, 0]} isAnimationActive={!reduceMotion} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
