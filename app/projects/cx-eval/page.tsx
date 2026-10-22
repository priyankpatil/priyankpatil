import type { ReactNode } from "react";
import Navigation from "@/components/Navigation";
import { ModelChart, QuarantineChart, TeamChart } from "@/components/cx-eval/FindingCharts";
import PipelineDemo from "@/components/cx-eval/PipelineDemo";
import Rubric from "@/components/cx-eval/Rubric";
import findingsJson from "@/lib/cx-eval/findings.json";
import type { Findings } from "@/lib/cx-eval/types";

export const metadata = {
  title: "Customer Support Evaluation using an LLM",
  description:
    "A framework for evaluating customer support conversations with an LLM: data pipelines, a rubric-based LLM judge validated against ground truth, and metrics for model accuracy and business processes.",
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
const one = (v: number) => v.toFixed(1);

function SectionHead({ id, kicker, title, children }: { id: string; kicker: string; title: string; children?: ReactNode }) {
  return (
    <header className="max-w-3xl">
      <p className="kicker mb-2">{kicker}</p>
      <h2 id={id} className="text-[clamp(1.6rem,3.2vw,2.2rem)] font-semibold leading-tight tracking-tight text-text">
        {title}
      </h2>
      {children && <p className="mt-3 text-lg leading-relaxed text-muted">{children}</p>}
    </header>
  );
}

const KIND = {
  customer: { label: "A change customers felt", cls: "text-[color:var(--cx-2)]" },
  judge: { label: "A change in the judge", cls: "text-[color:var(--cx-1)]" },
  data: { label: "A change in the data", cls: "text-[color:var(--cx-bad)]" },
} as const;

function Finding({ kind, headline, chart, children, ruledOut }: { kind: keyof typeof KIND; headline: string; chart: ReactNode; children: ReactNode; ruledOut: ReactNode }) {
  const k = KIND[kind];
  return (
    <article className="grid gap-6 rounded-[22px] border border-border bg-surface p-5 sm:p-7 lg:grid-cols-[1fr_1.1fr] lg:gap-10">
      <div className="min-w-0">
        <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${k.cls}`}>{k.label}</p>
        <h3 className="mt-2 text-xl font-semibold leading-snug tracking-tight text-text sm:text-2xl">{headline}</h3>
        <p className="mt-3 text-base leading-relaxed text-muted">{children}</p>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          <span className="font-semibold text-text">Ruled out:</span> {ruledOut}
        </p>
      </div>
      <div className="min-w-0">{chart}</div>
    </article>
  );
}

const FLOW_STEPS: { label: string; body: string; tech: string }[] = [
  { label: "Input", body: "Support chats arrive every day as raw records.", tech: "TypeScript loader" },
  { label: "ETL + synthetic data", body: "Broken records are held back; the rest get the facts the judge is graded against.", tech: "SQL in Postgres" },
  { label: "LLM evaluator + rubric", body: "A written rubric becomes the prompt; an open model gives verdicts with evidence.", tech: "NVIDIA API" },
  { label: "Output", body: "Each answer is format-checked, then stored with its model and rubric version.", tech: "Postgres tables" },
  { label: "ETL", body: "Verdicts are joined back to the facts: which team, which day, was the judge right.", tech: "SQL views" },
  { label: "Metrics", body: "Daily checks raise an alert and point to a cause: customers, the judge or the data.", tech: "Scheduled job · alerts" },
];

export default function CxEvalPage() {
  const t = f.team;
  const m = f.model;
  const mb = m.backtest;
  const qd = f.quarantine;
  const qDay = qd.series.find((d) => d.date === qd.date);
  const rb = f.trust.rubricBacktest;
  const caught = (pct: number | null) => (rb && pct != null ? Math.round((pct / 100) * rb.trueFails) : null);
  const time = (iso: string | null) => (iso ? iso.slice(11, 16) : "–");

  return (
    <>
      <Navigation />
      <main className={`page-pad ${PALETTE}`}>
        <div className="shell flex flex-col gap-24">
          {/* Hero */}
          <section className="max-w-3xl">
            <p className="kicker mb-3">Project · LLM evaluation data pipeline</p>
            <h1 className="heading-lg font-semibold">
              Customer Support Evaluation <span className="text-accent">using an LLM</span>
            </h1>
            <p className="body-lg mt-4">
              A framework for evaluating customer support conversations with an LLM. This project walks through building data pipelines that normalize the
              conversation data, an LLM that scores each conversation against a defined rubric, and validation of the results against ground truth. It also
              provides metrics to measure the model&apos;s accuracy and support business processes.
            </p>
            <dl className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div>
                <dt className="sr-only">Chats graded</dt>
                <dd className="text-3xl font-semibold tabular-nums tracking-tight text-text">{n(f.hero.conversations)}</dd>
                <dd className="mt-1 text-sm text-muted">support chats graded over {f.hero.days} days</dd>
              </div>
              <div>
                <dt className="sr-only">Judge agreement with the facts</dt>
                <dd className="text-3xl font-semibold tabular-nums tracking-tight text-text">{f.hero.checkableAgreementPct}%</dd>
                <dd className="mt-1 text-sm text-muted">of the judge&apos;s checkable verdicts match the facts</dd>
              </div>
              <div>
                <dt className="sr-only">Problems caught</dt>
                <dd className="text-3xl font-semibold tabular-nums tracking-tight text-text">3</dd>
                <dd className="mt-1 text-sm text-muted">problems caught and explained before they misled a report</dd>
              </div>
            </dl>
            <p className="mt-10 rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm leading-relaxed text-muted">
              <strong className="text-text">What&apos;s real and what&apos;s simulated.</strong> The chats are a public research dataset of 10,000 support
              conversations. Dates, teams, ratings and contact-reason labels are made up, and the three problems below were planted on purpose for the pipeline
              to find.
            </p>
          </section>

          {/* Demo */}
          <section aria-labelledby="demo" className="flex flex-col gap-6">
            <SectionHead id="demo" kicker="Interactive demo" title="Follow one conversation through the pipeline">
              Pick a chat and click through the eight stages to see what the pipeline produced at each one. Some stages end with a &ldquo;Try this&rdquo; box.
            </SectionHead>
            <PipelineDemo />
          </section>

          {/* Findings */}
          <section aria-labelledby="findings" className="flex flex-col gap-6">
            <SectionHead id="findings" kicker="Results" title="What the pipeline found">
              Every chat gets a quality score from 0 to 100 (the CX Index), built from the judge&apos;s verdicts. When a number moved, the pipeline traced it to
              one of three causes.
            </SectionHead>

            <Finding
              kind="customer"
              headline={`One team's identity-check rate fell from ${one(t.before.t4)}% to ${one(t.after.t4)}%. The company average barely moved.`}
              chart={<TeamChart data={t} />}
              ruledOut={<>the judge (this rate is counted from the agents&apos; logged button presses, not by the AI) and bad data (volumes and checks were normal).</>}
            >
              From {fmtDate(t.routingDate)}, a routing change sent most chats with a skipped identity check to team T4, so T4 fell while the other teams rose and
              the company average hid it ({one(t.before.company)}% → {one(t.after.company)}%). Customers felt it: T4&apos;s satisfaction rating fell from{" "}
              {t.csat.t4Before} to {t.csat.t4After} out of 5.
            </Finding>

            <Finding
              kind="judge"
              headline={`The quality score jumped from ${one(m.before.cxi)} to ${one(m.after.cxi)} when we switched AI judges. Customers didn't notice.`}
              chart={<ModelChart data={m} />}
              ruledOut={<>a real improvement: customer satisfaction stayed flat ({m.before.csat} → {m.after.csat} out of 5).</>}
            >
              On {fmtDate(m.switchDate)} the judge changed from {short(m.fromModel)} to {short(m.toModel)}.{" "}
              {mb
                ? `Re-scoring the same ${mb.n} chats with both judges gave ${mb.primary.cxi} vs ${mb.secondary.cxi}: same chats, different score, so the judge caused the jump.`
                : "Re-scoring the same chats with both judges is in progress; on identical chats, any difference can only come from the judge."}
            </Finding>

            <Finding
              kind="data"
              headline={`On ${fmtDate(qd.date)}, ${qDay?.quarantined} of ${qDay?.loaded} chats were held back before they could skew any report.`}
              chart={<QuarantineChart data={qd} />}
              ruledOut={
                <>
                  unhappy customers: that day&apos;s dip in satisfaction came from {qd.csatResponses} morning-only survey answers instead of the usual{" "}
                  {qd.typicalCsatResponses}.
                </>
              }
            >
              At {time(qd.firstQuarantinedAt).startsWith("12") ? "noon" : `${time(qd.firstQuarantinedAt)} UTC`} the source system renamed a field (
              <code className="text-[0.85em]">transcript</code> → <code className="text-[0.85em]">messages</code>), so every later chat failed the format
              check and was set aside with the reason. The raw records were kept, so the day can be re-run once the source is fixed; you can try it in stage 2
              of the demo.
            </Finding>
          </section>

          {/* Trust */}
          <section aria-labelledby="trust" className="flex flex-col gap-6">
            <SectionHead id="trust" kicker="Checking the checker" title="Can you trust the judge?" />
            <div className="grid gap-6 rounded-[22px] border border-border bg-surface-muted p-5 sm:p-8 md:grid-cols-[auto_1fr] md:items-center md:gap-10">
              {rb && rb.v1Recall != null && rb.v2Recall != null ? (
                <>
                  <p className="text-[clamp(2.6rem,7vw,4rem)] font-semibold leading-none tabular-nums tracking-tight text-text">
                    {rb.v1Recall.toFixed(0)}% <span className="text-soft">→</span> <span className="text-accent">{rb.v2Recall.toFixed(0)}%</span>
                  </p>
                  <div className="max-w-2xl">
                    <p className="text-lg leading-relaxed text-text">
                      The first judge caught only {caught(rb.v1Recall)} of {rb.trueFails} chats where the agent skipped or got wrong a required identity check. Making it point to the
                      exact buttons before deciding (rubric v2) raised that to {caught(rb.v2Recall)} of {rb.trueFails} on the same chats.
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-muted">
                      The facts come from the agents&apos; logged button presses, so the judge is checked on every chat, not trusted. Overall,{" "}
                      {f.hero.checkableAgreementPct}% of its {n(f.hero.checkableVerdicts)} checkable verdicts match them.
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-base text-muted">The comparison of rubric versions is still being scored.</p>
              )}
            </div>
          </section>

          {/* How it's built */}
          <section aria-labelledby="built" className="flex flex-col gap-6">
            <SectionHead id="built" kicker="How it's built" title="Six steps from chat to metric">
              Scripts only move data and call the model. Every rule lives in SQL, so each one can be read and re-run by hand.
            </SectionHead>
            <ol className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
              {FLOW_STEPS.map((s, i) => (
                <li key={s.label} className="flex flex-col rounded-2xl border border-border bg-surface p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-accent">
                    <span className="text-soft">{i + 1} </span>
                    {s.label}
                  </p>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-text">{s.body}</p>
                  <p className="mt-3 text-xs text-soft">{s.tech}</p>
                </li>
              ))}
            </ol>
            <Rubric />
          </section>
        </div>
      </main>
    </>
  );
}
