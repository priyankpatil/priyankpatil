import type { ReactNode } from "react";
import Navigation from "@/components/Navigation";
import { ModelChart, QuarantineChart, TeamChart } from "@/components/cx-eval/FindingCharts";
import PipelineDemo from "@/components/cx-eval/PipelineDemo";
import Rubric from "@/components/cx-eval/Rubric";
import findingsJson from "@/lib/cx-eval/findings.json";
import type { Findings } from "@/lib/cx-eval/types";

export const metadata = {
  title: "CX Auto-Evaluation",
  description:
    "A data pipeline that feeds 10,000 support chats to an LLM judge, checks what it returns, and turns the scores into metrics people can trust.",
};

const f = findingsJson as unknown as Findings;

// Chart and status colours: light and dark steps (validated for colour-blind
// separation), scoped to this page so globals stay untouched.
const PALETTE =
  "[--cx-1:#2a78d6] [--cx-2:#eb6834] [--cx-neutral:#8a96ab] " +
  "[--cx-good:#1a7f37] [--cx-good-soft:rgba(26,127,55,0.08)] [--cx-good-line:rgba(26,127,55,0.3)] " +
  "[--cx-bad:#c62828] [--cx-bad-soft:rgba(198,40,40,0.07)] [--cx-bad-line:rgba(198,40,40,0.3)] " +
  "[--cx-warn:#9a5700] [--cx-warn-soft:rgba(161,92,0,0.08)] [--cx-warn-line:rgba(161,92,0,0.3)] " +
  "dark:[--cx-1:#3987e5] dark:[--cx-2:#d95926] dark:[--cx-neutral:#6b7891] " +
  "dark:[--cx-good:#3fb950] dark:[--cx-good-soft:rgba(63,185,80,0.12)] dark:[--cx-good-line:rgba(63,185,80,0.35)] " +
  "dark:[--cx-bad:#f07070] dark:[--cx-bad-soft:rgba(240,112,112,0.12)] dark:[--cx-bad-line:rgba(240,112,112,0.35)] " +
  "dark:[--cx-warn:#e3a33b] dark:[--cx-warn-soft:rgba(227,163,59,0.12)] dark:[--cx-warn-line:rgba(227,163,59,0.35)]";

const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const short = (m: string) => m.split("/").pop()!.replace("-550b-a55b", "");
const n = (v: number) => v.toLocaleString("en-US");

function SectionHead({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <header className="max-w-3xl">
      <p className="kicker mb-2">{kicker}</p>
      <h2 className="text-[clamp(1.5rem,3vw,2.1rem)] font-semibold leading-tight tracking-tight text-text">{title}</h2>
      {children && <p className="mt-3 text-base leading-relaxed text-muted">{children}</p>}
    </header>
  );
}

const TYPE_STYLE = {
  customer: { label: "Real customer change", cls: "text-[color:var(--cx-2)]" },
  model: { label: "Model-driven", cls: "text-[color:var(--cx-1)]" },
  data: { label: "Data-driven", cls: "text-[color:var(--cx-bad)]" },
} as const;

