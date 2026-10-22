"use client";

import { ReferenceLine } from "recharts";

// Shared pieces for the CX eval finding charts. Series colours are CSS variables set on
// the page root (light and dark steps of a validated categorical palette), so
// every chart follows the site theme without re-rendering.

export const SERIES = {
  primary: "var(--cx-1)",
  secondary: "var(--cx-2)",
  neutral: "var(--cx-neutral)",
  bad: "var(--cx-bad)",
} as const;

export const axisTick = { fill: "var(--soft)", fontSize: 11 };
export const gridStroke = "var(--border)";

export function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export const xAxisProps = {
  dataKey: "date",
  tickFormatter: shortDate,
  tick: axisTick,
  tickLine: false,
  axisLine: { stroke: "var(--border-strong)" },
  minTickGap: 28,
  interval: "preserveStartEnd" as const,
};

export const yAxisProps = {
  tick: axisTick,
  tickLine: false,
  axisLine: false,
  width: 36,
};

export interface TooltipRow {
  key: string;
  label: string;
  color: string;
  format?: (v: number) => string;
  dashed?: boolean;
}

export function ChartTooltip({
  active,
  payload,
  label,
  rows,
}: {
  active?: boolean;
  payload?: Array<{ payload: Record<string, unknown> }>;
  label?: string | number;
  rows: TooltipRow[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-xl border border-border-strong bg-surface px-3 py-2 text-xs text-text shadow-sm">
      <p className="font-semibold">{typeof label === "string" ? shortDate(label) : label}</p>
      <ul className="mt-1 space-y-0.5">
        {rows.map((r) => {
          const v = point[r.key];
          return (
            <li key={r.key} className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-0.5 w-3 rounded" style={{ background: r.color }} />
              <span className="text-muted">{r.label}</span>
              <span className="ml-auto pl-3 font-medium tabular-nums">
                {typeof v === "number" ? (r.format ? r.format(v) : v) : "–"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Legend({ rows }: { rows: Pick<TooltipRow, "label" | "color" | "dashed">[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-1.5">
          <svg aria-hidden width="16" height="4" className="shrink-0">
            <line
              x1="0"
              y1="2"
              x2="16"
              y2="2"
              stroke={r.color}
              strokeWidth="2.5"
              strokeDasharray={r.dashed ? "4 3" : undefined}
            />
          </svg>
          {r.label}
        </li>
      ))}
    </ul>
  );
}

/** A dated, labelled dashed vertical (the day something changed). */
export function eventLine(date: string, label: string) {
  return (
    <ReferenceLine
      x={date}
      stroke="var(--soft)"
      strokeDasharray="3 4"
      ifOverflow="extendDomain"
      label={{ value: label, position: "insideTopLeft", fill: "var(--soft)", fontSize: 11 }}
    />
  );
}
