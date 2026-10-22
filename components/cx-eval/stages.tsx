"use client";

import { useState, type ReactNode } from "react";
import type { JudgeContext, JudgeOutput } from "@/pipelines/cx-eval/src/contract.ts";
import { FLOWS } from "@/pipelines/cx-eval/src/contract.ts";
import type { ParseResult } from "@/pipelines/cx-eval/src/judge/parse.ts";
import { RUBRIC_V1 } from "@/pipelines/cx-eval/src/rubric/v1.ts";
import { cxiBreakdown, estimateTokens, MODELS, shortModel, type ModelId } from "@/lib/cx-eval/demo";
import { explainIdentity, explainPolicy } from "@/lib/cx-eval/ground-truth";
import type { DemoChat, RawRecord, RubricId, StoredRun } from "@/lib/cx-eval/types";
import type { CheckResult } from "@/lib/cx-eval/validate";
import { Badge, Code, Collapsible, Fact, Mark, TextButton, TryThis, verdictTone } from "./ui";

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
  /** The prompt with the logged reason: lines that differ from it are highlighted. */
  baseline: { system: string; user: string };
  model: ModelId;
  /** The recorded answer for this chat and model (rubric v1). */
  judge: JudgeView | null;
  parse: ParseResult | null;
}

/** "Ask it again, live" in stage 5. */
export interface LiveView {
  phase: "running" | "done" | "fallback";
  elapsed: number;
  result?: JudgeView;
  notice?: string;
}

/** What the "Try this" boxes can change. */
export interface DemoActions {
  setRename: (v: boolean) => void;
  setUseAlt: (v: boolean) => void;
  setModel: (m: ModelId) => void;
  goTo: (stage: number) => void;
  live: LiveView | null;
  askLive: () => void;
  cancelLive: () => void;
}

export type StageKey = "ingest" | "validate" | "enrich" | "prompt" | "judge" | "check" | "store" | "metrics";

export const STAGES: { key: StageKey; name: string; group: string; does: string; where: string }[] = [
  { key: "ingest", name: "Ingest", group: "Input", does: "The record exactly as the support system delivers it.", where: "Loader script → raw_conversations (jsonb, no logic)" },
  { key: "validate", name: "Validate", group: "ETL + synthetic data", does: "Format checks. A record that fails one is held back, with the reason.", where: "SQL · cx_eval.validate_batch()" },
  { key: "enrich", name: "Enrich", group: "ETL + synthetic data", does: "Actions extracted, policy attached, ground truth computed. The judge never sees the ground truth.", where: "SQL · cx_eval.transform_batch()" },
  { key: "prompt", name: "Rubric + prompt", group: "LLM evaluator + rubric", does: "The written rubric and this chat's facts are turned into the prompt the judge reads.", where: "SQL assembles context · rubric renders prompt" },
  { key: "judge", name: "LLM judge", group: "LLM evaluator + rubric", does: "An open-weight model gives five verdicts and quotes its evidence for each.", where: "NVIDIA API · temperature 0 · retries with backoff" },
  { key: "check", name: "Validate output", group: "Output", does: "Strict format check. A bad answer is sent back once to fix, then stored as invalid.", where: "Pipeline parser (parse.ts)" },
  { key: "store", name: "Store", group: "Output", does: "One row per verdict, never overwritten, labelled with the model and rubric version.", where: "cx_eval.judge_results + cx_eval.scores" },
  { key: "metrics", name: "Metrics", group: "ETL → metrics", does: "Verdicts turned into this chat's quality score, and checked against the facts: was the judge right?", where: "SQL view · mart_conversation_scores" },
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

function ValidateStage({ run, actions }: { run: RunView; actions: DemoActions }) {
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
            <strong>Held back (quarantined).</strong> {failed.map((c) => `${c.name} (${c.detail})`).join("; ")}. The record is set aside with the
            reason and stops here: nothing downstream sees it, so no score or metric is computed from a broken record. The raw record is kept, so it can
            be re-run once the source is fixed.
          </Banner>
        ) : (
          <Banner tone="good">
            <strong>Valid.</strong> All error checks pass{checks.some((c) => !c.passed) ? " (warnings are recorded, not blocking)" : ""}; the record moves on to
            transformation.
          </Banner>
        )}
      </div>
      <Note>These checks run as SQL inside the warehouse. This page runs a copy of the same rules in your browser, so you can break the record below.</Note>
      <TryThis
        question="What if the source system renames a field?"
        explain={
          <>
            On Oct 18 the support system started sending the chat text as <code className="font-mono text-[0.85em]">messages</code> instead of{" "}
            <code className="font-mono text-[0.85em]">transcript</code>. Press the button to do the same to this record: it will be held back here, and every
            later stage will show &ldquo;Never reached&rdquo;.
          </>
        }
      >
        {run.renamed ? (
          <TextButton onClick={() => actions.setRename(false)}>Restore the field</TextButton>
        ) : (
          <button type="button" className="pill-link" onClick={() => actions.setRename(true)}>
            Rename transcript → messages
          </button>
        )}
      </TryThis>
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

