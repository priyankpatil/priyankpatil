"use client";

import { useReducedMotion } from "framer-motion";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TeamSeriesPoint } from "@/lib/cx-eval/data";
import { ChartTooltip, Legend, SERIES, gridStroke, shortDate, xAxisProps, yAxisProps } from "./chart-kit";

// T4 is the cohort the day-22 incident routes identity-skipping chats to, so it
// carries the one strong colour; the other teams stay neutral context.
const FOCUS = "T4";

export default function TeamChart({
  series,
  teams,
  routingDate,
}: {
  series: TeamSeriesPoint[];
  teams: string[];
  routingDate: string;
}) {
  const reduceMotion = useReducedMotion();
  const others = teams.filter((t) => t !== FOCUS);
  const fmt = (v: number) => `${v.toFixed(1)}%`;

  return (
    <div>
      <Legend
        rows={[
          { label: `${FOCUS} (focus)`, color: SERIES.secondary },
          { label: others.join(", "), color: SERIES.neutral },
        ]}
      />
      <div
        className="mt-3 h-60"
        role="img"
        aria-label={`Daily ground-truth identity compliance by team. ${FOCUS} drops after ${shortDate(routingDate)} while ${others.join(", ")} hold steady.`}
      >
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 200 }}>
          <LineChart data={series} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="2 6" vertical={false} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} domain={[(min: number) => Math.min(50, Math.floor(min / 10) * 10), 100]} unit="%" width={44} />
            <ReferenceLine
              x={routingDate}
              stroke="var(--soft)"
              strokeDasharray="3 4"
              label={{ value: "routing change", position: "insideTopLeft", fill: "var(--soft)", fontSize: 11 }}
            />
            <Tooltip
              cursor={{ stroke: "var(--border-strong)" }}
              content={
                <ChartTooltip
                  rows={[FOCUS, ...others].map((t) => ({
                    key: t,
                    label: t,
                    color: t === FOCUS ? SERIES.secondary : SERIES.neutral,
                    format: fmt,
                  }))}
                />
              }
            />
            {others.map((t) => (
              <Line
                key={t}
                type="monotone"
                dataKey={t}
                stroke={SERIES.neutral}
                strokeWidth={1.5}
                strokeOpacity={0.7}
                dot={false}
                activeDot={false}
                isAnimationActive={!reduceMotion}
              />
            ))}
            <Line
              type="monotone"
              dataKey={FOCUS}
              stroke={SERIES.secondary}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={!reduceMotion}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
