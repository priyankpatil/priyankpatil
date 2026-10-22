"use client";

import { useReducedMotion } from "framer-motion";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Incident } from "@/lib/cx-eval/data";
import type { DailyPoint } from "@/lib/cx-eval/queries";
import { ChartTooltip, IncidentKey, SERIES, gridStroke, incidentLines, xAxisProps, yAxisProps } from "./chart-kit";

// CXI (0–100, judged sample) and CSAT (1–5, survey) have different scales, so
// they get two stacked charts on one time axis rather than a dual axis.

function Panel({
  title,
  note,
  children,
  label,
}: {
  title: string;
  note: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        <p className="text-xs text-soft">{note}</p>
      </div>
      <div className="mt-2 h-52" role="img" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

export default function TrendCharts({ daily, incidents }: { daily: DailyPoint[]; incidents: Incident[] }) {
  const reduceMotion = useReducedMotion();
  const scored = daily.filter((d) => d.cxi != null);
  const cxiRange = scored.length
    ? `${Math.min(...scored.map((d) => d.cxi!)).toFixed(0)} to ${Math.max(...scored.map((d) => d.cxi!)).toFixed(0)}`
    : "not yet available";

  return (
    <div className="space-y-6">
      <Panel
        title="CX Index (0–100)"
        note="Daily mean of ~20 judged chats; gaps are days not scored yet"
        label={`Daily CX Index line chart. Range ${cxiRange} across ${scored.length} scored days.`}
      >
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 200 }}>
          <LineChart data={daily} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="2 6" vertical={false} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} domain={[(min: number) => Math.min(40, Math.floor(min / 10) * 10), 100]} />
            {incidentLines(incidents)}
            <Tooltip
              cursor={{ stroke: "var(--border-strong)" }}
              content={<ChartTooltip rows={[{ key: "cxi", label: "CXI", color: SERIES.primary, format: (v) => v.toFixed(1) }, { key: "scored", label: "Chats scored", color: "transparent" }]} />}
            />
            <Line
              type="monotone"
              dataKey="cxi"
              name="CXI"
              stroke={SERIES.primary}
              strokeWidth={2}
              dot={{ r: 2.5, fill: SERIES.primary, strokeWidth: 0 }}
              activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={!reduceMotion}
            />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <Panel
        title="CSAT, 1–5 (simulated)"
        note="Daily mean of survey responses (~25% of chats)"
        label="Daily average CSAT line chart, simulated survey scores between 1 and 5."
      >
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 200 }}>
          <LineChart data={daily} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="2 6" vertical={false} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} domain={[(min: number) => Math.min(3.4, Math.floor(min * 5) / 5), (max: number) => Math.max(4.4, Math.ceil(max * 5) / 5)]}
              tickFormatter={(v: number) => v.toFixed(1)} />
            {incidentLines(incidents)}
            <Tooltip
              cursor={{ stroke: "var(--border-strong)" }}
              content={<ChartTooltip rows={[{ key: "csat", label: "CSAT", color: SERIES.secondary, format: (v) => v.toFixed(2) }, { key: "csatResponses", label: "Responses", color: "transparent" }]} />}
            />
            <Line
              type="monotone"
              dataKey="csat"
              name="CSAT"
              stroke={SERIES.secondary}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={!reduceMotion}
            />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <IncidentKey incidents={incidents} />
    </div>
  );
}