function PromptStage({ run, actions }: { run: RunView; actions: DemoActions }) {
  const [rubricText, contextText = ""] = run.prompt.system.split("\n\nThis chat:\n");
  const [, baseContext = ""] = run.baseline.system.split("\n\nThis chat:\n");
  const tokens = estimateTokens(run.prompt.system + run.prompt.user);
  const llm = RUBRIC_V1.dimensions.filter((d) => d.scoredBy === "llm");
  const chat = run.chat;
  const fixing = chat.alt.kind === "correct";
  return (
    <div>
      <H>The rubric: five verdicts the judge must give</H>
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

      <H>The assembled prompt · about {tokens.toLocaleString("en-US")} tokens</H>
      <div className="space-y-2">
        <Collapsible summary={<span>Rubric text ({rubricText.split("\n").length} lines, the same for every chat)</span>}>
          <Code label="Rubric part of the system prompt">{rubricText}</Code>
        </Collapsible>
        <Collapsible defaultOpen summary={<span>Facts about this chat</span>}>
          <Code label="Context part of the system prompt">
            <DiffLines text={`This chat:\n${contextText}`} baseline={`This chat:\n${baseContext}`} />
          </Code>
        </Collapsible>
        <Collapsible summary={<span>The transcript ({run.context.turns.length} lines; button presses carry their id)</span>}>
          <Code label="Transcript sent to the judge">{run.prompt.user}</Code>
        </Collapsible>
      </div>
      <Note>Built in your browser by the pipeline&apos;s own rubric code from the stored facts, so every prompt can be rebuilt exactly.</Note>

      <TryThis
        question={fixing ? "What if the agent had logged the right contact reason?" : "What if the agent logged the wrong contact reason?"}
        explain={
          fixing
            ? "This chat was logged under the wrong reason, so the prompt lists the wrong policy steps. Fix the label and see what the judge is told instead."
            : "The prompt lists the policy steps for whatever reason the agent logged. Swap in a wrong one and see what the judge is told instead."
        }
      >
        {run.useAlt ? (
          <div className="space-y-3">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-border bg-surface px-3 py-2">
                <dt className="text-[0.68rem] uppercase tracking-[0.14em] text-soft">Before</dt>
                <dd className="mt-1 text-sm">
                  <span className="font-mono text-xs text-text">{chat.context.contactReason}</span>
                  <PolicyLine steps={chat.context.policySteps} />
                </dd>
              </div>
              <div className="min-w-0 rounded-xl border border-[color:var(--cx-warn-line)] bg-[color:var(--cx-warn-soft)] px-3 py-2">
                <dt className="text-[0.68rem] uppercase tracking-[0.14em] text-soft">Now</dt>
                <dd className="mt-1 text-sm">
                  <span className="font-mono text-xs text-text">{chat.alt.contactReason}</span>
                  <PolicyLine steps={chat.alt.policySteps} />
                </dd>
              </div>
            </dl>
            <p className="text-sm text-muted">
              The changed lines are highlighted in &ldquo;Facts about this chat&rdquo; above. The transcript is untouched: the agent did exactly the same
              things.
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="button" className="pill-link primary" onClick={() => actions.goTo(4)}>
                Was the judge fooled? See stage 5 →
              </button>
              <TextButton onClick={() => actions.setUseAlt(false)}>Restore the logged reason</TextButton>
            </div>
          </div>
        ) : (
          <button type="button" className="pill-link" onClick={() => actions.setUseAlt(true)}>
            {fixing ? "Use the right reason" : "Log the wrong reason"} ({chat.alt.contactReason})
          </button>
        )}
      </TryThis>
    </div>
  );
}

