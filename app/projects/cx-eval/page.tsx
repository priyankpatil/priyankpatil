import Navigation from "@/components/Navigation";
import { DriftCharts, PassRateCharts } from "@/components/cx-eval/JudgeCharts";
import PipelineChart from "@/components/cx-eval/PipelineChart";
import TeamChart from "@/components/cx-eval/TeamChart";
import TrendCharts from "@/components/cx-eval/TrendCharts";
import {
  AlertsList,
  Card,
  KpiGrid,
  LINKS,
  ModelAccuracyCards,
  PipelineDiagram,
  PipelineTable,
  RcaList,
  SectionHeader,
  SourceBadge,
  TeamSummaryTable,
  longDate,
} from "@/components/cx-eval/sections";
import { getDashboardData } from "@/lib/cx-eval/data";
import { rcaWriteUps } from "@/lib/cx-eval/rca";

// ISR: the marts are read at most once an hour.
export const revalidate = 3600;

export const metadata = {
  title: "CX Auto-Evaluation",
  description:
    "A data pipeline that feeds support chats to an LLM judge, stores its scores, and turns them into CX metrics, drift monitoring and root cause analysis.",
};

// Chart colours: light and dark steps of a colour-blind-checked categorical
// palette, plus status colours, scoped to this page so globals stay untouched.
const PALETTE =
  "[--cx-1:#2a78d6] [--cx-2:#eb6834] [--cx-neutral:#8a96ab] [--cx-good:#1a7f37] [--cx-bad:#c62828] [--cx-warn:#a15c00] [--cx-bad-soft:rgba(198,40,40,0.08)] " +
  "dark:[--cx-1:#3987e5] dark:[--cx-2:#d95926] dark:[--cx-neutral:#6b7891] dark:[--cx-good:#3fb950] dark:[--cx-bad:#f07070] dark:[--cx-warn:#e3a33b] dark:[--cx-bad-soft:rgba(240,112,112,0.14)]";

