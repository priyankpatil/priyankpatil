"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";

type ProjectKey = "genai" | "inspection" | "migration" | "stratification";

const projectOptions: Array<{ key: ProjectKey; label: string }> = [
  { key: "genai", label: "GenAI Agent" },
  { key: "inspection", label: "Inspection App" },
  { key: "migration", label: "Migration" },
  { key: "stratification", label: "Stratification" },
];

interface ImpactProfile {
  title: string;
  subtitle: string;
  accent: string;
  signals: Array<{ value: string; label: string; detail: string; color: string }>;
  delivery: string[];
  stack: string[];
}

const impactProfiles: Record<ProjectKey, ImpactProfile> = {
  genai: {
    title: "GenAI Analytics Agent",
    subtitle: "Shifted recurring analytics questions from analyst queue to stakeholder self-serve flow.",
    accent: "#4ea0ff",
    signals: [
      {
        value: "Days → Minutes",
        label: "Insight turnaround",
        detail: "Recurring pharmacy ops questions resolved in-session.",
        color: "#60a5fa",
      },
      {
        value: "NL → SQL",
        label: "Interface delivered",
        detail: "Natural-language prompts converted into query-ready analysis.",
        color: "#22d3ee",
      },
      {
        value: "Self-Serve",
        label: "Decision velocity",
        detail: "Stakeholders run deep dives without waiting for analyst bandwidth.",
        color: "#a78bfa",
      },
    ],
    delivery: [
      "Documented schemas, join keys, and metric semantics.",
      "Created reusable query patterns for operational questions.",
      "Connected outputs to dashboard workflows for fast action.",
    ],
    stack: ["Python", "AWS", "NLP", "SQL", "Analytics UX"],
  },
  inspection: {
    title: "Digital Inspection App",
    subtitle: "Replaced paper workflows with a mobile-first operational product across field teams.",
    accent: "#06b6d4",
    signals: [
      {
        value: "+60%",
        label: "Technician velocity",
        detail: "Faster inspection completion and handoff cycles.",
        color: "#22d3ee",
      },
      {
        value: "Mobile-First",
        label: "Workflow redesign",
        detail: "Inspection tasks moved from paper to guided digital flow.",
        color: "#3b82f6",
      },
      {
        value: "Telemetry",
        label: "Data quality",
        detail: "Higher-fidelity maintenance signals for service planning.",
        color: "#14b8a6",
      },
    ],
    delivery: [
      "Mapped technician journey and removed inspection friction points.",
      "Shipped high-priority features replacing legacy process steps.",
      "Instrumented completion, defects, and handoff metrics for iteration.",
    ],
    stack: ["Product", "Mobile", "Operations", "Data Capture"],
  },
  migration: {
    title: "Snowflake → Redshift Migration",
    subtitle: "Re-platformed analytics infrastructure to reduce cost while improving reliability and ownership.",
    accent: "#f59e0b",
    signals: [
      {
        value: "$1.4M",
        label: "Annual savings",
        detail: "Lower infrastructure run-rate after platform transition.",
        color: "#f59e0b",
      },
      {
        value: "E2E ETL",
        label: "Pipeline transition",
        detail: "Storage, ETL orchestration, and reporting dependencies migrated.",
        color: "#fb923c",
      },
      {
        value: "Higher Uptime",
        label: "Operational reliability",
        detail: "Clearer ownership and reduced platform instability.",
        color: "#84cc16",
      },
    ],
    delivery: [
      "Sequenced migration by dependency and blast-radius.",
      "Rebuilt ETL contracts and reporting compatibility layers.",
      "Validated parity with business and engineering stakeholders.",
    ],
    stack: ["Redshift", "Snowflake", "ETL", "Cost Engineering"],
  },
  stratification: {
    title: "Customer Stratification Model",
    subtitle: "Created a segmentation framework that reshaped sales and service prioritization.",
    accent: "#a855f7",
    signals: [
      {
        value: "20/80",
        label: "Revenue concentration lens",
        detail: "Focused teams on highest-value customer cohorts.",
        color: "#a78bfa",
      },
      {
        value: "Prioritized GTM",
        label: "Commercial clarity",
        detail: "Clear account strategy by loyalty, profitability, and risk.",
        color: "#f472b6",
      },
      {
        value: "Service Focus",
        label: "Operational alignment",
        detail: "Sales and service teams shared one decision model.",
        color: "#38bdf8",
      },
    ],
    delivery: [
      "Modeled customer segments using buying power and cost-to-serve.",
      "Aligned segmentation outputs to sales/service operating playbooks.",
      "Established a repeatable review rhythm for cohort strategy changes.",
    ],
    stack: ["SQL", "Modeling", "Go-to-Market", "Decision Science"],
  },
};

export default function ProjectImpactChart() {
  const [project, setProject] = useState<ProjectKey>("genai");
  const current = useMemo(() => impactProfiles[project], [project]);

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
            <p className="kicker">Impact Map</p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              {current.title}
            </h3>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--muted)" }}>
              {current.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {projectOptions.map((option) => {
              const active = option.key === project;
              const accent = impactProfiles[option.key].accent;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setProject(option.key)}
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
            key={project}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="grid gap-4"
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {current.signals.map((signal) => (
                <div
                  key={signal.label}
                  className="rounded-2xl border p-3"
                  style={{
                    borderColor: "var(--border)",
                    background: "color-mix(in srgb, var(--surface) 72%, transparent)",
                  }}
                >
                  <p className="text-xl font-semibold tracking-tight" style={{ color: signal.color }}>
                    {signal.value}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.14em]" style={{ color: "var(--soft)" }}>
                    {signal.label}
                  </p>
                  <p className="mt-2 text-xs leading-5" style={{ color: "var(--muted)" }}>
                    {signal.detail}
                  </p>
                </div>
              ))}
            </div>

            <div
              className="rounded-2xl border p-3"
              style={{
                borderColor: "var(--border)",
                background: "color-mix(in srgb, var(--surface) 76%, transparent)",
              }}
            >
              <p className="kicker mb-2">How It Shipped</p>
              <div className="grid gap-2">
                {current.delivery.map((line, index) => (
                  <div key={line} className="flex items-start gap-2">
                    <span
                      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.62rem] font-semibold"
                      style={{
                        color: "var(--text)",
                        border: "1px solid var(--border)",
                        background: "color-mix(in srgb, var(--surface) 68%, transparent)",
                      }}
                    >
                      {index + 1}
                    </span>
                    <p className="text-xs leading-5" style={{ color: "var(--muted)" }}>
                      {line}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {current.stack.map((tech) => (
                  <span
                    key={tech}
                    className="rounded-full border px-2.5 py-1 text-[0.68rem] uppercase tracking-[0.1em]"
                    style={{
                      borderColor: "var(--border)",
                      color: "var(--soft)",
                      background: "color-mix(in srgb, var(--surface) 78%, transparent)",
                    }}
                  >
                    {tech}
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