function PolicyLine({ steps }: { steps: string[] }) {
  return (
    <span className="mt-1 block text-xs text-muted">
      {steps.length ? <>Policy steps: {steps.join(" → ")}</> : "No policy steps (an FAQ question)."}
    </span>
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
const DIMS = Object.keys(DIM_LABEL) as (keyof JudgeOutput["evidence"])[];

const fmtValue = (o: JudgeOutput, d: keyof JudgeOutput["evidence"]) => (d === "empathy" ? `${o.empathy}/5` : String(o[d]));
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function sourceLabel(j: JudgeView): string {
  if (j.source === "live") return "Asked just now";
  if (j.source === "alt") return "Recorded for this page, with the swapped reason";
  return j.role === "production" ? "Recorded when the pipeline ran" : "Recorded later, re-scoring the same chat";
}

function MissingJudge({ run }: { run: RunView }) {
  return (
    <Banner tone="neutral">
      {shortModel(run.model)} has no recorded answer for this chat. In stage 5, switch back to {MODELS[0].short} or ask {shortModel(run.model)} live.
    </Banner>
  );
}

/** Three verdicts that can be checked against the facts, with ✓ / ✗. */
function TruthCheck({ chat, output }: { chat: DemoChat; output: JudgeOutput }) {
  const e = chat.enrich;
  const rows = [
    { label: "Intent", judged: output.intent, truth: e.trueFlow },
    { label: "Identity", judged: output.identity_verification, truth: e.gtIdentity },
    { label: "Policy", judged: output.policy_adherence, truth: e.gtPolicy },
  ];
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm">
          <Mark ok={r.judged === r.truth} label={r.judged === r.truth ? "matches the facts" : "differs from the facts"} />
          <span className="w-16 shrink-0 text-muted">{r.label}</span>
          <span className="min-w-0 break-all font-mono text-xs text-text">
            {r.judged}
            {r.judged !== r.truth && <span className="text-soft"> · truth: {r.truth}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ModelChoice({ run, actions }: { run: RunView; actions: DemoActions }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Judge model">
      {MODELS.map((m) => {
        const active = m.id === run.model;
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={active}
            onClick={() => actions.setModel(m.id)}
            className={`rounded-xl border px-3 py-2 text-left ${active ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-border-strong"}`}
          >
            <span className="block font-mono text-sm font-medium text-text">{m.short}</span>
            <span className="block text-xs text-muted">{m.note}</span>
          </button>
        );
      })}
    </div>
  );
}

function LiveCompare({ recorded, live }: { recorded: JudgeView | null; live: JudgeView }) {
  const r = recorded?.output;
  const l = live.output;
  if (!l) {
    return (
      <Banner tone="warn">
        The model answered in {seconds(live.latencyMs)}, but the answer did not pass the format check (the job of stage 6), so the pipeline would store it as
        invalid rather than guess. The recorded answer above is unchanged.
      </Banner>
    );
  }
  const diffs = r ? DIMS.filter((d) => fmtValue(r, d) !== fmtValue(l, d)).length : 0;
  const cell = "px-3 py-1.5 text-left";
  return (
    <div>
      <p className="mb-2 text-sm text-text">
        {!r
          ? "No recorded answer to compare with, so here is the live answer on its own."
          : diffs === 0
            ? "Same verdicts as the recorded answer, on every question."
            : `${diffs} of ${DIMS.length} verdicts came out differently this time (highlighted).`}
      </p>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-xs">
          <caption className="sr-only">Recorded answer and live answer, verdict by verdict</caption>
          <thead className="bg-surface-muted text-soft">
            <tr>
              <th scope="col" className={`${cell} font-normal`}>
                <span className="sr-only">Question</span>
              </th>
              {r && (
                <th scope="col" className={`${cell} font-medium text-text`}>
                  Recorded
                </th>
              )}
              <th scope="col" className={`${cell} font-medium text-text`}>
                Live, just now
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border)]">
            {DIMS.map((d) => {
              const differs = r ? fmtValue(r, d) !== fmtValue(l, d) : false;
              return (
                <tr key={d} className={differs ? "bg-[color:var(--cx-warn-soft)]" : ""}>
                  <th scope="row" className={`${cell} font-medium text-muted`}>
                    {DIM_LABEL[d]}
                    {differs && <span className="ml-1.5 font-normal text-[color:var(--cx-warn)]">changed</span>}
                  </th>
                  {r && <td className={`${cell} font-mono text-text`}>{fmtValue(r, d)}</td>}
                  <td className={`${cell} font-mono text-text`}>{fmtValue(l, d)}</td>
                </tr>
              );
            })}
            <tr>
              <th scope="row" className={`${cell} font-medium text-muted`}>
                Time to answer
              </th>
              {r && <td className={`${cell} tabular-nums text-muted`}>{seconds(recorded!.latencyMs)}</td>}
              <td className={`${cell} tabular-nums text-muted`}>{seconds(live.latencyMs)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {live.repaired && <Note>The live answer needed one round of fixing before it passed the format check.</Note>}
    </div>
  );
}

function LiveTry({ run, actions }: { run: RunView; actions: DemoActions }) {
  const live = actions.live;
  const name = shortModel(run.model);
  return (
    <TryThis
      question="Ask it again, live"
      explain={
        <>
          The answer above was recorded when the pipeline ran. Press the button to send the exact same prompt to {name} right now. It takes 10–40 seconds.
          Language models don&apos;t always answer the same way twice, which is why the pipeline stores every answer.
        </>
      }
    >
      {live?.phase === "running" ? (
        <div className="flex flex-wrap items-center gap-3" role="status">
          <span className="relative flex h-2.5 w-2.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
          </span>
          <span className="text-sm text-text">
            Waiting for {name}… <span className="tabular-nums">{live.elapsed}s</span>
          </span>
          <TextButton onClick={actions.cancelLive}>Cancel</TextButton>
        </div>
      ) : (
        <div className="space-y-3">
          {live?.phase === "fallback" && (
            <Banner tone="warn">
              Couldn&apos;t ask the model live: {live.notice} The recorded answer above is unchanged.
            </Banner>
          )}
          {live?.phase === "done" && live.result && <LiveCompare recorded={run.judge} live={live.result} />}
          <button type="button" className="pill-link primary" onClick={actions.askLive}>
            {live ? `Ask ${name} again` : `Ask ${name} now`}
          </button>
        </div>
      )}
    </TryThis>
  );
}

function JudgeStage({ run, actions }: { run: RunView; actions: DemoActions }) {
  const j = run.judge;
  const [raw, setRaw] = useState(false);
  const tries = (
    <>
      <TryThis
        question="Ask a different model"
        explain="The pipeline switched judges on Oct 10. Pick one to see its recorded answer for this same chat and prompt."
      >
        <ModelChoice run={run} actions={actions} />
      </TryThis>
      <LiveTry run={run} actions={actions} />
    </>
  );
  if (!j) {
    return (
      <div>
        <MissingJudge run={run} />
        {tries}
      </div>
    );
  }
  return (
    <div>
      {run.useAlt && j.output && (
        <div className="mb-4 rounded-xl border border-[color:var(--cx-warn-line)] bg-[color:var(--cx-warn-soft)] p-3">
          <p className="mb-2 text-sm text-text">
            With the logged reason swapped to <span className="font-mono text-xs">{run.chat.alt.contactReason}</span>, did the judge still get it right?
          </p>
          <TruthCheck chat={run.chat} output={j.output} />
        </div>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Fact label="Model">
          <span className="font-mono text-xs">{shortModel(j.model)}</span>
        </Fact>
        <Fact label="Source">{sourceLabel(j)}</Fact>
        <Fact label="Time to answer">{seconds(j.latencyMs)}</Fact>
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
          {DIMS.map((d) => {
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
      {tries}
    </div>
  );
}

// ── 6 Validate output ───────────────────────────────────────────────────────

function CheckStage({ run }: { run: RunView }) {
  const j = run.judge;
  if (!j) return <MissingJudge run={run} />;
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

function StoreStage({ run }: { run: RunView }) {
  const j = run.judge;
  if (!j) return <MissingJudge run={run} />;
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
            Preview: answers recorded for this page&apos;s experiments are not written to the warehouse. This is the shape they would take.
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
        Evidence is stored in each row too (hidden here). Rows are never overwritten: re-scoring with another model or rubric adds new rows next to the
        old ones, and a dated config table says which pair was in use on each day.
      </Note>
    </div>
  );
}

// ── 8 Metrics ───────────────────────────────────────────────────────────────

function RubricTry({ run }: { run: RunView }) {
  const [show, setShow] = useState(false);
  const chat = run.chat;
  const base = MODELS[0].id;
  const v1 = chat.runs.find((r) => r.model === base && r.rubric === "v1");
  const v2 = chat.runs.find((r) => r.model === base && r.rubric === "v2");
  const e = chat.enrich;
  const rows = [
    { label: "Intent", truth: e.trueFlow, get: (o: JudgeOutput) => o.intent },
    { label: "Identity", truth: e.gtIdentity, get: (o: JudgeOutput) => o.identity_verification },
    { label: "Policy", truth: e.gtPolicy, get: (o: JudgeOutput) => o.policy_adherence },
  ];
  const cell = "px-3 py-1.5 text-left";
  const verdict = (o: JudgeOutput, r: (typeof rows)[number]) => (
    <span className="inline-flex items-center gap-1">
      <Mark ok={r.get(o) === r.truth} label={r.get(o) === r.truth ? "matches the facts" : "differs from the facts"} />
      <span className="break-all font-mono">{r.get(o)}</span>
    </span>
  );
  return (
    <TryThis
      question="Try the stricter rubric"
      explain="Version 2 of the rubric makes the judge point to the exact position of each required button before deciding. The version in use is v1."
    >
      {!v1 || !v2 ? (
        <p className="text-sm text-muted">This chat has not been re-scored with version 2 yet.</p>
      ) : show ? (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-xs">
              <caption className="sr-only">Verdicts under rubric v1 and v2, checked against the facts</caption>
              <thead className="bg-surface-muted text-soft">
                <tr>
                  <th scope="col" className={`${cell} font-normal`}>
                    <span className="sr-only">Question</span>
                  </th>
                  <th scope="col" className={`${cell} font-medium text-text`}>
                    v1 (in use)
                  </th>
                  <th scope="col" className={`${cell} font-medium text-text`}>
                    v2 (stricter)
                  </th>
                  <th scope="col" className={`${cell} font-medium text-text`}>
                    Truth
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border)]">
                {rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className={`${cell} font-medium text-muted`}>
                      {r.label}
                    </th>
                    <td className={cell}>{verdict(v1.output, r)}</td>
                    <td className={cell}>{verdict(v2.output, r)}</td>
                    <td className={`${cell} break-all font-mono text-muted`}>{r.truth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-soft">
            Both answers are from {MODELS[0].short} on the original chat
            {run.model !== base || run.useAlt ? ", whatever you picked in the stages above" : ""}.
          </p>
          <TextButton onClick={() => setShow(false)}>Back to v1 only</TextButton>
        </div>
      ) : (
        <button type="button" className="pill-link" onClick={() => setShow(true)}>
          Compare v1 and v2 on this chat
        </button>
      )}
    </TryThis>
  );
}

function MetricsStage({ run }: { run: RunView }) {
  const j = run.judge;
  if (!j) return <MissingJudge run={run} />;
  if (!j.output) return <Banner tone="bad">An invalid reply produces no scores, so this chat is left out of the metrics and counted as a pipeline error instead.</Banner>;
  const e = run.chat.enrich;
  const { parts, total, identityNa } = cxiBreakdown(j.output, e.efficiency);
  const right = [j.output.intent === e.trueFlow, j.output.identity_verification === e.gtIdentity, j.output.policy_adherence === e.gtPolicy].filter(Boolean).length;
  return (
    <div>
      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <H>Quality score for this chat</H>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold tabular-nums tracking-tight text-text">{total.toFixed(1)}</span>
            <span className="text-sm text-soft">/ 100</span>
          </div>
          <table className="mt-3 w-full text-xs">
            <caption className="sr-only">How the quality score is calculated</caption>
            <thead className="text-soft">
              <tr>
                <th className="py-1 text-left font-normal">Verdict</th>
                <th className="py-1 text-left font-normal">Value</th>
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
                  Score
                </td>
                <td className="py-1.5 text-right">{total.toFixed(1)}</td>
              </tr>
            </tbody>
          </table>
          <Note>
            pass = 100, fail = 0; resolved / partial / unresolved = 100 / 50 / 0; 1–5 scales map to 0–100.
            {identityNa ? " No identity check was needed here, so its 20% is spread over the other weights." : ""}
          </Note>
        </div>
        <div>
          <H>Was the judge right? ({right} of 3 checkable)</H>
          <TruthCheck chat={run.chat} output={j.output} />
          <p className="mt-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-sm text-muted">
            Resolution and empathy are judgement calls, so they have no automatic truth to check against.
          </p>
          {e.csat != null && <Note>This customer&apos;s (simulated) satisfaction rating: {e.csat} / 5.</Note>}
        </div>
      </div>
      <RubricTry run={run} />
    </div>
  );
}

export function StageDetail({ stage, run, actions }: { stage: StageKey; run: RunView; actions: DemoActions }) {
  switch (stage) {
    case "ingest":
      return <IngestStage run={run} />;
    case "validate":
      return <ValidateStage run={run} actions={actions} />;
    case "enrich":
      return <EnrichStage run={run} />;
    case "prompt":
      return <PromptStage run={run} actions={actions} />;
    case "judge":
      return <JudgeStage run={run} actions={actions} />;
    case "check":
      return <CheckStage run={run} />;
    case "store":
      return <StoreStage run={run} />;
    case "metrics":
      return <MetricsStage run={run} />;
  }
}