function Finding({
  n: num,
  type,
  headline,
  children,
  notX,
  chart,
}: {
  n: number;
  type: keyof typeof TYPE_STYLE;
  headline: string;
  children: ReactNode;
  notX: ReactNode;
  chart: ReactNode;
}) {
  const t = TYPE_STYLE[type];
  return (
    <article className="grid gap-6 rounded-[22px] border border-border bg-surface p-5 sm:p-7 lg:grid-cols-[1fr_1.15fr] lg:gap-10">
      <div className="min-w-0">
        <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${t.cls}`}>
          {num} · {t.label}
        </p>
        <h3 className="mt-2 text-xl font-semibold leading-snug tracking-tight text-text">{headline}</h3>
        <div className="mt-3 space-y-3 text-[0.95rem] leading-relaxed text-muted">{children}</div>
        <div className="mt-4 rounded-xl bg-surface-muted px-4 py-3">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-soft">How we knew it wasn&apos;t something else</p>
          <div className="mt-1.5 text-sm leading-relaxed text-muted">{notX}</div>
        </div>
      </div>
      <div className="min-w-0">{chart}</div>
    </article>
  );
}

const FLOW_STEPS: { label: string; title: string; body: string; tech: string }[] = [
  { label: "Input", title: "Support chats arrive daily", body: "A simulated support system delivers ~335 chats a day as JSON, with dates, agents, channels and contact-reason tags added.", tech: "TypeScript loader · raw jsonb landing table" },
  { label: "ETL + synthetic data", title: "Validate, quarantine, enrich", body: "Contract checks quarantine bad records with a reason. SQL extracts actions, attaches policy and computes ground truth.", tech: "SQL functions in Supabase Postgres" },
  { label: "LLM evaluator + rubric", title: "Prompt and judge", body: "A versioned rubric renders the stored context into a prompt; an open-weight model scores five dimensions with evidence.", tech: "NVIDIA-hosted gpt-oss-20b / nemotron · retries, backoff" },
  { label: "Output", title: "Check and store", body: "Strict schema validation with one repair round. Scores land one row per dimension, append-only, versioned by model and rubric.", tech: "judge_results + scores tables" },
  { label: "ETL", title: "Join outputs with inputs", body: "Marts join scores with ground truth, cohorts, CSAT and telemetry: CX Index, judge accuracy, drift, pipeline health.", tech: "SQL views · read-only reporting role" },
  { label: "Metrics", title: "Watch and explain", body: "Post-run checks raise alerts; a freshness watchdog catches a missed run. Each alert ends in a root cause: data, model or customer.", tech: "Daily scheduled workflow · pg_cron watchdog · alerts" },
];

export default function CxEvalPage() {
  const rb = f.trust.rubricBacktest;
  const mb = f.model.backtest;
  const primary = f.trust.production[0];
  const secondary = f.trust.production[1];
  const t = f.team;
  const m = f.model;
  const qd = f.quarantine;
  const qDay = qd.series.find((d) => d.date === qd.date);
  const time = (iso: string | null) => (iso ? iso.slice(11, 16) : "–");

  return (
    <>
      <Navigation />
      <main className={`page-pad ${PALETTE}`}>
        <div className="shell flex flex-col gap-20">
          {/* Hero */}
          <section className="max-w-3xl">
            <p className="kicker mb-3">Project · LLM evaluation data pipeline</p>
            <h1 className="heading-lg font-semibold">
              CX <span className="text-accent">Auto-Evaluation</span>
            </h1>
            <p className="body-lg mt-4">
              I build the pipelines that feed an LLM evaluator and turn what it returns into metrics people can trust. Here is one, end to end: support chats
              in, an LLM judge in the middle, root causes out.
            </p>
            <dl className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div>
                <dt className="sr-only">Chats processed</dt>
                <dd className="text-3xl font-semibold tabular-nums tracking-tight text-text">{n(f.hero.conversations)}</dd>
                <dd className="mt-1 text-sm text-muted">support chats processed over {f.hero.days} daily batches</dd>
              </div>
              <div>
                <dt className="sr-only">Judge agreement with ground truth</dt>
                <dd className="text-3xl font-semibold tabular-nums tracking-tight text-text">{f.hero.checkableAgreementPct}%</dd>
                <dd className="mt-1 text-sm text-muted">
                  of the judge&apos;s {n(f.hero.checkableVerdicts)} verdicts on rules we can check match the ground truth
                </dd>
              </div>
              <div>
                <dt className="sr-only">Incidents caught</dt>
                <dd className="text-3xl font-semibold tabular-nums tracking-tight text-text">3</dd>
                <dd className="mt-1 text-sm text-muted">incidents caught and explained before they misled a report</dd>
              </div>
            </dl>
            <p className="mt-8 rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm leading-relaxed text-muted">
              <strong className="text-text">What&apos;s real and what&apos;s simulated.</strong> The conversations are a public research dataset of 10K
              customer-support chats (ABCD). Dates, agents, teams, channels, CSAT scores and the logged contact-reason tags are synthetic, added so the pipeline
              has something realistic to monitor. The three incidents were planted on purpose, then detected and diagnosed by the pipeline&apos;s own checks.
            </p>
          </section>

          {/* Demo */}
          <section aria-labelledby="demo" className="flex flex-col gap-6">
            <div id="demo">
              <SectionHead kicker="Interactive demo" title="Follow one conversation through the pipeline">
                Pick a chat and watch each stage produce its real artefact: the raw record, the checks, the prompt, the judge&apos;s answer, the stored rows and
                the metric. Then break something.
              </SectionHead>
            </div>
            <PipelineDemo />
          </section>

          {/* Findings */}
          <section aria-labelledby="findings" className="flex flex-col gap-6">
            <div id="findings">
              <SectionHead kicker="What the pipeline caught" title="Three changes, three different causes">
                A metric moving is not a finding. Each of these was flagged by the pipeline&apos;s checks and traced to a cause: a real change for customers, a
                change in the model, or a change in the data.
              </SectionHead>
            </div>

            <Finding
              n={1}
              type="customer"
              headline={`One team's compliance fell from ${t.before.t4}% to ${t.after.t4}%. The company number didn't move.`}
              notX={
                <>
                  Not the judge: compliance here is computed from every chat&apos;s logged actions, not from the LLM. Not the data: volumes and validation were
                  normal. Not T4&apos;s agents: failures were spread across all ten of them, and T4 started receiving more account-change chats. Customers felt
                  it: T4&apos;s CSAT fell from {t.csat.t4Before} to {t.csat.t4After}.
                </>
              }
              chart={<TeamChart data={t} />}
            >
              <p>
                From {fmtDate(t.routingDate)}, chats in which agents skip identity checks were routed to team T4. T4 dropped while the other teams rose from{" "}
                {t.before.others}% to {t.after.others}%, so the company-wide rate barely moved ({t.before.company}% → {t.after.company}%).
              </p>
              <p>A cohort check raised the alert the next day. A top-line dashboard would have shown nothing: the failures moved, they did not disappear.</p>
            </Finding>

            <Finding
              n={2}
              type="model"
              headline={`The judge changed, customers didn't: CXI rose ${(m.after.cxi - m.before.cxi).toFixed(1)} points while CSAT stayed flat.`}
              notX={
                mb ? (
                  <>
                    A backtest re-scored the same {mb.n} chats from {fmtDate(mb.from)}–{fmtDate(mb.to)} with both models: CXI {mb.primary.cxi} with{" "}
                    {short(m.fromModel)} vs {mb.secondary.cxi} with {short(m.toModel)}, on identical inputs. Same chats, different score: the model is the
                    cause.{mb.n < mb.planned ? ` (Backtest in progress: ${mb.n} of ${mb.planned} chats so far.)` : ""}
                  </>
                ) : (
                  <>
                    CSAT, ground-truth compliance and the mix of contact reasons were all flat across the switch, and the switch is a dated row in the judge
                    config. A backtest that re-scores the same first-week chats with both models is in progress; on identical inputs it isolates the model
                    completely.
                  </>
                )
              }
              chart={<ModelChart data={m} />}
            >
              <p>
                On {fmtDate(m.switchDate)} the judge moved from {short(m.fromModel)} to {short(m.toModel)}. Average CXI went from {m.before.cxi} to{" "}
                {m.after.cxi}; CSAT went from {m.before.csat} to {m.after.csat}.
              </p>
              <p>
                The new model is more generous on the judgement-only dimensions (empathy {m.before.empathy} → {m.after.empathy}, resolved {m.before.resolvedPct}%
                → {m.after.resolvedPct}%), and also more accurate on the rules we can check. Both are true; the trend line needed an annotation, not a
                celebration.
              </p>
            </Finding>

            <Finding
              n={3}
              type="data"
              headline={`Bad data never reached the metrics: ${qDay?.quarantined} of ${qDay?.loaded} records were held back on ${fmtDate(qd.date)}.`}
              notX={
                <>
                  Not customers: the last valid record is from {time(qd.lastValidAt)} UTC and the first quarantined one from {time(qd.firstQuarantinedAt)} UTC, a
                  clean cut-over typical of a deploy, and compliance on the valid records was normal. The day&apos;s CSAT dip came from {qd.csatResponses}{" "}
                  survey responses instead of about {qd.typicalCsatResponses}, all from the morning.
                </>
              }
              chart={<QuarantineChart data={qd} />}
            >
              <p>
                At noon the upstream system started sending the conversation text in a field called <code className="text-[0.85em]">messages</code> instead of{" "}
                <code className="text-[0.85em]">transcript</code>. Validation quarantined every record after that moment, each with the reason, and a critical
                alert fired before any transform or scoring ran.
              </p>
              <p>The raw rows are kept, so the day can be replayed once the source is fixed. Try it above with “Upstream renames a field”.</p>
            </Finding>

            {/* Trust strip */}
            <div className="rounded-[22px] border border-border bg-surface-muted p-5 sm:p-7">
              <h3 className="text-lg font-semibold tracking-tight text-text">Can you trust the judge?</h3>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
                Three dimensions have ground truth computed from the agent&apos;s logged actions, so the judge&apos;s accuracy is measured on every scored chat,
                not assumed.
              </p>
              <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Judge accuracy against ground truth by production model</caption>
                    <thead className="text-left text-xs text-soft">
                      <tr>
                        <th className="py-1.5 pr-3 font-normal">Production judge</th>
                        <th className="py-1.5 pr-3 text-right font-normal">Intent</th>
                        <th className="py-1.5 pr-3 text-right font-normal">Identity</th>
                        <th className="py-1.5 text-right font-normal">Policy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[color:var(--border)] tabular-nums text-text">
                      {[primary, secondary].filter(Boolean).map((p) => (
                        <tr key={p.model}>
                          <td className="py-2 pr-3">
                            <span className="font-mono text-xs">{short(p.model)}</span>
                            <span className="block text-xs text-soft">{p.n} chats · rubric {p.rubric}</span>
                          </td>
                          <td className="py-2 pr-3 text-right">{p.intentPct}%</td>
                          <td className="py-2 pr-3 text-right">{p.identityPct}%</td>
                          <td className="py-2 text-right">{p.policyPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-soft">Share of verdicts matching ground truth. Identity counts only chats where a check was required.</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-soft">Fixing a blind spot: rubric v1 → v2</p>
                  {rb ? (
                    <>
                      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-text">
                        {rb.v1Recall?.toFixed(0)}% → {rb.v2Recall?.toFixed(0)}%
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-muted">
                        of real identity failures caught, on the same {rb.n} chats ({rb.trueFails} true failures). The v1 judge applied the identity rule by its
                        spirit and passed wrong-button checks; v2 makes it cite the position of each required button first.
                        {rb.n < rb.planned ? ` Backtest in progress: ${rb.n} of ${rb.planned} chats scored so far.` : ""}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-muted">Backtest in progress.</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* How it's built */}
          <section aria-labelledby="built" className="flex flex-col gap-6">
            <div id="built">
              <SectionHead kicker="How it's built" title="Six steps, mostly SQL">
                ELT: scripts only move data in and call the model. Every rule (validation, enrichment, ground truth, prompt context, metrics) is SQL inside the
                warehouse, so each one can be read and re-run by hand.
              </SectionHead>
            </div>
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FLOW_STEPS.map((s, i) => (
                <li key={s.label} className="relative flex flex-col rounded-2xl border border-border bg-surface p-5">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-accent">
                    {i + 1} · {s.label}
                  </p>
                  <h3 className="mt-1.5 text-base font-semibold text-text">{s.title}</h3>
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">{s.body}</p>
                  <p className="mt-3 font-mono text-[0.7rem] text-soft">{s.tech}</p>
                </li>
              ))}
            </ol>
            <ul className="flex flex-wrap gap-2 text-xs text-muted">
              {[
                "Every stage logs rows in, rows out and errors",
                "Scores are append-only and versioned",
                "Model and rubric changes are dated config rows",
                "Dashboards read through a read-only role",
                "Prompts are reproducible from stored context",
              ].map((x) => (
                <li key={x} className="rounded-full border border-border bg-surface px-3 py-1">
                  {x}
                </li>
              ))}
            </ul>
            <Rubric />
          </section>
        </div>
      </main>
    </>
  );
}
