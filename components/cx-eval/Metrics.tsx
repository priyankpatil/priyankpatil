"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import metricsJson from "@/lib/cx-eval/metrics.json";
import { axisTick, ChartTooltip, eventLine, gridStroke, Legend, shortDate, xAxisProps, yAxisProps } from "./chart-kit";

// Key metrics under the demo: how good the judge is, how the pipeline runs,
// and what it shows about the support operation. Numbers come from
// pipelines/cx-eval/scripts/export-metrics.mts; every chart is interactive.

type Metrics = typeof metricsJson;
const m = metricsJson as Metrics;

const fmt = (v: number | null | undefined, digits = 1, unit = "") => (v == null ? "–" : `${v.toFixed(digits)}${unit}`);
const n = (v: number) => v.toLocaleString("en-US");
const secs = (ms: number | null) => (ms == null ? "–" : `${(ms / 1000).toFixed(1)} s`);
const shortModel = (id: string) => id.split("/").pop()!.replace("-550b-a55b", "");

// ── Building blocks ─────────────────────────────────────────────────────────

interface Definition {
  /** One sentence: what the number means. */
  what: string;
  /** A small table when the definition is a set of parts (weights, formula, before/after). */
  table?: { head: string[]; rows: (string | number)[][] };
  /** Short bullets for steps or checks. */
  points?: string[];
  basedOn: string;
  caveat?: string;
}

// ⓘ next to a tile label: opens on hover, or on tap/click (phones, keyboard).
// Opens leftwards when there isn't room on the right.
function Info({ label, def }: { label: string; def: Definition }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setAlignRight(rect.left + 368 > window.innerWidth - 16);
    const close = () => {
      setOpen(false);
      setPinned(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => !pinned && setOpen(false)}>
      <button
        type="button"
        aria-label={`How "${label}" is calculated`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          // Tap opens and pins (so it survives the mouse leaving); tapping again closes.
          const next = !(open && pinned);
          setOpen(next);
          setPinned(next);
        }}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-border-strong text-[0.6rem] font-semibold text-soft hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--ring)]"
      >
        i
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`absolute top-6 z-30 block w-[23rem] max-w-[calc(100vw-2rem)] rounded-xl border border-border-strong bg-surface p-4 text-left font-normal shadow-lg ${
            alignRight ? "right-0" : "left-0"
          }`}
        >
          <span className="block text-sm font-semibold text-text">{label}</span>
          <span className="mt-1 block text-[0.8rem] leading-snug text-muted">{def.what}</span>

          {def.table && (
            <span className="mt-3 block overflow-hidden rounded-lg border border-border">
              <table className="w-full text-[0.75rem] leading-snug">
                <thead className="bg-surface-muted text-soft">
                  <tr>
                    {def.table.head.map((h, i) => (
                      <th key={h} className={`px-2 py-1.5 font-medium ${i ? "text-right" : "text-left"}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border)]">
                  {def.table.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td key={j} className={`px-2 py-1.5 align-top ${j ? "text-right tabular-nums text-text" : "text-muted"}`}>
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </span>
          )}

          {def.points && (
            <span className="mt-3 block space-y-1">
              {def.points.map((p) => (
                <span key={p} className="flex gap-2 text-[0.78rem] leading-snug text-muted">
                  <span aria-hidden className="text-soft">•</span>
                  <span>{p}</span>
                </span>
              ))}
            </span>
          )}

          <span className="mt-3 flex gap-2 border-t border-border pt-2.5 text-[0.75rem] leading-snug">
            <span className="shrink-0 font-medium text-text">Based on</span>
            <span className="text-muted">{def.basedOn}</span>
          </span>

          {def.caveat && (
            <span className="mt-2.5 block rounded-lg bg-[color:var(--cx-warn-soft)] px-2.5 py-2 text-[0.75rem] leading-snug text-text">
              {def.caveat}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function Tile({ value, label, caption, def }: { value: ReactNode; label: string; caption?: ReactNode; def?: Definition }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-2xl font-semibold tabular-nums tracking-tight text-text">{value}</p>
      <p className="mt-1 text-sm font-medium text-text">
        {label}
        {def && <Info label={label} def={def} />}
      </p>
      {caption && <p className="mt-1 text-xs leading-relaxed text-muted">{caption}</p>}
    </div>
  );
}

function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-border bg-surface-muted p-1 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3 py-1 font-medium ${value === o.value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Chip({ on, color, onClick, children }: { on: boolean; color: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        on ? "border-border-strong bg-surface text-text" : "border-border bg-transparent text-soft line-through"
      }`}
    >
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: on ? color : "var(--border-strong)" }} />
      {children}
    </button>
  );
}

function Group({ kicker, title, intro, tiles, chart }: { kicker: string; title: string; intro: string; tiles: ReactNode; chart: ReactNode }) {
  return (
    <article className="rounded-[22px] border border-border bg-surface-muted/60 p-5 sm:p-7">
      <p className="kicker mb-2">{kicker}</p>
      <h3 className="text-[clamp(1.2rem,2.2vw,1.5rem)] font-semibold leading-tight tracking-tight text-text">{title}</h3>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{intro}</p>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{tiles}</div>
      <div className="mt-5 rounded-2xl border border-border bg-surface p-4 sm:p-5">{chart}</div>
    </article>
  );
}

function ChartHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-semibold text-text">{title}</p>
      {children}
    </div>
  );
}

