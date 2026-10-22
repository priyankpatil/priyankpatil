"use client";

import { useReducedMotion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Findings } from "@/lib/cx-eval/types";
import { ChartTooltip, Legend, SERIES, eventLine, gridStroke, shortDate, xAxisProps, yAxisProps } from "./chart-kit";

// One chart per finding. Single y-axis each: CXI and CSAT get two stacked
// panels sharing the date axis rather than a dual-axis chart.

const pct = (v: number) => `${v.toFixed(1)}%`;

export function TeamChart({ data }: { data: Findings["team"] }) {
  const reduce = useReducedMotion();
  const rows = [
    { key: "t4", label: "Team T4", color: SERIES.secondary, format: pct },
    { key: "others", label: "Other teams", color: SERIES.neutral, format: pct },
    { key: "company", label: "Company-wide", color: SERIES.primary, format: pct, dashed: true },
  ];
  return (
    <div>
      <Legend rows={rows} />
      <div
        className="mt-3 h-56"
        role="img"
        aria-label={`Daily identity compliance. From ${shortDate(data.routingDate)} team T4 falls from ${data.before.t4}% to ${data.after.t4}% while other teams rise to ${data.after.others}% and the company-wide rate stays near ${data.after.company}%.`}
      >
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 220 }}>
          <LineChart data={data.series} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="2 6" vertical={false} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} domain={[50, 100]} unit="%" width={44} />
            {eventLine(data.routingDate, "routing change")}
            <Tooltip cursor={{ stroke: "var(--border-strong)" }} content={<ChartTooltip rows={rows} />} />
            <Line dataKey="others" stroke={SERIES.neutral} strokeWidth={2} dot={false} isAnimationActive={!reduce} />
            <Line dataKey="company" stroke={SERIES.primary} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={!reduce} />
            <Line dataKey="t4" stroke={SERIES.secondary} strokeWidth={2.5} dot={false} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={!reduce} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MiniLine({
  data,
  dataKey,
  label,
  color,
  domain,
  format,
  marker,
  height = "h-36",
  showX = true,
  means,
}: {
  data: Findings["model"]["series"];
  dataKey: "cxi" | "csat";
  label: string;
  color: string;
  domain: [number, number];
  format: (v: number) => string;
  marker: { date: string; label: string };
  height?: string;
  showX?: boolean;
  /** Period averages drawn as flat segments before and after the marker. */
  means?: [number, number];
}) {
  const first = data[0]?.date;
  const last = data.at(-1)?.date;
  const reduce = useReducedMotion();
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <div className={`mt-1 ${height}`}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 140 }}>
          <LineChart data={data} margin={{ top: 14, right: 8, left: 0, bottom: 0 }} syncId="cx-model">
            <CartesianGrid stroke={gridStroke} strokeDasharray="2 6" vertical={false} />
            <XAxis {...xAxisProps} hide={!showX} />
            <YAxis {...yAxisProps} domain={domain} width={44} tickFormatter={format} tickCount={3} />
            {eventLine(marker.date, marker.label)}
            {means && first && last && (
              <>
                <ReferenceLine segment={[{ x: first, y: means[0] }, { x: marker.date, y: means[0] }]} stroke={color} strokeWidth={2.5} strokeDasharray="6 3" label={{ value: `avg ${format(means[0])}`, position: "insideBottomLeft", fill: "var(--muted)", fontSize: 11 }} />
                <ReferenceLine segment={[{ x: marker.date, y: means[1] }, { x: last, y: means[1] }]} stroke={color} strokeWidth={2.5} strokeDasharray="6 3" label={{ value: `avg ${format(means[1])}`, position: "insideTopRight", fill: "var(--muted)", fontSize: 11 }} />
              </>
            )}
            <Tooltip cursor={{ stroke: "var(--border-strong)" }} content={<ChartTooltip rows={[{ key: dataKey, label, color, format }]} />} />
            <Line dataKey={dataKey} stroke={color} strokeOpacity={means ? 0.45 : 1} strokeWidth={means ? 1.5 : 2} dot={false} connectNulls activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={!reduce} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ModelChart({ data }: { data: Findings["model"] }) {
  const marker = { date: data.switchDate, label: "judge model switched" };
  return (
    <div
      role="img"
      aria-label={`Daily CX Index rises from about ${data.before.cxi} to ${data.after.cxi} after the judge model switch on ${shortDate(data.switchDate)}, while CSAT stays flat near ${data.after.csat}.`}
      className="flex flex-col gap-2"
    >
      <MiniLine data={data.series} dataKey="cxi" label="CX Index (judge score, 0–100)" color={SERIES.primary} domain={[60, 100]} format={(v) => v.toFixed(0)} marker={marker} showX={false} means={[data.before.cxi, data.after.cxi]} />
      <MiniLine data={data.series} dataKey="csat" label="CSAT (customers, 1–5)" color={SERIES.neutral} domain={[3, 5]} format={(v) => v.toFixed(2)} marker={marker} means={[data.before.csat, data.after.csat]} />
    </div>
  );
}

export function QuarantineChart({ data }: { data: Findings["quarantine"] }) {
  const reduce = useReducedMotion();
  const series = data.series.map((d) => ({ date: d.date, valid: d.loaded - d.quarantined, quarantined: d.quarantined }));
  const rows = [
    { key: "valid", label: "Loaded and valid", color: SERIES.neutral },
    { key: "quarantined", label: "Quarantined", color: SERIES.bad },
  ];
  return (
    <div>
      <Legend rows={rows} />
      <div
        className="mt-3 h-56"
        role="img"
        aria-label={`Records per daily batch. Every day loads about 330 valid records except ${shortDate(data.date)}, when ${data.series.find((d) => d.date === data.date)?.quarantined} records were quarantined.`}
      >
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 220 }}>
          <BarChart data={series} margin={{ top: 16, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="2 6" vertical={false} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} width={40} />
            <Tooltip cursor={{ fill: "var(--surface-muted)" }} content={<ChartTooltip rows={rows} />} />
            <Bar dataKey="valid" stackId="a" fill={SERIES.neutral} fillOpacity={0.55} isAnimationActive={!reduce} />
            <Bar dataKey="quarantined" stackId="a" fill={SERIES.bad} radius={[3, 3, 0, 0]} isAnimationActive={!reduce} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
