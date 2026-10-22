import type { DashboardData, Kpi } from "@/lib/cx-eval/data";
import type { AlertRow, DailyPoint, JudgeConfigRow, ModelAccuracy } from "@/lib/cx-eval/queries";
import type { RcaWriteUp } from "@/lib/cx-eval/rca";

// Server-rendered (non-chart) parts of the CX eval dashboard.

const REPO = "https://github.com/priyankpatil/priyankpatil";
export const LINKS = {
  code: `${REPO}/tree/master/pipelines/cx-eval`,
  rubric: `${REPO}/blob/master/pipelines/cx-eval/RUBRIC.md`,
  plan: `${REPO}/blob/master/pipelines/cx-eval/PLAN.md`,
};

export function longDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function SectionHeader({ id, kicker, title, children }: { id: string; kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="max-w-3xl">
      <p className="kicker mb-2">{kicker}</p>
      <h2 id={id} className="text-2xl font-semibold tracking-tight text-text sm:text-[1.75rem]">
        {title}
      </h2>
      {children && <div className="mt-2 text-[0.95rem] leading-relaxed text-muted">{children}</div>}
    </header>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`panel min-w-0 p-5 sm:p-6 ${className}`}>{children}</div>;
}

// ── Hero badge ──────────────────────────────────────────────────────────────

