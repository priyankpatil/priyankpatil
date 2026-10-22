// Orchestrator: one daily run of the CX evaluation pipeline, in order:
//
//   1. load      extract + land the day's raw batch           (load.mts --process runs
//   2. process   validate → transform → CSAT → assemble        the SQL stages too)
//   3. score     LLM judge on every pending request, so earlier failures are retried
//   4. checks    cx_eval.run_checks() for the day → cx_eval.alerts
//   5. notify    open a GitHub issue per new alert; close issues whose alert resolved
//
//   npx tsx pipelines/cx-eval/scripts/run.mts                 # today's simulated day
//   npx tsx pipelines/cx-eval/scripts/run.mts --day 26
//   npx tsx pipelines/cx-eval/scripts/run.mts --skip-score    # no LLM calls
//
// The simulated source has 30 days; once the calendar passes day 30 the run
// re-delivers day 30 (idempotent), which keeps scoring, checks and the
// Supabase free tier's activity check going.
//
// Notifications need GITHUB_TOKEN and GITHUB_REPOSITORY (set automatically
// in GitHub Actions); without them alerts are only printed.

import { spawnSync } from "node:child_process";
import pg from "pg";
import { dayDate, SIM_DAYS, SIM_START } from "../src/source-sim.ts";

const DASHBOARD_URL = "https://priyankpatil.com/projects/cx-eval";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function todaysDay(): number {
  const elapsed = Math.floor((Date.now() - Date.parse(`${SIM_START}T00:00:00Z`)) / 86_400_000) + 1;
  return Math.min(Math.max(elapsed, 1), SIM_DAYS);
}

const day = arg("day") ? Number(arg("day")) : todaysDay();
const batch = dayDate(day);
const dbUrl = process.env.CXEVAL_DATABASE_URL;
if (!dbUrl) {
  console.error("Set CXEVAL_DATABASE_URL.");
  process.exit(1);
}

function step(name: string, script: string, args: string[]): boolean {
  console.log(`\n▶ ${name}`);
  const started = Date.now();
  const res = spawnSync("npx", ["tsx", `pipelines/cx-eval/scripts/${script}`, ...args], { stdio: "inherit", env: process.env });
  const ok = res.status === 0;
  console.log(`${ok ? "✓" : "✗"} ${name} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
  return ok;
}

interface AlertRow {
  alert_id: string;
  batch_date: string | null;
  check_name: string;
  layer: string;
  severity: string;
  subject: string;
  message: string;
  detail: unknown;
  status: string;
  external_url: string | null;
}

async function github(path: string, init: RequestInit): Promise<{ html_url: string }> {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${init.method} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<{ html_url: string }>;
}

function issueBody(a: AlertRow): string {
  return [
    `**${a.severity.toUpperCase()}** · ${a.layer} layer · batch ${a.batch_date ?? "n/a"}`,
    "",
    a.message,
    "",
    "```json",
    JSON.stringify(a.detail, null, 2),
    "```",
    "",
    `Dashboard: ${DASHBOARD_URL}`,
    "",
    "Where to look first:",
    a.layer === "data"
      ? "- `select * from cx_eval.quarantine where batch_date = '<batch>'` and `cx_eval.pipeline_runs` for the batch."
      : a.layer === "model"
        ? "- `cx_eval.judge_config` (did the model or rubric change?), `cx_eval.mart_judge_accuracy`, `cx_eval.mart_drift`."
        : "- `cx_eval.mart_cohort_daily` for the cohort, then the transcripts in `cx_eval.turns`.",
    "",
    `_Opened by the cx-eval pipeline (alert ${a.alert_id}). It closes automatically when the check clears._`,
  ].join("\n");
}

async function notify(db: pg.Client) {
  const { rows } = await db.query<AlertRow>(
    `SELECT alert_id, batch_date::text, check_name, layer, severity, subject, message, detail, status, external_url
     FROM cx_eval.alerts
     WHERE (status = 'open' AND external_url IS NULL AND severity IN ('warn', 'critical') AND (batch_date = $1 OR batch_date IS NULL))
        OR (status = 'resolved' AND external_url IS NOT NULL AND external_url NOT LIKE '%#closed')`,
    [batch]
  );
  const canNotify = Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY);
  for (const a of rows) {
    const title = `[cx-eval] ${a.severity}: ${a.check_name}${a.subject ? ` ${a.subject}` : ""} (${a.batch_date ?? "now"})`;
    if (!canNotify) {
      console.log(`  ${a.status === "open" ? "would open" : "would close"}: ${title}`);
      continue;
    }
    if (a.status === "open") {
      const issue = await github("/issues", {
        method: "POST",
        body: JSON.stringify({ title, body: issueBody(a), labels: ["cx-eval-alert", `layer:${a.layer}`, `severity:${a.severity}`] }),
      });
      await db.query("UPDATE cx_eval.alerts SET external_url = $2 WHERE alert_id = $1", [a.alert_id, issue.html_url]);
      console.log(`  opened ${issue.html_url}: ${title}`);
    } else {
      const number = a.external_url!.split("/").pop();
      await github(`/issues/${number}/comments`, { method: "POST", body: JSON.stringify({ body: "Check cleared on the latest run; closing." }) });
      await github(`/issues/${number}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "completed" }) });
      await db.query("UPDATE cx_eval.alerts SET external_url = external_url || '#closed' WHERE alert_id = $1", [a.alert_id]);
      console.log(`  closed ${a.external_url}`);
    }
  }
  if (!rows.length) console.log("  no alerts to open or close");
}

console.log(`CX eval daily run: day ${day} (${batch})`);
let failed = false;

failed ||= !step("load + process", "load.mts", ["--day", String(day), "--process"]);
if (!failed && !process.argv.includes("--skip-score")) {
  // Scoring failures are recorded per request and retried next run; they
  // should not block checks, which are what surface them.
  if (!step("score", "score.mts", ["--retry-failed"])) console.log("  scoring reported errors; continuing to checks");
}

const db = new pg.Client({ connectionString: dbUrl });
await db.connect();
try {
  console.log("\n▶ checks");
  const { rows: [checks] } = await db.query("SELECT cx_eval.run_checks($1) AS r", [batch]);
  console.log(`  open alerts for ${batch}: ${checks.r.open_alerts}`);
  console.log("\n▶ notify");
  await notify(db);
} finally {
  await db.end();
}

if (failed) {
  console.error("\nPipeline run failed; see the stage output above and cx_eval.pipeline_runs.");
  process.exit(1);
}
console.log("\nDone.");
