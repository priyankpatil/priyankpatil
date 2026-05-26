"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";

type Org = "amazon" | "clarke" | "mercedes";

const orgOptions: Array<{ key: Org; label: string }> = [
  { key: "amazon", label: "Amazon" },
  { key: "clarke", label: "Clarke" },
  { key: "mercedes", label: "Mercedes" },
];

interface ImpactProfile {
  title: string;
  subtitle: string;
  accent: string;
  outcomes: Array<{ value: string; label: string; color: string }>;
  capabilities: string[];
}

const profileByOrg: Record<Org, ImpactProfile> = {
  amazon: {
    title: "Scaled analytics systems for pharmacy operations",
    subtitle: "Built KPI governance, modernized data platforms, and launched AI-enabled self-serve analytics.",
    accent: "#4ea0ff",
    outcomes: [
      { value: "$1.4M", label: "Annual infra savings", color: "#60a5fa" },
      { value: "40%", label: "Less manual reporting", color: "#22d3ee" },
      { value: "100+", label: "Analytics projects delivered", color: "#34d399" },
      { value: "GenAI", label: "LLM-based solutions built", color: "#f59e0b" },
    ],
    capabilities: ["SQL + PySpark", "AWS Pipelines", "Redshift Migration", "QuickSight", "KPI Governance"],
  },
  clarke: {
    title: "Turned service operations into a product-led engine",
    subtitle: "Delivered mobile workflows and telemetry-driven products that improved speed, cost, and uptime.",
    accent: "#06b6d4",
    outcomes: [
      { value: "60%", label: "Technician efficiency gain", color: "#0ea5e9" },
      { value: "$500k", label: "Annual subscription savings", color: "#22c55e" },
      { value: "30%", label: "Fewer fleet breakdowns", color: "#f59e0b" },
      { value: "$1.5M", label: "Leadership funding secured", color: "#a855f7" },
    ],
    capabilities: ["Product Strategy", "Mobile-First UX", "Telematics APIs", "Customer Stratification", "ROI Analysis"],
  },
  mercedes: {
    title: "Built the execution foundation in enterprise R&D",
    subtitle: "Managed multi-track initiatives from concept to delivery in a high-rigor engineering environment.",
    accent: "#8b5cf6",
    outcomes: [
      { value: "4 yrs", label: "Product analytics foundation", color: "#6366f1" },
      { value: "Multi", label: "Concurrent project delivery", color: "#a855f7" },
      { value: "E2E", label: "Concept-to-completion ownership", color: "#22d3ee" },
      { value: "R&D", label: "Reliability-focused programs", color: "#f97316" },
    ],
    capabilities: ["Program Delivery", "Research Analytics", "Cross-Functional Execution", "Process Discipline", "Quality Focus"],
  },
};

export default function ExperienceSignalChart() {
  const [org, setOrg] = useState<Org>("amazon");
  const current = useMemo(() => profileByOrg[org], [org]);

  return (
    <div
      className="relative overflow-hidden rounded-[28px] border p-4 md:p-6"
      style={{
        borderColor: "var(--border-strong)",
        background: "linear-gradient(155deg, var(--surface) 0%, color-mix(in srgb, var(--surface) 90%, transparent) 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute -top-16 -right-14 h-56 w-56 rounded-full blur-3xl"
        style={{ background: `color-mix(in srgb, ${current.accent} 24%, transparent)` }}
      />

      <div className="relative z-10">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="kicker">Impact Story</p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              {current.title}
            </h3>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--muted)" }}>
              {current.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {orgOptions.map((option) => {
              const active = option.key === org;
              const accent = profileByOrg[option.key].accent;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setOrg(option.key)}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium"
                  style={{
                    borderColor: active ? accent : "var(--border)",
                    background: active ? `color-mix(in srgb, ${accent} 18%, transparent)` : "transparent",
                    color: active ? "var(--text)" : "var(--muted)",
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={org}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="grid gap-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {current.outcomes.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border p-3"
                  style={{
                    borderColor: "var(--border)",
                    background: "color-mix(in srgb, var(--surface) 70%, transparent)",
                  }}
                >
                  <p className="text-2xl font-semibold tracking-tight" style={{ color: item.color }}>
                    {item.value}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.14em]" style={{ color: "var(--soft)" }}>
                    {item.label}
                  </p>
                </div>
              ))}
            </div>

            <div
              className="rounded-2xl border p-3"
              style={{
                borderColor: "var(--border)",
                background: "color-mix(in srgb, var(--surface) 74%, transparent)",
              }}
            >
              <p className="kicker mb-2">Capabilities In Motion</p>
              <div className="flex flex-wrap gap-2">
                {current.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="rounded-full border px-2.5 py-1 text-[0.68rem] uppercase tracking-[0.1em]"
                    style={{
                      borderColor: "var(--border)",
                      color: "var(--soft)",
                      background: "color-mix(in srgb, var(--surface) 78%, transparent)",
                    }}
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
