"use client";

import { useReducedMotion } from "framer-motion";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Incident } from "@/lib/cx-eval/data";
import type { DailyPoint, DriftPoint } from "@/lib/cx-eval/queries";
import { ChartTooltip, Legend, SERIES, gridStroke, incidentLines, xAxisProps, yAxisProps } from "./chart-kit";

// Judge = solid primary, ground truth = dashed secondary, everywhere in this
// section, so the pairing reads the same in the pass-rate and drift charts.

const JUDGE = { label: "Judge", color: SERIES.primary };
const TRUTH = { label: "Ground truth", color: SERIES.secondary, dashed: true };

function SmallChart({
  title,
  label,
  data,
  judgeKey,
  truthKey,
  domain,
  format,
  incidents,
  references,
  height = "h-44",
}: {
  title: string;
  label: string;
  data: object[];
  judgeKey: string;
  truthKey: string | null;
  domain: [number | ((v: number) => number), number | ((v: number) => number)];
  format: (v: number) => string;
  incidents: Incident[];
  references?: { y: number; label: string }[];
  height?: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div>
      <h4 className="text-xs font-semibold text-text">{title}</h4>
      <div className={`mt-1 ${height}`} role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 200 }}>
          <LineChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={gridStroke} strokeDasharray="2 6" vertical={false} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} domain={domain} tickFormatter={format} width={40} />
            {incidentLines(incidents)}
            {references?.map((r) => (
              <ReferenceLine
                key={r.label}
                y={r.y}
                stroke="var(--border-strong)"
                strokeDasharray="2 4"
                label={{ value: r.label, position: "insideBottomRight", fill: "var(--soft)", fontSize: 10 }}
              />
            ))}
            <Tooltip
              cursor={{ stroke: "var(--border-strong)" }}
              content={
                <ChartTooltip
                  rows={[
                    { key: judgeKey, ...JUDGE, format },
                    ...(truthKey ? [{ key: truthKey, ...TRUTH, format }] : []),
                  ]}
                />
              }
            />
            {truthKey && (
              <Line
                type="monotone"
                dataKey={truthKey}
                stroke={TRUTH.color}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={!reduceMotion}
              />
            )}
            <Line
              type="monotone"
              dataKey={judgeKey}
              stroke={JUDGE.color}
              strokeWidth={2}
              dot={{ r: 2, fill: JUDGE.color, strokeWidth: 0 }}
              activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={!reduceMotion}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const pct = (v: number) => `${v.toFixed(0)}%`;

export function PassRateCharts({ daily, incidents }: { daily: DailyPoint[]; incidents: Incident[] }) {
  return (
    <div>
      <Legend rows={[JUDGE, TRUTH]} />
      <div className="mt-3 grid gap-6 md:grid-cols-2">
        <SmallChart
          title="Identity verification: pass rate"
          label="Daily identity pass rate according to the judge and to ground truth, on the same scored chats."
          data={daily}
          judgeKey="judgeIdentityPct"
          truthKey="sampleGtIdentityPct"
          domain={[(min: number) => Math.min(50, Math.floor(min / 10) * 10), 100]}
          format={pct}
          incidents={incidents}
        />
        <SmallChart
          title="Policy adherence: pass rate"
          label="Daily policy pass rate according to the judge and to ground truth, on the same scored chats."
          data={daily}
          judgeKey="judgePolicyPct"
          truthKey="sampleGtPolicyPct"
          domain={[(min: number) => Math.min(50, Math.floor(min / 10) * 10), 100]}
          format={pct}
          incidents={incidents}
        />
      </div>
    </div>
  );
}

const DIMENSIONS: { id: string; title: string }[] = [
  { id: "identity_verification", title: "Identity verification" },
  { id: "policy_adherence", title: "Policy adherence" },
  { id: "resolution", title: "Resolution (judge only)" },
  { id: "empathy", title: "Empathy (judge only)" },
];

export function DriftCharts({ drift, dates, incidents }: { drift: DriftPoint[]; dates: string[]; incidents: Incident[] }) {
  const psiFmt = (v: number) => v.toFixed(2);
  return (
    <div>
      <Legend rows={[{ ...JUDGE, label: "Judge PSI" }, { ...TRUTH, label: "Ground-truth PSI" }]} />
      <div className="mt-3 grid gap-6 sm:grid-cols-2">
        {DIMENSIONS.map((dim) => {
          const data = dates.map((date) => {
            const row = drift.find((d) => d.date === date && d.dimension === dim.id);
            return { date, judge: row?.judgePsi ?? null, truth: row?.truthPsi ?? null };
          });
          const hasTruth = data.some((d) => d.truth != null);
          return (
            <SmallChart
              key={dim.id}
              title={dim.title}
              label={`Population stability index for ${dim.title} over time, judge${hasTruth ? " and ground truth" : ""}, against the first week.`}
              data={data}
              judgeKey="judge"
              truthKey={hasTruth ? "truth" : null}
              domain={[0, (max: number) => Math.max(0.3, Math.ceil(max * 10) / 10)]}
              format={psiFmt}
              incidents={incidents}
              references={[
                { y: 0.1, label: "moderate" },
                { y: 0.25, label: "major" },
              ]}
              height="h-40"
            />
          );
        })}
      </div>
    </div>
  );
}