// ── Model performance ───────────────────────────────────────────────────────

// Plain names: viewers don't know rubric versions or model ids.
function setupName(model: string, rubric: string): { name: string; color: string } {
  if (rubric !== "v1") return { name: "Stricter rubric", color: "var(--cx-1)" };
  if (model.includes("gpt-oss")) return { name: "Original setup", color: "var(--cx-neutral)" };
  return { name: "Bigger model", color: "var(--cx-2)" };
}
const SETUP_ORDER = ["Original setup", "Stricter rubric", "Bigger model"];

function ModelChart() {
  const setups = m.model.setups
    .map((s, i) => ({ ...s, key: `s${i}`, ...setupName(s.model, s.rubric) }))
    .sort((a, b) => SETUP_ORDER.indexOf(a.name) - SETUP_ORDER.indexOf(b.name));
  const [shown, setShown] = useState<Record<string, boolean>>(Object.fromEntries(setups.map((s) => [s.key, true])));
  const reduce = useReducedMotion();
  const dims = [
    { label: "Intent", field: "intent" },
    { label: "Identity check", field: "identity" },
    { label: "Policy", field: "policy" },
    { label: "Identity failures caught", field: "identityCaught" },
  ] as const;
  const data = dims.map((d) => ({ dim: d.label, ...Object.fromEntries(setups.map((s) => [s.key, s[d.field]])) }));
  const visible = setups.filter((s) => shown[s.key]);

  return (
    <>
      <ChartHead title={`Accuracy against the facts, same ${setups[0]?.n ?? 0} chats for every judge setup`} />
      <div className="mb-3 flex flex-wrap gap-2">
        {setups.map((s) => (
          <Chip key={s.key} on={shown[s.key]} color={s.color} onClick={() => setShown((p) => ({ ...p, [s.key]: !p[s.key] }))}>
            {s.name}
          </Chip>
        ))}
      </div>
      <div className="h-64">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
            <CartesianGrid stroke={gridStroke} vertical={false} />
            <XAxis dataKey="dim" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border-strong)" }} interval={0} />
            <YAxis {...yAxisProps} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <Tooltip
              cursor={{ fill: "var(--surface-muted)" }}
              content={({ active, payload, label }) => (
                <ChartTooltip
                  active={active}
                  payload={payload as never}
                  label={label}
                  rows={visible.map((s) => ({
                    key: s.key,
                    label: `${s.name} (${shortModel(s.model)})`,
                    color: s.color,
                    format: (v) => `${v.toFixed(1)}%`,
                  }))}
                />
              )}
            />
            {visible.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} isAnimationActive={!reduce} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 space-y-1 text-xs leading-relaxed text-muted">
        <li>
          <span className="font-medium text-text">Original setup:</span> {shortModel(setups[0]?.model ?? "")} with the original rubric.{" "}
          <span className="font-medium text-text">Stricter rubric:</span> same model and rules, but the judge must point to where each required button
          appears in the chat before deciding. <span className="font-medium text-text">Bigger model:</span> a larger model with the original rubric.
        </li>
        <li>
          &ldquo;Identity failures caught&rdquo;: of the {setups[0]?.identityTrueFails} chats where the agent really skipped or got wrong a required identity
          check, how many the judge flagged. Click a setup to hide or show it.
        </li>
      </ul>
    </>
  );
}