export default async function CxEvalPage() {
  const data = await getDashboardData();
  const dates = data.daily.map((d) => d.date);
  const renameDay = data.daily.find((d) => d.incident === "schema_rename")?.date ?? null;
  const quarantineDay =
    renameDay ?? [...data.daily].filter((d) => d.quarantined > 0).sort((a, b) => b.quarantined - a.quarantined)[0]?.date ?? null;
  const scoringPartial = data.scoredTotal < data.plannedTotal;
  const modelSwitch = data.incidents.find((i) => i.type === "model");

  return (
    <>
      <Navigation />
      <main className={`page-pad ${PALETTE}`}>
        <div className="shell flex flex-col gap-16">
          {/* a. Hero */}
          <section className="max-w-3xl">
            <p className="kicker mb-3">Project · LLM Evaluation Data Pipeline</p>
            <h1 className="heading-lg font-semibold">
              CX <span className="text-accent">Auto-Evaluation</span>
            </h1>
            <p className="body-lg mt-4">
              About 10,000 real support chats from the ABCD dataset arrive as daily batches. A SQL pipeline in Supabase
              validates and enriches them, an LLM judge scores a daily sample against a written rubric, and the scores are
              joined with ground truth and telemetry to monitor customer experience, judge accuracy and drift.
            </p>
            <p className="mt-4 rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm leading-relaxed text-muted">
              <strong className="text-text">What is simulated:</strong> the conversations are real, but dates, agents,
              teams, channels, CSAT scores and logged contact-reason tags are synthetic, added so the pipeline has
              something realistic to monitor. Three incidents were planted on purpose to test detection and root cause
              analysis.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <SourceBadge data={data} />
              {scoringPartial && (
                <span className="text-xs text-soft">
                  Judge progress: {data.scoredTotal} of {data.plannedTotal} sampled chats scored
                  {data.lastScoredDate ? ` (through ${longDate(data.lastScoredDate)})` : ""}.
                </span>
              )}
            </div>
          </section>

          {/* b. KPIs */}
          <section aria-labelledby="kpis" className="flex flex-col gap-5">
            <SectionHeader id="kpis" kicker="Summary" title="Key metrics" />
            <KpiGrid kpis={data.kpis} />
          </section>

          {/* c. Trend */}
          <section aria-labelledby="trend" className="flex flex-col gap-5">
            <SectionHeader id="trend" kicker="Business view" title="CX Index and CSAT over time">
              CXI is the rubric-weighted judge score (policy 30%, resolution 25%, identity 20%, empathy 15%, efficiency 10%).
              Numbered lines mark the planted incidents.
            </SectionHeader>
            <Card>
              <TrendCharts daily={data.daily} incidents={data.incidents} />
            </Card>
          </section>

          {/* d. Cohorts */}
          <section aria-labelledby="cohorts" className="flex flex-col gap-5">
            <SectionHeader id="cohorts" kicker="Cohorts" title="Identity compliance by team">
              From {longDate(data.routingDate)}, chats where the agent skipped identity checks are routed to team T4. Only
              the assignment changes, not the transcripts, so a real CX problem shows up in one cohort while the others hold
              steady. Measured on every conversation from logged agent actions, not the judge.
            </SectionHeader>
            <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
              <Card>
                <TeamChart series={data.teamSeries} teams={data.teamNames} routingDate={data.routingDate} />
              </Card>
              <Card>
                <TeamSummaryTable data={data} />
              </Card>
            </div>
          </section>

          {/* e. Judge health */}
          <section aria-labelledby="judge" className="flex flex-col gap-5">
            <SectionHeader id="judge" kicker="Model telemetry" title="Judge health">
              Ground truth for identity and policy is computed in SQL from the agent&apos;s logged actions, so the
              judge&apos;s accuracy is measured rather than assumed.
              {modelSwitch && ` On ${longDate(modelSwitch.date)} the judge model changes (marker ${modelSwitch.marker}).`}
            </SectionHeader>
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-text">Pass rates: judge vs ground truth (same scored chats)</h3>
              <PassRateCharts daily={data.daily} incidents={data.incidents} />
              <p className="mt-3 text-xs text-soft">
                The judge reads the identity rule by its spirit (customer verified before any change); ground truth applies
                the letter (exact verification step, strict order). That gap is why the judge passes more chats than ground
                truth does.
              </p>
            </Card>
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-text">Accuracy by judge model</h3>
              <ModelAccuracyCards models={data.models} config={data.judgeConfig} />
            </Card>
            <Card>
              <h3 className="text-sm font-semibold text-text">Drift: population stability index vs the first week</h3>
              <p className="mb-3 mt-1 text-xs leading-relaxed text-soft">
                PSI compares each dimension&apos;s score mix over a trailing 3-day window with the first 7 days (0.1 =
                moderate, 0.25 = major). If the judge&apos;s PSI rises while ground truth stays flat, the conversations did
                not change: the model did. If both move, the data changed.
              </p>
              <DriftCharts drift={data.drift} dates={dates} incidents={data.incidents} />
            </Card>
          </section>

          {/* f. Pipeline health */}
          <section aria-labelledby="health" className="flex flex-col gap-5">
            <SectionHeader id="health" kicker="Data telemetry" title="Pipeline health">
              Every batch is validated before transformation; records that fail a check are quarantined with a reason
              instead of silently dropped.
              {renameDay && ` The ${longDate(renameDay)} batch arrived with a renamed upstream field.`}
            </SectionHeader>
            <Card>
              <PipelineChart daily={data.daily} />
              <PipelineTable daily={data.daily} highlight={quarantineDay} />
            </Card>
          </section>

          {/* g. Alerts */}
          <section aria-labelledby="alerts" className="flex flex-col gap-5">
            <SectionHeader id="alerts" kicker="Early warnings" title="Open alerts">
              Post-run checks (for example quarantine rate and cohort compliance) raise alerts so a problem is caught before it
              reaches a weekly report.
            </SectionHeader>
            <AlertsList alerts={data.alerts} />
          </section>

          {/* h. RCA */}
          <section aria-labelledby="rca" className="flex flex-col gap-5">
            <SectionHeader id="rca" kicker="Investigations" title="Root cause analyses">
              Each incident traced to its cause: data, model or a real change in customer experience.
            </SectionHeader>
            <RcaList items={rcaWriteUps} />
          </section>

          {/* i. How it works */}
          <section aria-labelledby="how" className="flex flex-col gap-5">
            <SectionHeader id="how" kicker="Architecture" title="How it works" />
            <PipelineDiagram />
            <div className="flex flex-wrap gap-3">
              <a href={LINKS.rubric} className="pill-link primary">
                Read the rubric
              </a>
              <a href={LINKS.plan} className="pill-link">
                Project plan
              </a>
              <a href={LINKS.code} className="pill-link">
                Code on GitHub
              </a>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
