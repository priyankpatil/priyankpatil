"use client";

import { useState, type ReactNode } from "react";
import type { JudgeContext, JudgeOutput } from "@/pipelines/cx-eval/src/contract.ts";
import { FLOWS } from "@/pipelines/cx-eval/src/contract.ts";
import type { ParseResult } from "@/pipelines/cx-eval/src/judge/parse.ts";
import { RUBRIC_V1 } from "@/pipelines/cx-eval/src/rubric/v1.ts";
import { cxiBreakdown, estimateTokens, shortModel } from "@/lib/cx-eval/demo";
import { explainIdentity, explainPolicy } from "@/lib/cx-eval/ground-truth";
import type { DemoChat, RawRecord, RubricId, StoredRun } from "@/lib/cx-eval/types";
import type { CheckResult } from "@/lib/cx-eval/validate";
import { Badge, Code, Collapsible, Fact, Mark, verdictTone } from "./ui";

// ── View model ──────────────────────────────────────────────────────────────

export interface JudgeView {
  /** stored: a row in cx_eval.scores · alt: precomputed what-if run · live: just now */
  source: "stored" | "alt" | "live";
  role?: StoredRun["role"];
  model: string;
  rubric: RubricId;
  status: "ok" | "invalid" | "error";
  output?: JudgeOutput;
  rawContent: string;
  error?: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  repaired: boolean;
  attempts?: number;
  judgedAt?: string;
  resultId?: number;
  promptHash?: string;
  scoreRows?: StoredRun["scoreRows"];
}

export interface RunView {
  chat: DemoChat;
  record: RawRecord;
  renamed: boolean;
  useAlt: boolean;
  validation: { checks: CheckResult[]; quarantined: boolean };
  context: JudgeContext;
  prompt: { system: string; user: string };
  /** v1 prompt with the logged reason: lines that differ from it are highlighted. */
  baseline: { system: string; user: string };
  rubric: RubricId;
  model: string;
  judge: JudgeView | null;
  /** Why there is no judge result to show. */
  missing?: string;
  parse: ParseResult | null;
}

export type StageKey = "ingest" | "validate" | "enrich" | "prompt" | "judge" | "check" | "store" | "metrics";

export const STAGES: { key: StageKey; name: string; group: string; does: string; where: string }[] = [
  { key: "ingest", name: "Ingest", group: "Input", does: "The record exactly as the support system delivers it.", where: "Loader script → raw_conversations (jsonb, no logic)" },
  { key: "validate", name: "Validate", group: "ETL + synthetic data", does: "Contract checks. Failing an error check quarantines the record, with the reason.", where: "SQL · cx_eval.validate_batch()" },
  { key: "enrich", name: "Enrich", group: "ETL + synthetic data", does: "Actions extracted, policy attached, ground truth computed. The judge never sees the ground truth.", where: "SQL · cx_eval.transform_batch()" },
  { key: "prompt", name: "Rubric + prompt", group: "LLM evaluator + rubric", does: "The stored context is rendered into a prompt by the versioned rubric.", where: "SQL assembles context · rubric renders prompt" },
  { key: "judge", name: "LLM judge", group: "LLM evaluator + rubric", does: "An open-weight model scores five dimensions and quotes its evidence.", where: "NVIDIA API · temperature 0 · retries with backoff" },
  { key: "check", name: "Validate output", group: "Output", does: "Strict schema check. A bad reply gets one repair round, then is stored as invalid.", where: "Pipeline parser (parse.ts)" },
  { key: "store", name: "Store", group: "Output", does: "One row per dimension. Append-only and versioned by model and rubric.", where: "cx_eval.judge_results + cx_eval.scores" },
  { key: "metrics", name: "Metrics", group: "ETL → metrics", does: "Scores joined with ground truth: this chat's CX Index and whether the judge was right.", where: "SQL view · mart_conversation_scores" },
];

const SYNTHETIC: Record<string, string> = {
  started_at: "synthetic date",
  channel: "synthetic",
  agent_id: "synthetic",
  logged_reason: "synthetic tag, wrong ~8% of the time",
};

const ORDER = ["conversation_id", "started_at", "channel", "agent_id", "logged_reason", "customer", "transcript", "messages"];

function H({ children }: { children: ReactNode }) {
  return <h4 className="mb-2 mt-5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-soft first:mt-0">{children}</h4>;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-xs leading-relaxed text-soft">{children}</p>;
}