// ── Pipeline operations ─────────────────────────────────────────────────────

function PipelineChart() {
  const [view, setView] = useState<"volume" | "latency">("volume");
  const reduce = useReducedMotion();
  const data = m.pipeline.daily.map((d) => ({ ...d, passed: (d.loaded ?? 0) - (d.held ?? 0) }));
  const held = m.pipeline.daily.reduce((w, d) => ((d.held ?? 0) > (w.held ?? 0) ? d : w), m.pipeline.daily[0]);
  const switchDate = m.support.modelSwitch?.date;

  return (
    <>
      <ChartHead title={view === "volume" ? "Chats loaded per day" : "Judge response time per day"}>
        <Toggle
          label="Pipeline view"
          value={view}
          onChange={setView}
          options={[
            { value: "volume", label: "Volume" },
            { value: "latency", label: "Response time" },
          ]}
        />
      </ChartHead>
      <div className="h-60">
        <ResponsiveContainer>
          {view === "volume" ? (
            <BarChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} />
              <Tooltip
                cursor={{ fill: "var(--surface-muted)" }}
                content={({ active, payload, label }) => (
                  <ChartTooltip
                    active={active}
                    payload={payload as never}
                    label={label}
                    rows={[
                      { key: "passed", label: "Passed checks", color: "var(--cx-1)" },
                      { key: "held", label: "Held back", color: "var(--cx-bad)" },
                      { key: "scored", label: "Scored by the judge", color: "var(--cx-neutral)" },
                    ]}
                  />
                )}
              />
              <Bar dataKey="passed" stackId="v" fill="var(--cx-1)" isAnimationActive={!reduce} />
              <Bar dataKey="held" stackId="v" fill="var(--cx-bad)" radius={[3, 3, 0, 0]} isAnimationActive={!reduce} />
              {held?.held ? eventLine(held.date, "Upstream field renamed") : null}
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} tickFormatter={(v) => `${v}s`} />
              <Tooltip
                content={({ active, payload, label }) => (
                  <ChartTooltip
                    active={active}
                    payload={payload as never}
                    label={label}
                    rows={[
                      { key: "p50", label: "Median", color: "var(--cx-1)", format: (v) => `${v.toFixed(1)} s` },
                      { key: "p95", label: "Slowest 5%", color: "var(--cx-2)", format: (v) => `${v.toFixed(1)} s` },
                    ]}
                  />
                )}
              />
              <Line dataKey="p50" stroke="var(--cx-1)" strokeWidth={2} dot={false} connectNulls isAnimationActive={!reduce} />
              <Line dataKey="p95" stroke="var(--cx-2)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={!reduce} />
              {switchDate ? eventLine(switchDate, "Judge model changed") : null}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className="mt-3">
        {view === "volume" ? (
          <Legend
            rows={[
              { label: "Passed checks", color: "var(--cx-1)" },
              { label: "Held back by validation", color: "var(--cx-bad)" },
            ]}
          />
        ) : (
          <Legend
            rows={[
              { label: "Median", color: "var(--cx-1)" },
              { label: "Slowest 5%", color: "var(--cx-2)", dashed: true },
            ]}
          />
        )}
      </div>
    </>
  );
}

// ── Support operations ──────────────────────────────────────────────────────

const TEAMS = ["T1", "T2", "T3", "T4"] as const;
const TEAM_COLORS: Record<string, string> = { T1: "var(--cx-neutral)", T2: "var(--cx-1)", T3: "var(--cx-good)", T4: "var(--cx-2)" };

