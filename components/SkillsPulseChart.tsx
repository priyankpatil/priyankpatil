"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Lens = "engineering" | "analytics" | "strategy" | "ai";

interface SkillPoint {
  skill: string;
  score: number;
  color: string;
  context: string;
}

const options: Array<{
  key: Lens;
  label: string;
  title: string;
  subtitle: string;
  chips: string[];
  accent: string;
}> = [
  {
    key: "engineering",
    label: "Engineering",
    title: "Data engineering stack",
    subtitle: "Scalable pipelines, data models, and platform migration execution.",
    chips: ["SQL", "Python", "PySpark", "AWS", "Snowflake", "Redshift"],
    accent: "#3b82f6",
  },
  {
    key: "analytics",
    label: "Analytics BI",
    title: "Analytics and BI systems",
    subtitle: "Dashboards, experimentation, and decision-grade reporting surfaces.",
    chips: ["Tableau", "Looker", "Power BI", "QuickSight", "A/B Testing", "Regression"],
    accent: "#06b6d4",
  },
  {
    key: "strategy",
    label: "Strategy",
    title: "Product and operating strategy",
    subtitle: "Cross-functional leadership, KPI framing, and execution prioritization.",
    chips: ["Consulting", "Stakeholder Mgmt", "Agile/Scrum", "Roadmapping", "KPI Design"],
    accent: "#8b5cf6",
  },
  {
    key: "ai",
    label: "AI ML",
    title: "AI-enabled analytics",
    subtitle: "From data quality to self-serve NL-to-SQL decision workflows.",
    chips: ["AI/ML", "Data Integration", "Data Governance", "Self-Serve Analytics", "GenAI SQL"],
    accent: "#f97316",
  },
];

const skillData: Record<Lens, SkillPoint[]> = {
  engineering: [
    { skill: "SQL and Modeling", score: 95, color: "#3b82f6", context: "Data modeling and denormalized serving layers." },
    { skill: "Python and PySpark", score: 92, color: "#0ea5e9", context: "Large-scale ETL and transformation workflows." },
    { skill: "AWS Data Stack", score: 90, color: "#14b8a6", context: "Production pipelines and reporting automation." },
    { skill: "Redshift and Snowflake", score: 91, color: "#22c55e", context: "Warehouse design, migration, and optimization." },
    { skill: "Data Integration", score: 88, color: "#84cc16", context: "Combining multi-source operational datasets." },
  ],
  analytics: [
    { skill: "Dashboard Design", score: 92, color: "#06b6d4", context: "Decision-focused KPI surfaces and drill-downs." },
    { skill: "Looker and QuickSight", score: 91, color: "#14b8a6", context: "Self-serve reporting and WBR/QBR instrumentation." },
    { skill: "Tableau and Power BI", score: 87, color: "#3b82f6", context: "Cross-functional analytics delivery." },
    { skill: "A/B and Metric Design", score: 86, color: "#8b5cf6", context: "Hypothesis-based validation and KPI governance." },
    { skill: "Root-Cause Analytics", score: 93, color: "#f97316", context: "Deep dives that drive operational action." },
  ],
  strategy: [
    { skill: "Business Framing", score: 90, color: "#8b5cf6", context: "Translating ambiguity into measurable outcomes." },
    { skill: "Stakeholder Leadership", score: 94, color: "#6366f1", context: "Product, engineering, and science alignment." },
    { skill: "Operating Rhythm Design", score: 89, color: "#0ea5e9", context: "Standardizing KPI cadences across teams." },
    { skill: "Program Prioritization", score: 88, color: "#f97316", context: "Sequencing initiatives for maximum impact." },
    { skill: "Agile Delivery", score: 86, color: "#22c55e", context: "Shipping iteratively with strong ownership." },
  ],
  ai: [
    { skill: "AI/ML Enablement", score: 86, color: "#f97316", context: "Applied AI in analytics products and workflows." },
    { skill: "NL-to-SQL Workflows", score: 89, color: "#fb7185", context: "GenAI-assisted self-service query experiences." },
    { skill: "Data Quality Controls", score: 92, color: "#f59e0b", context: "Validation and governance across critical metrics." },
    { skill: "Schema and Semantics", score: 90, color: "#a855f7", context: "Clear contracts for reusable analytics assets." },
    { skill: "Adoption Enablement", score: 87, color: "#22c55e", context: "Driving usage beyond pilots into daily operations." },
  ],
};

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
      className="max-w-[220px] rounded-xl border px-3 py-2 text-xs"
      style={{
        borderColor: "var(--border-strong)",
        background: "var(--surface)",
        color: "var(--text)",
      }}
    >
      <p className="font-semibold">{point.skill}</p>
      <p className="mt-1" style={{ color: "var(--muted)" }}>
        {point.context}
      </p>
      <p className="mt-1 text-[0.7rem] uppercase tracking-[0.14em]" style={{ color: "var(--soft)" }}>
        Proficiency {point.score}/100
      </p>
    </div>
  );
}

export default function SkillsPulseChart() {
  const [lens, setLens] = useState<Lens>("engineering");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current = useMemo(() => options.find((item) => item.key === lens)!, [lens]);
  const data = useMemo(() => skillData[lens], [lens]);

  return (
    <div
      className="relative overflow-hidden rounded-[28px] border p-4 md:p-6"
      style={{
        borderColor: "var(--border-strong)",
        background: "linear-gradient(155deg, var(--surface) 0%, color-mix(in srgb, var(--surface) 92%, transparent) 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute -top-14 -right-14 h-52 w-52 rounded-full blur-3xl"
        style={{ background: `color-mix(in srgb, ${current.accent} 26%, transparent)` }}
      />

      <div className="relative z-10">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="kicker">Skills pulse</p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              {current.title}
            </h3>
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              {current.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {options.map((item) => {
              const active = item.key === lens;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setLens(item.key)}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium"
                  style={{
                    borderColor: active ? item.accent : "var(--border)",
                    background: active ? `color-mix(in srgb, ${item.accent} 18%, transparent)` : "transparent",
                    color: active ? "var(--text)" : "var(--muted)",
                    boxShadow: active ? `0 0 0 1px color-mix(in srgb, ${item.accent} 40%, transparent) inset` : "none",
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="h-[236px] w-full md:h-[248px]">
          {mounted ? (
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
                <Bar dataKey="score" radius={[10, 10, 10, 10]} animationDuration={650}>
                  {data.map((entry) => (
                    <Cell key={entry.skill} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full rounded-xl" style={{ background: "var(--surface-muted)" }} />
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {current.chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border px-2.5 py-1 text-[0.68rem] font-medium tracking-[0.08em] uppercase"
              style={{
                borderColor: "var(--border)",
                color: "var(--soft)",
                background: "color-mix(in srgb, var(--surface) 74%, transparent)",
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