function Banner({ tone, children }: { tone: "good" | "bad" | "warn" | "neutral"; children: ReactNode }) {
  const cls = {
    good: "border-[color:var(--cx-good-line)] bg-[color:var(--cx-good-soft)]",
    bad: "border-[color:var(--cx-bad-line)] bg-[color:var(--cx-bad-soft)]",
    warn: "border-[color:var(--cx-warn-line)] bg-[color:var(--cx-warn-soft)]",
    neutral: "border-border bg-surface-muted",
  }[tone];
  return <div className={`rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed text-text ${cls}`}>{children}</div>;
}

// ── 1 Ingest ────────────────────────────────────────────────────────────────

const str = (v: unknown) => <span className="text-[#ce9178]">{JSON.stringify(v)}</span>;
const key = (k: string, bad = false) => <span className={bad ? "text-[#f48771] underline decoration-wavy" : "text-[#9cdcfe]"}>&quot;{k}&quot;</span>;

function TurnJson({ turn }: { turn: { speaker: string; text: string; button?: string } }) {
  return (
    <>
      {"    { "}
      {key("speaker")}: {str(turn.speaker)}, {key("text")}: {str(turn.text)}
      {turn.button ? (
        <>
          , {key("button")}: {str(turn.button)}
        </>
      ) : null}
      {" }"}
    </>
  );
}

function RecordJson({ record, renamed }: { record: RawRecord; renamed: boolean }) {
  const [all, setAll] = useState(false);
  const keys = [...ORDER.filter((k) => k in record), ...Object.keys(record).filter((k) => !ORDER.includes(k))];
  return (
    <Code label="Raw record JSON">
      {"{\n"}
      {keys.map((k, i) => {
        const v = record[k];
        const comma = i < keys.length - 1 ? "," : "";
        if (Array.isArray(v)) {
          const turns = v as { speaker: string; text: string; button?: string }[];
          const shown = all ? turns : turns.slice(0, 4);
          return (
            <span key={k}>
              {"  "}
              {key(k, renamed && k === "messages")}: [{renamed && k === "messages" && <span className="text-[#f48771]">{"   ← renamed upstream (was \"transcript\")"}</span>}
              {"\n"}
              {shown.map((t, j) => (
                <span key={j}>
                  <TurnJson turn={t} />
                  {j < turns.length - 1 ? "," : ""}
                  {"\n"}
                </span>
              ))}
              {!all && turns.length > 4 && (
                <>
                  {"    "}
                  <button type="button" onClick={() => setAll(true)} className="rounded border border-[#3e3e3e] px-1.5 text-[#858585] hover:text-[#d4d4d4]">
                    … {turns.length - 4} more turns
                  </button>
                  {"\n"}
                </>
              )}
              {"  ]"}
              {comma}
              {"\n"}
            </span>
          );
        }
        const synthetic = SYNTHETIC[k];
        return (
          <span key={k} className={synthetic ? "-mx-1 rounded bg-[#3a2f12] px-1" : undefined}>
            {"  "}
            {key(k)}: {typeof v === "object" && v !== null ? <span className="text-[#d4d4d4]">{JSON.stringify(v).replace(/"([^"]+)":/g, "\"$1\": ")}</span> : str(v)}
            {comma}
            {synthetic && <span className="text-[#e5c07b]">{`   ← ${synthetic}`}</span>}
            {"\n"}
          </span>
        );
      })}
      {"}"}
    </Code>
  );
}

