"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { SkillPoint } from "@/components/SkillsBarChart";

// Recharts is the heaviest dependency on the home page, so the chart itself is
// split into its own chunk and loaded after hydration.
const SkillsBarChart = dynamic(() => import("@/components/SkillsBarChart"), {
  ssr: false,
  loading: () => <div className="h-full w-full rounded-xl bg-surface-muted" />,
});

type Lens = "product" | "engineering" | "analytics" | "ai";

const options: Array<{
  key: Lens;
  label: string;
  title: string;
  subtitle: string;
  chips: string[];
  accent: string;
}> = [
  {
    key: "product",
    label: "Product",
    title: "Product management",
    subtitle: "Customer discovery, roadmaps, and shipping products with engineering and design.",
    chips: ["Product Strategy", "User Research", "Roadmapping", "Agile/Scrum", "Stakeholder Mgmt", "KPI Design"],
    accent: "#8b5cf6",
  },
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
  product: [
    { skill: "Problem Framing", score: 90, color: "#8b5cf6", context: "Turning ambiguous needs into clear product bets and success metrics." },
    { skill: "Stakeholder Leadership", score: 94, color: "#6366f1", context: "Product, engineering, and science alignment." },
    { skill: "Operating Rhythm Design", score: 89, color: "#0ea5e9", context: "Standardizing KPI cadences across teams." },
    { skill: "Roadmap Prioritization", score: 88, color: "#f97316", context: "Sequencing initiatives for maximum impact." },
    { skill: "Agile Delivery", score: 86, color: "#22c55e", context: "Shipping iteratively with engineering, with strong ownership." },
  ],
  ai: [
    { skill: "AI/ML Enablement", score: 86, color: "#f97316", context: "Applied AI in analytics products and workflows." },
    { skill: "NL-to-SQL Workflows", score: 89, color: "#fb7185", context: "GenAI-assisted self-service query experiences." },
    { skill: "Data Quality Controls", score: 92, color: "#f59e0b", context: "Validation and governance across critical metrics." },
    { skill: "Schema and Semantics", score: 90, color: "#a855f7", context: "Clear contracts for reusable analytics assets." },
    { skill: "Adoption Enablement", score: 87, color: "#22c55e", context: "Driving usage beyond pilots into daily operations." },
  ],
};

export default function SkillsPulseChart() {
  const [lens, setLens] = useState<Lens>("product");

  const current = useMemo(() => options.find((item) => item.key === lens)!, [lens]);
  const data = useMemo(() => skillData[lens], [lens]);

  return (
    <div
      className="relative overflow-hidden rounded-[28px] border p-4 md:p-6 border-border-strong bg-[linear-gradient(155deg,var(--surface)_0%,color-mix(in_srgb,var(--surface)_92%,transparent)_100%)]"
    >
      <div
        className="pointer-events-none absolute -top-14 -right-14 h-52 w-52 rounded-full blur-3xl"
        style={{ background: `color-mix(in srgb, ${current.accent} 26%, transparent)` }}
      />

      <div className="relative z-10">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="kicker">Skills pulse</p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight text-text">
              {current.title}
            </h3>
            <p className="mt-2 text-sm text-muted">
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
          <SkillsBarChart data={data} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {current.chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border px-2.5 py-1 text-[0.68rem] font-medium tracking-[0.08em] uppercase border-border bg-[color-mix(in_srgb,var(--surface)_74%,transparent)] text-soft"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