export function SourceBadge({ data }: { data: DashboardData }) {
  const live = data.source === "live";
  const fetched = new Date(data.fetchedAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
  return (
    <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted">
      <span className="inline-flex items-center gap-1.5 font-semibold text-text">
        <span aria-hidden className={`h-2 w-2 rounded-full ${live ? "bg-[var(--cx-good)]" : "bg-[var(--soft)]"}`} />
        {live ? "Live data" : "Snapshot"}
      </span>
      <span>
        {live ? "refreshed hourly · " : "saved "}
        {fetched}
      </span>
      {data.asOf && <span>· batches through {longDate(data.asOf)}</span>}
    </div>
  );
}

// ── KPI tiles ───────────────────────────────────────────────────────────────

const TONE: Record<NonNullable<Kpi["delta"]>["tone"], string> = {
  good: "text-[var(--cx-good)]",
  bad: "text-[var(--cx-bad)]",
  neutral: "text-soft",
};

export function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <dl className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
      {kpis.map((k) => (
        <div key={k.id} className="panel min-w-0 p-5">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-soft">{k.label}</dt>
          <dd className="mt-2">
            <span className="text-3xl font-semibold tracking-tight text-text tabular-nums">{k.value}</span>
            {k.delta && (
              <span className={`mt-1 block text-xs font-medium ${TONE[k.delta.tone]}`}>
                {k.delta.tone === "good" ? "▲ " : k.delta.tone === "bad" ? "▼ " : ""}
                {k.delta.text}
              </span>
            )}
            <p className="mt-2 text-[0.82rem] leading-snug text-muted">{k.caption}</p>
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ── Team before / after ─────────────────────────────────────────────────────

export function TeamSummaryTable({ data }: { data: DashboardData }) {
  const f = (v: number | null, d = 1) => (v == null ? "–" : v.toFixed(d));
  return (
    <table className="w-full text-sm">
      <caption className="mb-2 text-left text-xs text-soft">
        Ground-truth identity compliance and CSAT, before vs from {shortDate(data.routingDate)}
      </caption>
      <thead>
        <tr className="border-b border-border text-left text-xs text-soft">
          <th scope="col" className="py-1.5 font-medium">Team</th>
          <th scope="col" className="py-1.5 text-right font-medium">Identity before</th>
          <th scope="col" className="py-1.5 text-right font-medium">after</th>
          <th scope="col" className="py-1.5 text-right font-medium">CSAT before</th>
          <th scope="col" className="py-1.5 text-right font-medium">after</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {data.teamSummary.map((t) => {
          const drop = t.beforePct != null && t.afterPct != null && t.afterPct - t.beforePct <= -5;
          return (
            <tr key={t.team} className="border-b border-border last:border-0">
              <th scope="row" className="py-1.5 text-left font-semibold text-text">{t.team}</th>
              <td className="py-1.5 text-right text-muted">{f(t.beforePct)}%</td>
              <td className={`py-1.5 text-right ${drop ? "font-semibold text-[var(--cx-bad)]" : "text-muted"}`}>
                {f(t.afterPct)}%{drop && <span className="sr-only"> (drop)</span>}
              </td>
              <td className="py-1.5 text-right text-muted">{f(t.beforeCsat, 2)}</td>
              <td className="py-1.5 text-right text-muted">{f(t.afterCsat, 2)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Judge accuracy by model ─────────────────────────────────────────────────

function Meter({ label, value, note }: { label: string; value: number | null; note?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-semibold tabular-nums text-text">{value == null ? "–" : `${value.toFixed(0)}%`}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-surface-muted" aria-hidden>
        <div className="h-full rounded-full bg-[var(--cx-1)]" style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
      </div>
      {note && <p className="mt-0.5 text-[0.7rem] text-soft">{note}</p>}
    </div>
  );
}

export function ModelAccuracyCards({ models, config }: { models: ModelAccuracy[]; config: JudgeConfigRow[] }) {
  const rows = config.map((c) => ({ config: c, stats: models.find((m) => m.model === c.model) ?? null }));
  // Models scored but missing from judge_config (should not happen) still show.
  for (const m of models) {
    if (!rows.some((r) => r.config.model === m.model)) rows.push({ config: { effectiveFrom: m.firstDate, model: m.model, rubricVersion: "", samplePerDay: 0, note: null }, stats: m });
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map(({ config: c, stats: m }) => (
        <div key={c.model} className="min-w-0 rounded-2xl border border-border bg-surface p-4">
          <p className="break-words font-mono text-[0.8rem] font-semibold text-text">{c.model}</p>
          <p className="mt-0.5 text-xs text-soft">
            Judge from {shortDate(c.effectiveFrom)}
            {m ? ` · ${m.scored} chats scored · p50 ${m.p50LatencyMs == null ? "–" : (m.p50LatencyMs / 1000).toFixed(1)} s` : ""}
          </p>
          {m ? (
            <div className="mt-3 space-y-2.5">
              <Meter label="Intent accuracy" value={m.intentAccuracyPct} />
              <Meter label="Identity accuracy" value={m.identityAccuracyPct} />
              <Meter
                label="Identity failures caught (recall)"
                value={m.identityFailRecallPct}
                note={`${m.identityTrueFails} real failures in sample`}
              />
              <Meter label="Policy accuracy" value={m.policyAccuracyPct} />
              <Meter
                label="Policy failures caught (recall)"
                value={m.policyFailRecallPct}
                note={`${m.policyTrueFails} real failures in sample`}
              />
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">Not scored yet: its batches are still in the judge queue.</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Pipeline health table ───────────────────────────────────────────────────

export function PipelineTable({ daily, highlight }: { daily: DailyPoint[]; highlight: string | null }) {
  return (
    <details className="group mt-4">
      <summary className="cursor-pointer text-sm font-medium text-accent">Show daily table</summary>
      <table className="mt-3 w-full text-xs tabular-nums sm:text-sm">
        <thead>
          <tr className="border-b border-border text-left text-soft">
            <th scope="col" className="py-1.5 font-medium">Batch</th>
            <th scope="col" className="py-1.5 text-right font-medium">Loaded</th>
            <th scope="col" className="py-1.5 text-right font-medium">Quar.</th>
            <th scope="col" className="py-1.5 text-right font-medium">Scored</th>
            <th scope="col" className="py-1.5 text-right font-medium">p50</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((d) => {
            const hot = d.date === highlight;
            return (
              <tr key={d.date} className={`border-b border-border last:border-0 ${hot ? "bg-[var(--cx-bad-soft)] font-semibold text-text" : "text-muted"}`}>
                <th scope="row" className="py-1 pl-1 text-left font-medium">
                  {shortDate(d.date)}
                  {hot && <span className="ml-1 text-[0.65rem] uppercase tracking-wide text-[var(--cx-bad)]">incident</span>}
                </th>
                <td className="py-1 text-right">{d.loaded}</td>
                <td className="py-1 text-right">{d.quarantined || "·"}</td>
                <td className="py-1 text-right">
                  {d.scored}
                  {d.scorePending ? <span className="text-soft">/{d.scored + d.scorePending}</span> : null}
                </td>
                <td className="py-1 pr-1 text-right">{d.p50LatencyMs == null ? "–" : `${(d.p50LatencyMs / 1000).toFixed(1)}s`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-soft">Scored shows done/requested while batches are still in the judge queue. p50 is judge latency per chat.</p>
    </details>
  );
}

// ── Early warnings ──────────────────────────────────────────────────────────

const SEVERITY: Record<AlertRow["severity"], { label: string; icon: string; className: string }> = {
  critical: { label: "Critical", icon: "■", className: "text-[var(--cx-bad)] border-[var(--cx-bad)]" },
  warn: { label: "Warning", icon: "▲", className: "text-[var(--cx-warn)] border-[var(--cx-warn)]" },
  info: { label: "Info", icon: "●", className: "text-soft border-border-strong" },
};

export function AlertsList({ alerts }: { alerts: AlertRow[] }) {
  const open = alerts.filter((a) => a.status === "open");
  if (!open.length) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border-strong p-5">
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">✓</span>
        <div>
          <p className="font-semibold text-text">No open alerts</p>
          <p className="text-sm text-muted">Post-run checks found nothing that needs attention.</p>
        </div>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {open.map((a) => {
        const s = SEVERITY[a.severity] ?? SEVERITY.info;
        return (
          <li key={a.id} className="flex min-w-0 gap-3 rounded-2xl border border-border bg-surface p-3.5">
            <span className={`mt-0.5 h-fit shrink-0 rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide ${s.className}`}>
              <span aria-hidden>{s.icon} </span>
              {s.label}
            </span>
            <div className="min-w-0">
              <p className="text-sm text-text">{a.message}</p>
              <p className="mt-0.5 text-xs text-soft">
                <span className="font-mono">{a.checkName}</span>
                {a.batchDate && ` · batch ${shortDate(a.batchDate)}`}
                {a.externalUrl && (
                  <>
                    {" · "}
                    <a href={a.externalUrl} className="text-accent underline underline-offset-2">
                      issue
                    </a>
                  </>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ── Root cause analyses ─────────────────────────────────────────────────────

const RCA_TYPE: Record<RcaWriteUp["type"], string> = {
  data: "Data-driven",
  model: "Model-driven",
  customer: "Real CX change",
};

export function RcaList({ items }: { items: RcaWriteUp[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {items.map((r) => (
        <article key={r.id} className="panel flex min-w-0 flex-col p-5 sm:p-6" aria-labelledby={`rca-${r.id}`}>
          <p className="text-xs text-soft">
            {longDate(r.date)} ·{" "}
            <span className="rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent">{RCA_TYPE[r.type]}</span>
          </p>
          <h3 id={`rca-${r.id}`} className="mt-2 text-lg font-semibold leading-snug text-text">
            {r.title}
          </h3>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="kicker">Question</dt>
              <dd className="mt-1 text-muted">{r.question}</dd>
            </div>
            <div>
              <dt className="kicker">Finding</dt>
              <dd className="mt-1 text-text">{r.finding}</dd>
            </div>
            <div>
              <dt className="kicker">Evidence</dt>
              <dd className="mt-1">
                <ul className="list-disc space-y-1 pl-4 text-muted">
                  {r.evidence.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </dd>
            </div>
            <div>
              <dt className="kicker">Impact</dt>
              <dd className="mt-1 text-muted">{r.impact}</dd>
            </div>
            <div>
              <dt className="kicker">Action</dt>
              <dd className="mt-1 text-muted">{r.action}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

// ── Pipeline diagram ────────────────────────────────────────────────────────

const STAGES: { name: string; detail: string; where: string }[] = [
  { name: "Load", detail: "Daily batch of raw chats as jsonb", where: "TS script" },
  { name: "Validate", detail: "Schema and field checks; failures to quarantine", where: "SQL" },
  { name: "Transform + enrich", detail: "Turns, metadata, ground-truth flags", where: "SQL" },
  { name: "Assemble", detail: "Sample 20/day, build judge context", where: "SQL" },
  { name: "LLM judge", detail: "Rubric prompt, JSON output, retry", where: "TS script" },
  { name: "Scores", detail: "Append-only, by rubric and model", where: "Postgres" },
  { name: "Marts", detail: "CXI, cohorts, accuracy, drift, health", where: "SQL views" },
];
const OUTPUTS = ["Dashboard", "Alerts", "Retraining export"];

function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`h-4 w-4 shrink-0 text-soft ${className}`}>
      <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PipelineDiagram() {
  return (
    <figure className="panel p-5 sm:p-6">
      <ol className="flex flex-col items-stretch gap-1.5 md:flex-row md:flex-wrap md:items-center md:gap-2" aria-label="Pipeline stages in order">
        {STAGES.map((s, i) => (
          <li key={s.name} className="flex flex-col items-center gap-1.5 md:flex-row md:gap-2">
            <div
              className={`w-full rounded-xl border px-3 py-2 md:w-auto md:max-w-[11.5rem] ${
                s.name === "LLM judge" ? "border-accent bg-accent-soft" : "border-border bg-surface-muted"
              }`}
            >
              <p className="flex items-baseline justify-between gap-2 text-[0.82rem] font-semibold text-text">
                <span>
                  <span className="mr-1 text-soft tabular-nums">{i + 1}</span>
                  {s.name}
                </span>
                <span className="text-[0.62rem] font-medium uppercase tracking-wide text-soft">{s.where}</span>
              </p>
              <p className="mt-0.5 text-[0.72rem] leading-snug text-muted">{s.detail}</p>
            </div>
            <Arrow className="rotate-90 md:rotate-0" />
          </li>
        ))}
        <li className="flex flex-col gap-1.5 md:flex-row md:flex-wrap md:gap-2">
          {OUTPUTS.map((o) => (
            <span key={o} className="rounded-xl border border-dashed border-border-strong px-3 py-2 text-center text-[0.82rem] font-semibold text-text">
              {o}
            </span>
          ))}
        </li>
      </ol>
      <figcaption className="mt-4 text-xs text-soft">
        ELT: scripts only move data in and call the judge; validation, enrichment, ground truth and marts run as SQL inside
        Supabase. Every stage logs a row to pipeline_runs.
      </figcaption>
    </figure>
  );
}