function ChatBubbles({ turns }: { turns: JudgeContext["turns"] }) {
  return (
    <ol className="flex max-h-[26rem] flex-col gap-1.5 overflow-auto rounded-xl border border-border bg-surface-muted p-3" tabIndex={0} aria-label="Transcript">
      {turns.map((t, i) =>
        t.speaker === "action" ? (
          <li key={i} className="flex items-center gap-2 self-center py-0.5 text-[0.7rem] text-soft">
            <Badge tone="accent" mono>
              {t.button}
            </Badge>
            <span className="truncate">{t.text}</span>
          </li>
        ) : (
          <li
            key={i}
            className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-[0.8rem] leading-snug ${
              t.speaker === "agent" ? "self-start bg-surface text-text" : "self-end bg-accent text-white"
            }`}
          >
            <span className="sr-only">{t.speaker}: </span>
            {t.text}
          </li>
        )
      )}
    </ol>
  );
}

function IngestStage({ run }: { run: RunView }) {
  const [view, setView] = useState<"json" | "chat">("json");
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-soft">
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#3a2f12] align-middle ring-1 ring-[#e5c07b]" aria-hidden /> synthetic fields added by
          the simulated source system. The transcript is the original public chat.
        </p>
        <div className="flex gap-1 text-xs" role="tablist" aria-label="Record view">
          {(["json", "chat"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`rounded-full px-2.5 py-1 ${view === v ? "bg-accent-soft text-accent" : "text-muted hover:text-text"}`}
            >
              {v === "json" ? "Raw JSON" : "Read the chat"}
            </button>
          ))}
        </div>
      </div>
      {view === "json" ? <RecordJson record={run.record} renamed={run.renamed} /> : <ChatBubbles turns={run.context.turns} />}
      <Note>Landed as-is in cx_eval.raw_conversations. The loader moves data only; every rule after this point is SQL in the warehouse.</Note>
    </div>
  );
}

// ── 2 Validate ──────────────────────────────────────────────────────────────

function ValidateStage({ run }: { run: RunView }) {
  const { checks, quarantined } = run.validation;
  const failed = checks.filter((c) => !c.passed && c.severity === "error");
  return (
    <div>
      <ul className="divide-y divide-[color:var(--border)] rounded-xl border border-border">
        {checks.map((c) => (
          <li key={c.name} className="flex items-start gap-2.5 px-3 py-2 text-sm">
            <Mark ok={c.passed} warn={c.severity === "warn"} label={`${c.name}: ${c.passed ? "passed" : c.severity === "warn" ? "warning" : "failed"}`} />
            <div className="min-w-0 flex-1">
              <span className="text-text">{c.rule}</span>
              {c.detail && <span className="ml-2 font-mono text-xs text-[color:var(--cx-bad)]">{c.detail}</span>}
            </div>
            <span className="hidden font-mono text-[0.68rem] text-soft sm:inline">
              {c.name}
              {c.severity === "warn" ? " · warn" : ""}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        {quarantined ? (
          <Banner tone="bad">
            <strong>Quarantined.</strong> {failed.map((c) => `${c.name} (${c.detail})`).join("; ")}. The record is written to cx_eval.quarantine with
            the reason and stops here: nothing downstream sees it, so no metric is computed from a broken record. On Oct 18 this happened to 230 real
            records after an upstream deploy renamed the field; the raw rows were kept, so the day can be replayed once the source is fixed.
          </Banner>
        ) : (
          <Banner tone="good">
            <strong>Valid.</strong> All error checks pass{checks.some((c) => !c.passed) ? " (warnings are recorded, not blocking)" : ""}; the record moves on to
            transformation.
          </Banner>
        )}
      </div>
      <Note>These checks run as SQL inside the warehouse. This page runs a TypeScript mirror of the same rules in your browser, so you can break the record and watch.</Note>
    </div>
  );
}

// ── 3 Enrich ────────────────────────────────────────────────────────────────

function StepChips({ actions, steps }: { actions: string[]; steps: string[] }) {
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label="Agent actions in order">
      {actions.map((a, i) => {
        const allowed = steps.includes(a) || a === "search-faq" || a === "select-faq" || (steps.length === 0 && a.startsWith("search-"));
        return (
          <li key={i}>
            <Badge tone={allowed ? "neutral" : "bad"} mono>
              <span className="text-soft">{i + 1}</span> {a}
            </Badge>
          </li>
        );
      })}
    </ol>
  );
}

function PolicyChips({ steps, done }: { steps: string[]; done: string[] }) {
  if (!steps.length) return <span className="text-sm text-muted">none: FAQ intent (search the FAQ; no account access)</span>;
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label="Policy steps">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden className="text-soft">→</span>}
          <Badge tone={done.includes(s) ? "good" : "neutral"} mono>
            {s}
          </Badge>
        </li>
      ))}
    </ol>
  );
}

function EnrichStage({ run }: { run: RunView }) {
  const e = run.chat.enrich;
  const logged = run.context.contactReason;
  const tagRight = logged === e.trueSubflow;
  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Fact label="Turns">
          {e.nTurns} <span className="text-xs text-soft">({e.nCustomerTurns} customer · {e.nAgentTurns} agent · {e.nActions} actions)</span>
        </Fact>
        <Fact label="Team (from agent)">
          {e.teamId} <span className="text-xs text-soft">synthetic</span>
        </Fact>
        <Fact label="Logged reason">
          <span className="font-mono text-xs">{logged}</span>
        </Fact>
        <Fact label="True reason">
          <span className="font-mono text-xs">{e.trueSubflow}</span> <Mark ok={tagRight} label={tagRight ? "tag correct" : "tag wrong"} />
        </Fact>
      </dl>

      <H>Actions the agent took (button ids from the log)</H>
      <StepChips actions={e.actions} steps={e.truePolicySteps} />

      <H>Policy for the true intent ({e.trueSubflow})</H>
      <PolicyChips steps={e.truePolicySteps} done={e.actions} />

      {run.useAlt || !tagRight ? (
        <div className="mt-3">
          <Banner tone="warn">
            The prompt follows the <em>logged</em> reason, <span className="font-mono text-xs">{logged}</span>
            {run.context.policySteps.length ? (
              <>
                , whose policy is <span className="font-mono text-xs">{run.context.policySteps.join(" → ")}</span>.
              </>
            ) : (
              ": an FAQ intent with no policy steps."
            )}{" "}
            Ground truth still uses the true reason. A wrong tag is a realistic upstream data-quality problem the judge has to see through.
          </Banner>
        </div>
      ) : null}

      <H>Ground truth (computed in SQL from the logged actions)</H>
      <ul className="space-y-2 text-sm">
        <li className="flex gap-2">
          <Badge tone={verdictTone(e.gtIdentity)}>identity {e.gtIdentity}</Badge>
          <span className="text-muted">{explainIdentity(e.actions, e.truePolicySteps)}</span>
        </li>
        <li className="flex gap-2">
          <Badge tone={verdictTone(e.gtPolicy)}>policy {e.gtPolicy}</Badge>
          <span className="text-muted">{explainPolicy(e.actions, e.truePolicySteps, e.isFaq)}</span>
        </li>
        <li className="flex gap-2">
          <Badge tone={e.efficiency >= 4 ? "good" : e.efficiency >= 3 ? "warn" : "bad"}>efficiency {e.efficiency}/5</Badge>
          <span className="text-muted">
            {e.nTurns} turns against a median of {e.medianTurns} for this intent ({(e.nTurns / e.medianTurns).toFixed(2)}×). Scored in code, not by the LLM.
          </span>
        </li>
        <li className="flex gap-2">
          <Badge tone="neutral">CSAT {e.csat ?? "–"}</Badge>
          <span className="text-muted">{e.csat ? "Synthetic post-chat survey (about 1 in 4 customers answer)." : "This customer did not answer the (synthetic) survey."}</span>
        </li>
      </ul>
      <Note>Ground truth and CSAT are kept out of the prompt: they are what the judge is measured against.</Note>
    </div>
  );
}

// ── 4 Rubric + prompt ───────────────────────────────────────────────────────

function DiffLines({ text, baseline }: { text: string; baseline: string }) {
  const base = new Set(baseline.split("\n"));
  return (
    <>
      {text.split("\n").map((line, i) => {
        const changed = !base.has(line) && line.trim() !== "";
        return (
          <span key={i} className={changed ? "-mx-1 block rounded bg-[#1f3a24] px-1 text-[#b5e8b0]" : "block"}>
            {line || " "}
          </span>
        );
      })}
    </>
  );
}

function PromptStage({ run }: { run: RunView }) {
  const [rubricText, contextText = ""] = run.prompt.system.split("\n\nThis chat:\n");
  const [baseRubric, baseContext = ""] = run.baseline.system.split("\n\nThis chat:\n");
  const tokens = estimateTokens(run.prompt.system + run.prompt.user);
  const llm = RUBRIC_V1.dimensions.filter((d) => d.scoredBy === "llm");
  const rubricChanged = rubricText !== baseRubric;
  return (
    <div>
      <H>Rubric {run.rubric}: five judged dimensions</H>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {llm.map((d) => (
          <li key={d.id} className="rounded-lg border border-border px-3 py-2 text-sm">
            <span className="font-medium text-text">{d.name}</span>
            <span className="block text-xs text-soft">
              {d.question} · {d.id === "intent" ? "one of 10 flows" : d.values.join(" / ")}
            </span>
          </li>
        ))}
        <li className="rounded-lg border border-dashed border-border px-3 py-2 text-sm">
          <span className="font-medium text-text">Efficiency</span>
          <span className="block text-xs text-soft">Computed in code from turn counts, never asked of the LLM.</span>
        </li>
      </ul>
      {run.rubric === "v2" && (
        <Note>
          v2 keeps every v1 rule and adds a procedure: the judge must locate each required button and cite its position before giving an identity or
          policy verdict. The added lines are highlighted below.
        </Note>
      )}

      <H>The assembled prompt · about {tokens.toLocaleString("en-US")} tokens</H>
      <div className="space-y-2">
        <Collapsible defaultOpen={rubricChanged} summary={<span>System: rubric ({rubricText.split("\n").length} lines, identical for every chat, so providers can cache it)</span>}>
          <Code label="Rubric part of the system prompt">
            <DiffLines text={rubricText} baseline={baseRubric} />
          </Code>
        </Collapsible>
        <Collapsible defaultOpen summary={<span>System: context for this chat</span>}>
          <Code label="Context part of the system prompt">
            <DiffLines text={`This chat:\n${contextText}`} baseline={`This chat:\n${baseContext}`} />
          </Code>
        </Collapsible>
        <Collapsible summary={<span>User: the transcript ({run.context.turns.length} lines; actions carry their button id)</span>}>
          <Code label="Transcript sent to the judge">{run.prompt.user}</Code>
        </Collapsible>
      </div>
      <Note>
        Built in your browser by the pipeline&apos;s own rubric code from the context stored in cx_eval.scoring_requests, so every prompt is reproducible.
        {run.useAlt || rubricChanged ? " Highlighted lines differ from the production prompt." : ""}
      </Note>
    </div>
  );
}

// ── 5 LLM judge ─────────────────────────────────────────────────────────────

const DIM_LABEL: Record<string, string> = {
  intent: "Intent",
  identity_verification: "Identity verification",
  policy_adherence: "Policy adherence",
  resolution: "Resolution",
  empathy: "Empathy",
};

function sourceLabel(j: JudgeView): string {
  if (j.source === "live") return "Live run, just now";
  if (j.source === "alt") return "What-if run, precomputed for this page (not in the warehouse)";
  return j.role === "production" ? "Production score, replayed from the warehouse" : "Backtest score, replayed from the warehouse";
}

export function NoJudge({ run, onLive }: { run: RunView; onLive?: () => void }) {
  return (
    <Banner tone="neutral">
      {run.missing}
      {onLive && (
        <>
          {" "}
          <button type="button" onClick={onLive} className="font-medium text-accent underline underline-offset-4">
            Run it live
          </button>
        </>
      )}
    </Banner>
  );
}

function JudgeStage({ run, onLive }: { run: RunView; onLive?: () => void }) {
  const j = run.judge;
  const [raw, setRaw] = useState(false);
  if (!j) return <NoJudge run={run} onLive={onLive} />;
  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Fact label="Model">
          <span className="font-mono text-xs">{j.model}</span>
        </Fact>
        <Fact label="Source">{sourceLabel(j)}</Fact>
        <Fact label="Latency">{(j.latencyMs / 1000).toFixed(1)} s</Fact>
        <Fact label="Tokens">
          {j.promptTokens.toLocaleString("en-US")} in · {j.completionTokens.toLocaleString("en-US")} out
        </Fact>
      </dl>
      <div className="mt-4 flex items-center justify-between">
        <H>{j.output ? "Verdicts and evidence" : "Reply"}</H>
        {j.output && (
          <button type="button" onClick={() => setRaw((r) => !r)} aria-pressed={raw} className="text-xs text-accent underline-offset-4 hover:underline">
            {raw ? "Show verdicts" : "Show raw reply"}
          </button>
        )}
      </div>
      {j.output && !raw ? (
        <ul className="space-y-2">
          {(Object.keys(DIM_LABEL) as (keyof JudgeOutput["evidence"])[]).map((d) => {
            const value = String(j.output![d]);
            return (
              <li key={d} className="rounded-xl border border-border px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-text">{DIM_LABEL[d]}</span>
                  <Badge tone={d === "empathy" ? "neutral" : verdictTone(value)} mono>
                    {d === "empathy" ? `${value}/5` : value}
                  </Badge>
                </div>
                <p className="mt-1 text-[0.8rem] leading-snug text-muted">“{j.output!.evidence[d]}”</p>
              </li>
            );
          })}
        </ul>
      ) : (
        <Code label="Raw judge reply">{j.rawContent || "(empty reply)"}</Code>
      )}
    </div>
  );
}

// ── 6 Validate output ───────────────────────────────────────────────────────

function CheckStage({ run, onLive }: { run: RunView; onLive?: () => void }) {
  const j = run.judge;
  if (!j) return <NoJudge run={run} onLive={onLive} />;
  const parse = run.parse;
  const o = parse?.ok ? parse.value : null;
  const checks: [string, boolean][] = o
    ? [
        ["A single JSON object found in the reply", true],
        [`intent is one of the 10 flows (${o.intent})`, o.intent in FLOWS],
        [`identity_verification ∈ pass | fail | na (${o.identity_verification})`, true],
        [`policy_adherence ∈ pass | fail (${o.policy_adherence})`, true],
        [`resolution ∈ resolved | partial | unresolved (${o.resolution})`, true],
        [`empathy is an integer 1–5 (${o.empathy})`, true],
        ["evidence has five non-empty strings", true],
      ]
    : [];
  return (
    <div>
      {j.repaired && (
        <div className="mb-3">
          <Banner tone="warn">
            <strong>Repair round.</strong> The judge&apos;s first reply failed this check. The pipeline sent the exact validation error back once, and the
            corrected reply below passed. Without the repair it would have been stored as invalid, never as a guessed label.
          </Banner>
        </div>
      )}
      {o ? (
        <ul className="divide-y divide-[color:var(--border)] rounded-xl border border-border">
          {checks.map(([label, ok]) => (
            <li key={label} className="flex items-center gap-2.5 px-3 py-2 text-sm text-text">
              <Mark ok={ok} /> {label}
            </li>
          ))}
        </ul>
      ) : (
        <Banner tone="bad">
          <strong>Invalid output.</strong> {parse && !parse.ok ? parse.error : j.error}
        </Banner>
      )}
      <Note>
        Checked in your browser by the pipeline&apos;s own parser. Coercion is limited to unambiguous variants (case, &quot;N/A&quot;, a quoted integer);
        anything else is rejected, so a bad label never reaches cx_eval.scores.
      </Note>
    </div>
  );
}

// ── 7 Store ─────────────────────────────────────────────────────────────────

function numeric(dimension: string, value: string): number | null {
  if (dimension === "empathy") return Number(value);
  if (value === "pass" || value === "resolved") return 1;
  if (value === "partial") return 0.5;
  if (value === "fail" || value === "unresolved") return 0;
  return null;
}

function StoreStage({ run, onLive }: { run: RunView; onLive?: () => void }) {
  const j = run.judge;
  if (!j) return <NoJudge run={run} onLive={onLive} />;
  if (!j.output) return <Banner tone="bad">Invalid replies are stored in cx_eval.judge_results with the error, and no score rows are written.</Banner>;
  const stored = j.source === "stored";
  const rows =
    stored && j.scoreRows
      ? j.scoreRows.map((r) => ({ id: String(r.scoreId), dimension: r.dimension, value: r.value, num: r.valueNum }))
      : (Object.keys(DIM_LABEL) as (keyof JudgeOutput["evidence"])[]).map((d) => ({
          id: "—",
          dimension: d,
          value: String(j.output![d]),
          num: numeric(d, String(j.output![d])),
        }));
  const cell = "whitespace-nowrap px-2.5 py-1.5 text-left font-mono";
  return (
    <div>
      {!stored && (
        <div className="mb-3">
          <Banner tone="neutral">
            Preview: {j.source === "live" ? "live" : "what-if"} runs are not written to the warehouse. This is the shape they would take.
          </Banner>
        </div>
      )}
      <H>cx_eval.judge_results · one row per call, including failures</H>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-[0.72rem]">
          <thead className="bg-surface-muted text-soft">
            <tr>
              {["result_id", "status", "model", "rubric", "prompt_hash", "latency_ms", "repaired"].map((h) => (
                <th key={h} className={cell}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-text">
            <tr>
              <td className={cell}>{stored ? j.resultId : "—"}</td>
              <td className={cell}>{j.status}</td>
              <td className={cell}>{shortModel(j.model)}</td>
              <td className={cell}>{j.rubric}</td>
              <td className={cell}>{j.promptHash ? `${j.promptHash.slice(0, 10)}…` : "—"}</td>
              <td className={cell}>{j.latencyMs}</td>
              <td className={cell}>{String(j.repaired)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <H>cx_eval.scores · long format, one row per dimension</H>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-[0.72rem]">
          <thead className="bg-surface-muted text-soft">
            <tr>
              {["score_id", "convo_id", "batch_date", "dimension", "value", "value_num"].map((h) => (
                <th key={h} className={cell}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border)] text-text">
            {rows.map((r) => (
              <tr key={r.dimension}>
                <td className={cell}>{r.id}</td>
                <td className={cell}>{run.chat.id}</td>
                <td className={cell}>{run.chat.batchDate}</td>
                <td className={cell}>{r.dimension}</td>
                <td className={cell}>{r.value}</td>
                <td className={cell}>{r.num ?? "null"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>
        Evidence is stored in each row too (hidden here). Scores are append-only and keyed by model and rubric version: a re-score or backtest adds rows next to
        production instead of overwriting it, and the dated judge_config table says which pair is production on each day.
      </Note>
    </div>
  );
}

// ── 8 Metrics ───────────────────────────────────────────────────────────────

interface CompareColumn {
  id: string;
  title: string;
  sub: string;
  output: JudgeOutput;
  current: boolean;
}

function truthOf(chat: DemoChat, dim: "intent" | "identity_verification" | "policy_adherence"): string {
  const e = chat.enrich;
  return dim === "intent" ? e.trueFlow : dim === "identity_verification" ? e.gtIdentity : e.gtPolicy;
}

function CompareTable({ run, columns }: { run: RunView; columns: CompareColumn[] }) {
  const e = run.chat.enrich;
  const rows: { dim: keyof JudgeOutput["evidence"] | "cxi"; label: string; checkable: boolean }[] = [
    { dim: "intent", label: "Intent", checkable: true },
    { dim: "identity_verification", label: "Identity", checkable: true },
    { dim: "policy_adherence", label: "Policy", checkable: true },
    { dim: "resolution", label: "Resolution", checkable: false },
    { dim: "empathy", label: "Empathy", checkable: false },
    { dim: "cxi", label: "CXI", checkable: false },
  ];
  const cell = "px-2.5 py-1.5 text-left align-top";
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-xs">
        <thead className="bg-surface-muted">
          <tr>
            <th className={`${cell} text-soft`} scope="col">
              <span className="sr-only">Dimension</span>
            </th>
            {columns.map((c) => (
              <th key={c.id} scope="col" className={`${cell} font-medium ${c.current ? "text-accent" : "text-text"}`}>
                {c.title}
                <span className="block font-normal text-soft">{c.sub}</span>
              </th>
            ))}
            <th scope="col" className={`${cell} font-medium text-text`}>
              Ground truth
              <span className="block font-normal text-soft">from logged actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--border)]">
          {rows.map((r) => {
            const values = columns.map((c) => (r.dim === "cxi" ? cxiBreakdown(c.output, e.efficiency).total.toFixed(1) : String(c.output[r.dim])));
            const differs = new Set(values).size > 1;
            const truth = r.checkable ? truthOf(run.chat, r.dim as "intent") : null;
            return (
              <tr key={r.dim}>
                <th scope="row" className={`${cell} font-medium text-muted`}>
                  {r.label}
                  {differs && <span className="ml-1 text-[color:var(--cx-warn)]" title="Judges disagree">•</span>}
                </th>
                {columns.map((c, i) => (
                  <td key={c.id} className={`${cell} font-mono ${c.current ? "bg-accent-soft" : ""}`}>
                    <span className="inline-flex items-center gap-1">
                      {truth !== null && <Mark ok={values[i] === truth} label={values[i] === truth ? "matches ground truth" : "differs from ground truth"} />}
                      <span className="break-all">{values[i]}</span>
                    </span>
                  </td>
                ))}
                <td className={`${cell} font-mono text-muted`}>{truth ?? (r.dim === "cxi" ? "" : "judgement")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MetricsStage({ run, columns, onLive }: { run: RunView; columns: CompareColumn[]; onLive?: () => void }) {
  const j = run.judge;
  if (!j) return <NoJudge run={run} onLive={onLive} />;
  if (!j.output) return <Banner tone="bad">An invalid reply produces no scores, so this chat is left out of the metrics and counted in pipeline health instead.</Banner>;
  const e = run.chat.enrich;
  const { parts, total, identityNa } = cxiBreakdown(j.output, e.efficiency);
  const agreement: { label: string; judged: string; truth: string }[] = [
    { label: "Intent", judged: j.output.intent, truth: e.trueFlow },
    { label: "Identity", judged: j.output.identity_verification, truth: e.gtIdentity },
    { label: "Policy", judged: j.output.policy_adherence, truth: e.gtPolicy },
  ];
  const right = agreement.filter((a) => a.judged === a.truth).length;
  return (
    <div>
      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <H>CX Index for this chat</H>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold tabular-nums tracking-tight text-text">{total.toFixed(1)}</span>
            <span className="text-sm text-soft">/ 100</span>
          </div>
          <table className="mt-3 w-full text-xs">
            <caption className="sr-only">CXI calculation</caption>
            <thead className="text-soft">
              <tr>
                <th className="py-1 text-left font-normal">Dimension</th>
                <th className="py-1 text-left font-normal">Verdict</th>
                <th className="py-1 text-right font-normal">Points</th>
                <th className="py-1 text-right font-normal">Weight</th>
                <th className="py-1 text-right font-normal">= </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border)] tabular-nums text-text">
              {parts.map((p) => (
                <tr key={p.dimension} className={p.effectiveWeight === 0 ? "text-soft line-through" : ""}>
                  <td className="py-1.5">{p.label}</td>
                  <td className="py-1.5 font-mono">{p.value}</td>
                  <td className="py-1.5 text-right">{p.points.toFixed(0)}</td>
                  <td className="py-1.5 text-right">
                    {Math.round(p.weight * 100)}%{p.effectiveWeight && p.effectiveWeight !== p.weight ? ` → ${(p.effectiveWeight * 100).toFixed(1)}%` : ""}
                  </td>
                  <td className="py-1.5 text-right">{(p.points * p.effectiveWeight).toFixed(1)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-1.5" colSpan={4}>
                  CXI
                </td>
                <td className="py-1.5 text-right">{total.toFixed(1)}</td>
              </tr>
            </tbody>
          </table>
          <Note>
            pass = 100, fail = 0; resolved / partial / unresolved = 100 / 50 / 0; 1–5 scales map to (s − 1) ÷ 4 × 100.
            {identityNa ? " Identity is not applicable here, so its 20% is spread over the other weights." : ""}
          </Note>
        </div>
        <div>
          <H>Was the judge right? ({right} of 3 checkable)</H>
          <ul className="space-y-1.5">
            {agreement.map((a) => (
              <li key={a.label} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
                <Mark ok={a.judged === a.truth} />
                <span className="w-16 text-muted">{a.label}</span>
                <span className="min-w-0 truncate font-mono text-xs text-text">
                  {a.judged}
                  {a.judged !== a.truth && <span className="text-soft"> · truth {a.truth}</span>}
                </span>
              </li>
            ))}
            <li className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-1.5 text-sm">
              <Mark ok={null} />
              <span className="text-muted">Resolution and empathy are judgement calls: checked against human labels instead.</span>
            </li>
          </ul>
          {e.csat != null && <Note>Customer&apos;s (synthetic) CSAT: {e.csat} / 5.</Note>}
        </div>
      </div>
      {columns.length > 1 && (
        <>
          <H>Same chat, other judges</H>
          <CompareTable run={run} columns={columns} />
          <Note>Every column is a stored output for this exact conversation and prompt context. • marks rows where the judges disagree.</Note>
        </>
      )}
    </div>
  );
}

export function StageDetail({
  stage,
  run,
  columns,
  onLive,
}: {
  stage: StageKey;
  run: RunView;
  columns: CompareColumn[];
  onLive?: () => void;
}) {
  switch (stage) {
    case "ingest":
      return <IngestStage run={run} />;
    case "validate":
      return <ValidateStage run={run} />;
    case "enrich":
      return <EnrichStage run={run} />;
    case "prompt":
      return <PromptStage run={run} />;
    case "judge":
      return <JudgeStage run={run} onLive={onLive} />;
    case "check":
      return <CheckStage run={run} onLive={onLive} />;
    case "store":
      return <StoreStage run={run} onLive={onLive} />;
    case "metrics":
      return <MetricsStage run={run} columns={columns} onLive={onLive} />;
  }
}

export type { CompareColumn };