function SupportChart() {
  const [view, setView] = useState<"teams" | "quality">("teams");
  const [shown, setShown] = useState<Record<string, boolean>>({ T1: true, T2: true, T3: true, T4: true });
  const reduce = useReducedMotion();
  const switchDate = m.support.modelSwitch?.date;
  const teamData = m.support.teams.map((t) => ({ ...t, company: m.support.daily.find((d) => d.date === t.date)?.identity ?? null }));
  const routing = "2026-10-14";

  return (
    <>
      <ChartHead title={view === "teams" ? "Identity checks done right, by team" : "Quality score and CSAT per day"}>
        <Toggle
          label="Support view"
          value={view}
          onChange={setView}
          options={[
            { value: "teams", label: "By team" },
            { value: "quality", label: "Quality vs CSAT" },
          ]}
        />
      </ChartHead>
      {view === "teams" && (
        <div className="mb-3 flex flex-wrap gap-2">
          {TEAMS.map((t) => (
            <Chip key={t} on={shown[t]} color={TEAM_COLORS[t]} onClick={() => setShown((p) => ({ ...p, [t]: !p[t] }))}>
              Team {t}
            </Chip>
          ))}
        </div>
      )}
      <div className="h-60">
        <ResponsiveContainer>
          {view === "teams" ? (
            <LineChart data={teamData} margin={{ top: 18, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} domain={[40, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                content={({ active, payload, label }) => (
                  <ChartTooltip
                    active={active}
                    payload={payload as never}
                    label={label}
                    rows={[
                      ...TEAMS.filter((t) => shown[t]).map((t) => ({ key: t, label: `Team ${t}`, color: TEAM_COLORS[t], format: (v: number) => `${v.toFixed(1)}%` })),
                      { key: "company", label: "Company", color: "var(--text)", format: (v: number) => `${v.toFixed(1)}%`, dashed: true },
                    ]}
                  />
                )}
              />
              {TEAMS.filter((t) => shown[t]).map((t) => (
                <Line key={t} dataKey={t} stroke={TEAM_COLORS[t]} strokeWidth={t === "T4" ? 2.5 : 1.5} dot={false} connectNulls isAnimationActive={!reduce} />
              ))}
              <Line dataKey="company" stroke="var(--text)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={!reduce} />
              {eventLine(routing, "Routing change")}
            </LineChart>
          ) : (
            <ComposedChart data={m.support.daily} margin={{ top: 18, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} yAxisId="q" domain={[60, 100]} />
              <YAxis {...yAxisProps} yAxisId="c" orientation="right" domain={[3, 5]} tickFormatter={(v) => v.toFixed(1)} />
              <Tooltip
                content={({ active, payload, label }) => (
                  <ChartTooltip
                    active={active}
                    payload={payload as never}
                    label={label}
                    rows={[
                      { key: "quality", label: "Quality score (0–100)", color: "var(--cx-1)", format: (v) => v.toFixed(1) },
                      { key: "csat", label: "CSAT (1–5)", color: "var(--cx-2)", format: (v) => v.toFixed(2) },
                    ]}
                  />
                )}
              />
              <Line yAxisId="q" dataKey="quality" stroke="var(--cx-1)" strokeWidth={2} dot={false} connectNulls isAnimationActive={!reduce} />
              <Line yAxisId="c" dataKey="csat" stroke="var(--cx-2)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={!reduce} />
              {switchDate ? eventLine(switchDate, "Judge model changed") : null}
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        {view === "teams"
          ? `From ${shortDate(routing)}, team T4 received most of the chats where agents skip identity checks. T4 dropped while the company line barely moved. Click a team to hide or show it.`
          : `The quality score rose when the judge model changed on ${switchDate ? shortDate(switchDate) : "Oct 10"} while CSAT stayed flat, so the change came from the judge, not from customers.`}
      </p>
    </>
  );
}

// ── Section ─────────────────────────────────────────────────────────────────

export default function Metrics() {
  const best = m.model.setups.reduce((b, s) => ((s.identityCaught ?? 0) > (b.identityCaught ?? 0) ? s : b), m.model.setups[0]);
  const base = m.model.setups.find((s) => s.rubric === "v1" && s.model.includes("gpt-oss")) ?? m.model.setups[0];
  const fails = base.identityTrueFails ?? 0;
  const caught = (pct: number | null) => (pct == null ? "–" : `${Math.round((pct / 100) * fails)} of ${fails}`);
  const passed = m.pipeline.loaded - m.pipeline.held;

  return (
    <div className="flex flex-col gap-6">
      <Group
        kicker="Model performance"
        title="How good is the LLM judge?"
        intro="The judge's answers are checked against facts computed from the agent's logged button clicks, on every chat it scores."
        tiles={
          <>
            <Tile
              value={fmt(m.model.agreementPct, 1, "%")}
              label="Agreement with the facts"
              caption={`${n(m.model.verdicts)} checkable verdicts`}
              def={{
                what: "How often the judge's verdict matches the right answer, computed from the agent's logged button clicks.",
                table: {
                  head: ["Dimension", "Right answer from"],
                  rows: [
                    ["Contact reason", "the dataset's label"],
                    ["Identity check", "button order vs. policy"],
                    ["Followed policy", "buttons allowed, in order"],
                  ],
                },
                basedOn: `${n(m.model.verdicts)} verdicts on the 600 chats the daily pipeline scored (20 a day).`,
                caveat: "Resolution and empathy have no computable right answer, so they aren't included.",
              }}
            />
            <Tile
              value={`${fmt(base.identityCaught, 0, "%")} → ${fmt(best.identityCaught, 0, "%")}`}
              label="Identity failures caught"
              caption="after one rubric fix: the judge must point to the exact button before deciding"
              def={{
                what: "Of the chats where the agent really skipped or got wrong a required identity check, the share the judge flagged.",
                table: {
                  head: ["Rubric", "Caught", "Rate"],
                  rows: [
                    ["Original", caught(base.identityCaught), fmt(base.identityCaught, 0, "%")],
                    ["Stricter: cite each button first", caught(best.identityCaught), fmt(best.identityCaught, 0, "%")],
                  ],
                },
                basedOn: `The same ${base.n} chats from the first week, scored with each rubric by the same model.`,
                caveat: `Only ${fails} real failures, so each one moves the rate by about ${Math.round(100 / Math.max(fails, 1))} points.`,
              }}
            />
            <Tile
              value={fmt(m.model.firstTryPct, 1, "%")}
              label="Correct format, first try"
              caption={`Replies that passed the format check without a retry; ${m.model.repaired} more passed after one`}
              def={{
                what: "The share of judge replies that could be stored as they were, without a retry.",
                points: [
                  "Valid JSON, every field present",
                  "Only allowed values: pass, fail or n/a; empathy 1–5",
                  "A failed reply is sent back once with the exact error",
                ],
                basedOn: `${n(m.model.calls)} judge calls, including the comparison runs. ${m.model.failed} got no reply (rate limits, timeouts) and were re-run later.`,
                caveat: "This measures format, not correctness. For correctness, see Agreement with the facts.",
              }}
            />
          </>
        }
        chart={<ModelChart />}
      />

      <Group
        kicker="Pipeline operations"
        title="How the pipeline runs"
        intro="Every day's chats are loaded, checked and scored on a schedule."
        tiles={
          <>
            <Tile
              value={n(m.pipeline.loaded)}
              label="Chats processed"
              caption={`over ${m.pipeline.days} daily batches`}
              def={{
                what: "Every chat the pipeline received and loaded.",
                points: ["One batch per simulated day, about 335 chats each", "Stored untouched before any checks, so a day can be replayed"],
                basedOn: `${m.pipeline.days} daily batches.`,
              }}
            />
            <Tile
              value={fmt(m.pipeline.heldPct, 1, "%")}
              label="Held back by validation"
              caption={`${n(m.pipeline.held)} records, all from one bad batch`}
              def={{
                what: "Records that failed a check and were kept out of scoring and reports.",
                points: [
                  "Eight checks: required fields, valid timestamps, a known contact reason, well-formed turns",
                  "A failed record is kept with the reason, not deleted",
                  "The day can be replayed once the source is fixed",
                ],
                basedOn: `${n(m.pipeline.loaded)} loaded records.`,
                caveat: `All ${n(m.pipeline.held)} came from Oct 18, after the upstream system renamed a field at noon.`,
              }}
            />
            <Tile
              value={secs(m.pipeline.p50Ms)}
              label="Judge response time"
              caption={`median; slowest 5% ${secs(m.pipeline.p95Ms)}`}
              def={{
                what: "How long the LLM takes to return a usable verdict for one chat, including any automatic retries.",
                table: {
                  head: ["Measure", "Time"],
                  rows: [
                    ["Median (half are faster)", secs(m.pipeline.p50Ms)],
                    ["Slowest 5% (p95)", secs(m.pipeline.p95Ms)],
                  ],
                },
                basedOn: "Every successful judge call. The pipeline runs 4 calls at a time.",
                caveat: "The judge runs on a free hosted API, so times depend on its load.",
              }}
            />
            <Tile
              value={n(m.pipeline.tokensPerChat ?? 0)}
              label="Tokens per chat"
              caption="prompt plus answer"
              def={{
                what: "How much text the LLM reads and writes per chat. This is what drives cost on a paid API.",
                points: ["Prompt: rubric, the policy for the contact reason, and the chat", "Reply: verdicts, evidence and the model's reasoning"],
                basedOn: "The average over every successful judge call.",
              }}
            />
          </>
        }
        chart={<PipelineChart />}
      />

      <Group
        kicker="Support operations"
        title="What it shows about the support team"
        intro="The same scores summarised for support managers: chat quality, identity-policy compliance and customer ratings."
        tiles={
          <>
            <Tile
              value={fmt(m.support.quality, 1)}
              label="Quality score"
              caption="0–100, from the rubric"
              def={{
                what: "How well a chat was handled, as one number from 0 to 100. The tile shows the average.",
                table: {
                  head: ["Part", "Weight", "Scored as"],
                  rows: [
                    ["Followed policy", "30%", "pass 100 · fail 0"],
                    ["Resolution", "25%", "resolved 100 · partial 50 · no 0"],
                    ["Identity check", "20%", "pass 100 · fail 0"],
                    ["Empathy", "15%", "1–5 → 0–100"],
                    ["Length", "10%", "1–5 → 0–100"],
                  ],
                },
                points: [
                  "No identity check needed? That part is left out and the others are scaled up",
                  "Length is scored by code (turns vs. a typical chat for that reason); the rest by the LLM judge",
                ],
                basedOn: "The 600 chats the daily pipeline scored (20 a day).",
                caveat: "It depends on the judge: it rose about 5 points when the judge model changed on Oct 10, with no change for customers.",
              }}
            />
            <Tile
              value={fmt(m.support.identityPct, 1, "%")}
              label="Identity checks done right"
              caption="when the policy requires one"
              def={{
                what: "Of the chats whose policy requires verifying the customer, the share where the agent did every required step before changing anything.",
                points: [
                  "Computed in SQL from the agent's logged button clicks",
                  "Compared with the policy for the chat's real contact reason",
                  "No LLM involved",
                ],
                basedOn: `All ${n(passed)} chats that passed validation, not just the judged sample.`,
              }}
            />
            <Tile
              value={fmt(m.support.csat, 2)}
              label="CSAT (simulated)"
              caption={`1–5, ${n(m.support.csatResponses)} survey answers`}
              def={{
                what: "How customers rated their chat, from 1 to 5. The dataset has no surveys, so these answers are generated.",
                table: {
                  head: ["Step", "Effect"],
                  rows: [
                    ["Every answer starts at", "4.3"],
                    ["Identity check failed", "−1.3"],
                    ["Policy not followed", "−0.9"],
                    ["Very long chat (32+ turns)", "−0.6"],
                    ["Random noise", "±1"],
                    ["Then rounded and kept within", "1–5"],
                  ],
                },
                basedOn: `${n(m.support.csatResponses)} generated answers (about 25% of chats get one).`,
                caveat: "It is generated from the ground truth, not from the judge's scores. Its link to compliance comes from the formula, so it is not a finding.",
              }}
            />
          </>
        }
        chart={<SupportChart />}
      />
    </div>
  );
}
