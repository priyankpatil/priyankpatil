"use client";

import { useReducedMotion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Findings } from "@/lib/cx-eval/types";
import { ChartTooltip, SERIES, eventLine, gridStroke, shortDate, xAxisProps, yAxisProps } from "./chart-kit";

// One chart per finding. Single y-axis each: CXI and CSAT get two stacked
// panels sharing the date axis rather than a dual-axis chart.

const pct = (v: number) => `${v.toFixed(1)}%`;

/** A direct label drawn at the last point of a line, so the chart needs no legend. */
function endLabel(text: string, color: string, lastIndex: number) {
  function EndLabel(props: { x?: number | string; y?: number | string; index?: number }) {
    if (props.index !== lastIndex || props.x == null || props.y == null) return <g />;
    return (
      <text x={Number(props.x) + 6} y={Number(props.y)} dy={4} fill={color} fontSize={11} fontWeight={600}>
        {text}
      </text>
    );
  }
  return EndLabel;
}

export function TeamChart({ data }: { data: Findings["team"] }) {
  const reduce = useReducedMotion();
  const last = data.series.length - 1;
  const rows = [
    { key: "t4", label: "Team T4", color: SERIES.secondary, format: pct },
    { key: "company", label: "Whole company", color: SERIES.primary, format: pct },
  ];
  return (
    <div>
      <p className="text-xs font-medium text-muted">Share of chats with the required identity check, per day</p>
      <div
        className="mt-1 h-56"
        role="img"
        aria-label={`Daily identity-check rate. From ${shortDate(data.routingDate)} team T4 falls from ${data.before.t4}% to ${data.after.t4}% while the whole company stays near ${data.after.company}%.`}
      >
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 220 }}>
          <LineChart data={data.series} margin={{ top: 16, right: 64, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="2 6" vertical={false} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} domain={[50, 100]} unit="%" width={44} />
            {eventLine(data.routingDate, "routing change")}
            <Tooltip cursor={{ stroke: "var(--border-strong)" }} content={<ChartTooltip rows={rows} />} />
            <Line dataKey="company" stroke={SERIES.primary} strokeWidth={2} dot={false} label={endLabel("Company", SERIES.primary, last)} isAnimationActive={!reduce} />
            <Line dataKey="t4" stroke={SERIES.secondary} strokeWidth={2.5} dot={false} label={endLabel("Team T4", SERIES.secondary, last)} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={!reduce} />
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
  const marker = { date: data.switchDate, label: "judge switched" };
  return (
    <div
      role="img"
      aria-label={`Daily quality score rises from about ${data.before.cxi} to ${data.after.cxi} after the judge model switch on ${shortDate(data.switchDate)}, while customer satisfaction stays flat near ${data.after.csat}.`}
      className="flex flex-col gap-2"
    >
      <MiniLine data={data.series} dataKey="cxi" label="Quality score from the judge (0–100)" color={SERIES.primary} domain={[60, 100]} format={(v) => v.toFixed(0)} marker={marker} showX={false} means={[data.before.cxi, data.after.cxi]} />
      <MiniLine data={data.series} dataKey="csat" label="Customer satisfaction rating (1–5)" color={SERIES.neutral} domain={[3, 5]} format={(v) => v.toFixed(2)} marker={marker} means={[data.before.csat, data.after.csat]} />
    </div>
  );
}

export function QuarantineChart({ data }: { data: Findings["quarantine"] }) {
  const reduce = useReducedMotion();
  const series = data.series.map((d) => ({ date: d.date, valid: d.loaded - d.quarantined, quarantined: d.quarantined }));
  const day = data.series.find((d) => d.date === data.date);
  const rows = [
    { key: "valid", label: "Passed the checks", color: SERIES.neutral },
    { key: "quarantined", label: "Held back", color: SERIES.bad },
  ];
  return (
    <div>
      <p className="text-xs font-medium text-muted">
        Chats per day: <span className="text-[color:var(--cx-bad)]">held back</span> vs passed the checks
      </p>
      <div
        className="mt-1 h-56"
        role="img"
        aria-label={`Chats per daily batch. Every day about 330 chats pass the checks, except ${shortDate(data.date)}, when ${day?.quarantined} of ${day?.loaded} were held back.`}
      >
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 220 }}>
          <BarChart data={series} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="2 6" vertical={false} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} width={40} />
            <Tooltip cursor={{ fill: "var(--surface-muted)" }} content={<ChartTooltip rows={rows} />} />
            <Bar dataKey="valid" stackId="a" fill={SERIES.neutral} fillOpacity={0.55} isAnimationActive={!reduce} />
            <Bar
              dataKey="quarantined"
              stackId="a"
              fill={SERIES.bad}
              radius={[3, 3, 0, 0]}
              isAnimationActive={!reduce}
              label={{
                position: "top",
                fill: SERIES.bad,
                fontSize: 11,
                fontWeight: 600,
                formatter: (v: unknown) => (typeof v === "number" && v > 0 ? `${v} held back` : ""),
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
