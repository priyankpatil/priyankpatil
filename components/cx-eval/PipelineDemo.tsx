"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseJudgeOutput } from "@/pipelines/cx-eval/src/judge/parse.ts";
import { buildContext, buildPrompt, demo, MODELS, shortModel, type ModelId } from "@/lib/cx-eval/demo";
import type { LiveEvent, RawRecord, RubricId } from "@/lib/cx-eval/types";
import { validateRecord } from "@/lib/cx-eval/validate";
import { STAGES, StageDetail, type CompareColumn, type JudgeView, type RunView } from "./stages";
import { Segmented, Toggle } from "./ui";

// "Follow one conversation through the pipeline". By default every stage is
// replayed from what the pipeline stored; "Run it live" re-judges the chat
// through /api/cx-eval/judge and falls back to the stored result on failure.

type StageStatus = "pending" | "running" | "done" | "failed" | "skipped" | "missing";

interface LiveState {
  key: string;
  phase: "running" | "done" | "fallback";
  startedAt: number;
  result?: JudgeView;
  notice?: string;
}

const STEP_MS = 380;
const JUDGE_DWELL_MS = 900;
const knownReasons = new Set(demo.knownReasons);

function renameField(record: RawRecord): RawRecord {
  const { transcript, ...rest } = record;
  return { ...rest, messages: transcript };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function PipelineDemo() {
  const reduceMotion = useReducedMotion();
  const [chatId, setChatId] = useState(demo.chats[0].id);
  const [model, setModel] = useState<ModelId>(MODELS[0].id);
  const [rubric, setRubric] = useState<RubricId>("v1");
  const [rename, setRename] = useState(false);
  const [useAlt, setUseAlt] = useState(false);
  const [live, setLive] = useState<LiveState | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const chat = demo.chats.find((c) => c.id === chatId) ?? demo.chats[0];
  const inputKey = `${chatId}|${model}|${rubric}|${useAlt}|${rename}`;

  // ── The run as the pipeline sees it ──────────────────────────────────────
  const run: RunView = useMemo(() => {
    const record = rename ? renameField(chat.raw) : chat.raw;
    const validation = validateRecord(record, { convoId: chat.id, batchDate: chat.batchDate, knownReasons });
    const context = buildContext(chat, useAlt);
    const prompt = buildPrompt(chat, rubric, useAlt);
    const baseline = buildPrompt(chat, "v1", false);

    let judge: JudgeView | null = null;
    let missing: string | undefined;
    const liveResult = live && live.key === inputKey ? live.result : undefined;
    if (liveResult) {
      judge = liveResult;
    } else if (useAlt) {
      const a = chat.alt.runs.find((r) => r.model === model && r.rubric === rubric && r.status === "ok");
      if (a) judge = { source: "alt", model: a.model, rubric: a.rubric, status: a.status, output: a.output, rawContent: a.rawContent, latencyMs: a.latencyMs, promptTokens: a.promptTokens, completionTokens: a.completionTokens, repaired: a.repaired, judgedAt: a.judgedAt };
      else missing = `The what-if runs were precomputed with rubric v1. Run it live to judge this variant with rubric ${rubric}.`;
    } else {
      const s = chat.runs.find((r) => r.model === model && r.rubric === rubric);
      if (s) judge = { source: "stored", role: s.role, model: s.model, rubric: s.rubric, status: "ok", output: s.output, rawContent: s.rawContent, latencyMs: s.latencyMs, promptTokens: s.promptTokens, completionTokens: s.completionTokens, repaired: s.repaired, attempts: s.attempts, judgedAt: s.judgedAt, resultId: s.resultId, promptHash: s.promptHash, scoreRows: s.scoreRows };
      else missing = `No stored output yet for ${shortModel(model)} with rubric ${rubric} on this chat: that backtest is still being scored.`;
    }
    const parse = judge ? parseJudgeOutput(judge.rawContent) : null;
    return { chat, record, renamed: rename, useAlt, validation, context, prompt, baseline, rubric, model, judge, missing, parse };
  }, [chat, rename, useAlt, rubric, model, live, inputKey]);

  const columns: CompareColumn[] = useMemo(() => {
    const cols: CompareColumn[] = [];
    if (useAlt) {
      for (const a of chat.alt.runs) {
        if (a.output) cols.push({ id: `alt|${a.model}|${a.rubric}`, title: shortModel(a.model), sub: `rubric ${a.rubric} · what-if`, output: a.output, current: run.judge?.source === "alt" && a.model === model && a.rubric === rubric });
      }
    } else {
      for (const s of chat.runs) {
        cols.push({ id: `s|${s.model}|${s.rubric}`, title: shortModel(s.model), sub: `rubric ${s.rubric} · ${s.role}`, output: s.output, current: run.judge?.source === "stored" && s.model === model && s.rubric === rubric });
      }
    }
    if (run.judge?.source === "live" && run.judge.output) {
      cols.push({ id: "live", title: shortModel(run.judge.model), sub: `rubric ${run.judge.rubric} · live`, output: run.judge.output, current: true });
    }
    return cols;
  }, [chat, useAlt, model, rubric, run.judge]);

  // ── Stage statuses and the replay animation ──────────────────────────────
  const quarantined = run.validation.quarantined;
  const lastIndex = quarantined ? 1 : STAGES.length - 1;
  const landing = quarantined ? 1 : !run.judge ? 4 : STAGES.length - 1;

  const [progress, setProgress] = useState(0); // stages lit so far
  const [follow, setFollow] = useState(true);
  const [selected, setSelected] = useState(0);
  const [anim, setAnim] = useState<{ id: number; from: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const animId = useRef(0);

  const animating = anim !== null && progress <= lastIndex;
  const liveRunning = live?.phase === "running" && live.key === inputKey;

  const restart = useCallback(
    (from = 0) => {
      animId.current += 1;
      setFollow(true);
      if (reduceMotion) {
        setAnim(null);
        setProgress(STAGES.length);
        return;
      }
      setProgress(from);
      setAnim({ id: animId.current, from });
    },
    [reduceMotion]
  );

  // Start the first replay when the demo scrolls into view.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  // Any change to the inputs replays the run from the first stage it affects:
  // a new judge model changes nothing before the judge, a new rubric nothing
  // before the prompt.
  const prevInputs = useRef<string[] | null>(null);
  useEffect(() => {
    if (!visible) return;
    const now = [chatId, String(rename), String(useAlt), rubric, model];
    const prev = prevInputs.current;
    prevInputs.current = now;
    const firstStage = [0, 0, 2, 3, 4];
    const changed = prev ? now.findIndex((v, i) => v !== prev[i]) : 0;
    restart(changed === -1 ? 0 : firstStage[changed]);
  }, [visible, chatId, rename, useAlt, rubric, model, restart]);

  useEffect(() => {
    if (!anim || liveRunning) return;
    if (progress > lastIndex) {
      setAnim(null);
      setProgress(STAGES.length);
      return;
    }
    const delay = STAGES[progress]?.key === "judge" && run.judge ? JUDGE_DWELL_MS : STEP_MS;
    const t = setTimeout(() => setProgress((p) => p + 1), delay);
    return () => clearTimeout(t);
  }, [anim, progress, lastIndex, liveRunning, run.judge]);

  // The detail panel follows the animation until the user picks a stage.
  useEffect(() => {
    if (!follow) return;
    if (liveRunning) setSelected(4);
    else if (animating) setSelected(Math.min(progress, lastIndex));
    else setSelected(landing);
  }, [follow, animating, progress, lastIndex, landing, liveRunning]);

  const statusOf = (i: number): StageStatus => {
    const key = STAGES[i].key;
    if (liveRunning) return i < 4 ? "done" : i === 4 ? "running" : "pending";
    if (animating && i === progress) return "running";
    if (i >= progress) return "pending";
    if (quarantined) return i === 1 ? "failed" : i > 1 ? "skipped" : "done";
    if (i >= 4 && !run.judge) return "missing";
    if (key === "check" && run.parse && !run.parse.ok) return "failed";
    return "done";
  };

  const summaryOf = (i: number): string => {
    const s = statusOf(i);
    if (s === "pending") return "";
    if (s === "skipped") return "never reached";
    if (s === "missing") return "no stored output";
    if (s === "running") return STAGES[i].key === "judge" ? (liveRunning ? `calling the model… ${elapsed}s` : "replaying stored output…") : "";
    const e = chat.enrich;
    switch (STAGES[i].key) {
      case "ingest":
        return `${e.nTurns} turns`;
      case "validate": {
        const n = run.validation.checks.filter((c) => c.severity === "error").length;
        return quarantined ? "quarantined" : `${n} of ${n} error checks pass`;
      }
      case "enrich":
        return `identity ${e.gtIdentity} · policy ${e.gtPolicy}`;
      case "prompt":
        return `rubric ${rubric} · ~${Math.round((run.prompt.system.length + run.prompt.user.length) / 4).toLocaleString("en-US")} tokens`;
      case "judge":
        return run.judge ? `${shortModel(run.judge.model)} · ${(run.judge.latencyMs / 1000).toFixed(1)} s` : "";
      case "check":
        return run.parse?.ok ? (run.judge?.repaired ? "valid after repair" : "schema valid") : "invalid";
      case "store":
        return run.judge?.source === "stored" ? "5 rows in scores" : "preview only";
      case "metrics": {
        if (!run.judge?.output) return "";
        const right = [run.judge.output.intent === e.trueFlow, run.judge.output.identity_verification === e.gtIdentity, run.judge.output.policy_adherence === e.gtPolicy].filter(Boolean).length;
        return `${right}/3 verdicts match truth`;
      }
    }
  };

  // ── Live run ─────────────────────────────────────────────────────────────
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (!liveRunning || !live) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - live.startedAt) / 1000)), 500);
    return () => clearInterval(t);
  }, [liveRunning, live]);

  const runLive = useCallback(async () => {
    if (rename || liveRunning) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const key = inputKey;
    setElapsed(0);
    setFollow(true);
    setAnim(null);
    setProgress(4);
    setLive({ key, phase: "running", startedAt: Date.now() });
    const finish = (patch: Partial<LiveState>) => {
      setLive((prev) => (prev && prev.key === key ? { ...prev, ...patch } : prev));
      if (!reduceMotion) {
        animId.current += 1;
        setProgress(4);
        setAnim({ id: animId.current, from: 4 });
      } else setProgress(STAGES.length);
    };
    try {
      const res = await fetch("/api/cx-eval/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ convoId: chatId, model, rubric, mislabel: useAlt }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        finish({ phase: "fallback", notice: `Live run unavailable (${(await res.text()) || res.status}). Showing the stored result.` });
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buffer = "";
      let settled = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as LiveEvent;
          if (ev.type === "fallback") {
            settled = true;
            finish({ phase: "fallback", notice: `${ev.reason} Showing the stored result instead.` });
          } else if (ev.type === "result") {
            settled = true;
            finish({
              phase: "done",
              result: {
                source: "live",
                model: ev.model,
                rubric,
                status: ev.status,
                output: ev.output,
                rawContent: ev.rawContent,
                error: ev.error,
                latencyMs: ev.latencyMs,
                promptTokens: ev.promptTokens,
                completionTokens: ev.completionTokens,
                repaired: ev.repaired,
                attempts: ev.attempts,
                judgedAt: new Date().toISOString(),
              },
            });
          }
        }
      }
      if (!settled) finish({ phase: "fallback", notice: "The live run ended without a result. Showing the stored result instead." });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      finish({ phase: "fallback", notice: "The connection dropped during the live run. Showing the stored result instead." });
    }
  }, [rename, liveRunning, inputKey, chatId, model, rubric, useAlt, reduceMotion]);

  // ── Render ───────────────────────────────────────────────────────────────
  const stage = STAGES[selected];
  const notice = live && live.key === inputKey && live.phase === "fallback" ? live.notice : undefined;
  const j = run.judge;
  const provenance = quarantined
    ? "Validation runs in your browser (a mirror of the pipeline's SQL checks). Quarantined records never reach the judge."
    : !j
      ? run.missing
      : j.source === "live"
        ? `Live: judged just now by ${j.model} in ${(j.latencyMs / 1000).toFixed(1)} s. Not written to the warehouse.`
        : j.source === "alt"
          ? `What-if: judged by ${j.model} on ${formatDate(j.judgedAt!)} for this page. Not part of the warehouse.`
          : `Replayed from the pipeline's stored run: result #${j.resultId}, ${j.model}, rubric ${j.rubric} (${j.role}), judged ${formatDate(j.judgedAt!)}.`;

  const dot: Record<StageStatus, string> = {
    pending: "border-border bg-surface text-soft",
    running: "border-accent bg-accent-soft text-accent",
    done: "border-[color:var(--cx-good-line)] bg-[color:var(--cx-good-soft)] text-[color:var(--cx-good)]",
    failed: "border-[color:var(--cx-bad-line)] bg-[color:var(--cx-bad-soft)] text-[color:var(--cx-bad)]",
    skipped: "border-dashed border-border bg-transparent text-soft opacity-60",
    missing: "border-dashed border-border-strong bg-surface-muted text-soft",
  };
  const symbol = (s: StageStatus, n: number) => (s === "done" ? "✓" : s === "failed" ? "✗" : String(n));

  const pickStage = (i: number) => {
    setFollow(false);
    setSelected(i);
  };
  const onRailKey = (e: React.KeyboardEvent, i: number) => {
    const next = e.key === "ArrowDown" || e.key === "ArrowRight" ? i + 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const clamped = (next + STAGES.length) % STAGES.length;
    pickStage(clamped);
    document.getElementById(`cx-stage-tab-${clamped}`)?.focus();
    document.getElementById(`cx-stage-dot-${clamped}`)?.focus();
  };

  return (
    <div ref={rootRef} className="flex flex-col gap-5">
      {/* Conversation picker */}
      <fieldset>
        <legend className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-soft">Pick a conversation</legend>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {demo.chats.map((c) => {
            const active = c.id === chatId;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setChatId(c.id);
                  setUseAlt(false);
                  setLive(null);
                }}
                className={`rounded-xl border px-3 py-2 text-left text-sm leading-snug ${
                  active ? "border-accent bg-accent-soft text-text" : "border-border bg-surface text-muted hover:border-border-strong hover:text-text"
                }`}
              >
                <span className="font-medium">{c.label}</span>
                <span className="mt-0.5 block font-mono text-[0.65rem] text-soft">
                  {c.id} · {c.enrich.trueFlow.replace(/_/g, " ")}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">{chat.blurb}</p>
      </fieldset>

      {/* Controls */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-muted p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-soft">Judge</span>
            <Segmented
              label="Judge model"
              value={model}
              onChange={(v) => setModel(v)}
              options={MODELS.map((m) => ({ value: m.id, label: m.short, hint: m.note }))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-soft">Rubric</span>
            <Segmented
              label="Rubric version"
              value={rubric}
              onChange={(v) => setRubric(v)}
              options={[
                { value: "v1", label: "v1", hint: "Production rubric" },
                { value: "v2", label: "v2", hint: "Procedural identity and policy checks (backtest)" },
              ]}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-soft">Break it</span>
          <Toggle checked={rename} onChange={setRename} hint="The upstream system renames transcript → messages, as on Oct 18">
            Upstream renames a field
          </Toggle>
          <Toggle checked={useAlt} onChange={setUseAlt} hint={`Logged reason becomes ${chat.alt.contactReason}`}>
            {chat.alt.kind === "mislabel" ? "Mislabel the contact reason" : "Fix the contact reason"}
          </Toggle>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => {
              setLive(null);
              restart(0);
            }}
            disabled={liveRunning}
            className="pill-link"
          >
            ↻ Replay
          </button>
          <button
            type="button"
            onClick={runLive}
            disabled={rename || liveRunning}
            title={rename ? "Quarantined records never reach the judge" : "Re-judge this chat now via the NVIDIA API"}
            className="pill-link primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {liveRunning ? `Judging… ${elapsed}s` : "▶ Run it live"}
          </button>
          <span className="text-xs text-soft">
            {rename ? "Live runs are off: this record would be quarantined." : `Calls ${shortModel(model)} with rubric ${rubric}. Usually 10–40 s.`}
          </span>
        </div>
      </div>

      {/* Pipeline */}
      <div className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-[var(--shadow)]">
        <div className="grid md:grid-cols-[250px_1fr]">
          {/* Rail: numbered dots on small screens, a labelled list from md up */}
          <nav aria-label="Pipeline stages" className="border-b border-border p-3 md:border-b-0 md:border-r md:p-4">
            <ol className="grid grid-cols-8 gap-1 md:hidden">
              {STAGES.map((s, i) => {
                const st = statusOf(i);
                return (
                  <li key={s.key} className="flex justify-center">
                    <button
                      id={`cx-stage-dot-${i}`}
                      type="button"
                      onClick={() => pickStage(i)}
                      onKeyDown={(e) => onRailKey(e, i)}
                      aria-current={selected === i ? "step" : undefined}
                      aria-label={`${i + 1}. ${s.name}: ${st}`}
                      className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${dot[st]} ${
                        selected === i ? "ring-2 ring-[color:var(--ring)] ring-offset-1 ring-offset-[color:var(--surface)]" : ""
                      } ${st === "running" ? "animate-pulse" : ""}`}
                    >
                      {symbol(st, i + 1)}
                    </button>
                  </li>
                );
              })}
            </ol>
            <ol className="hidden md:block">
              {STAGES.map((s, i) => {
                const st = statusOf(i);
                const newGroup = i === 0 || STAGES[i - 1].group !== s.group;
                return (
                  <li key={s.key}>
                    {newGroup && <p className={`mb-1 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-soft ${i ? "mt-3" : ""}`}>{s.group}</p>}
                    <button
                      id={`cx-stage-tab-${i}`}
                      type="button"
                      onClick={() => pickStage(i)}
                      onKeyDown={(e) => onRailKey(e, i)}
                      aria-current={selected === i ? "step" : undefined}
                      className={`flex w-full items-start gap-2.5 rounded-xl px-2 py-1.5 text-left ${selected === i ? "bg-surface-muted" : "hover:bg-surface-muted"}`}
                    >
                      <span
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[0.68rem] font-semibold transition-colors duration-300 ${dot[st]} ${
                          st === "running" ? "animate-pulse" : ""
                        }`}
                        aria-hidden
                      >
                        {symbol(st, i + 1)}
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-sm font-medium ${st === "pending" || st === "skipped" ? "text-soft" : "text-text"}`}>{s.name}</span>
                        <span className="block min-h-[1rem] truncate text-[0.7rem] text-soft">{summaryOf(i)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* Detail */}
          <section aria-live="polite" aria-label={`Stage ${selected + 1}: ${stage.name}`} className="min-w-0 p-4 sm:p-5">
            <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-lg font-semibold tracking-tight text-text">
                <span className="mr-2 text-soft">{selected + 1}</span>
                {stage.name}
              </h3>
              <span className="font-mono text-[0.68rem] text-soft">{stage.where}</span>
              <p className="w-full text-sm text-muted">{stage.does}</p>
            </header>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${stage.key}|${inputKey}|${j?.source ?? "none"}`}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                {statusOf(selected) === "pending" && !visible ? (
                  <p className="text-sm text-soft">Scroll here to replay the run.</p>
                ) : statusOf(selected) === "skipped" ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-soft">
                    Never reached: the record was quarantined at validation, so this stage has nothing to show. That is the point.
                  </p>
                ) : liveRunning && selected >= 4 ? (
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-10 text-center">
                    <span className="h-2 w-2 animate-ping rounded-full bg-accent" aria-hidden />
                    <p className="text-sm text-muted">
                      Calling <span className="font-mono text-xs">{model}</span> on the NVIDIA API with rubric {rubric}… {elapsed}s
                    </p>
                  </div>
                ) : (
                  <StageDetail stage={stage.key} run={run} columns={columns} onLive={rename ? undefined : runLive} />
                )}
              </motion.div>
            </AnimatePresence>
          </section>
        </div>
        <footer className="border-t border-border bg-surface-muted px-4 py-2.5 text-xs leading-relaxed text-soft sm:px-5">
          {notice && <p className="mb-1 text-[color:var(--cx-warn)]">{notice}</p>}
          {provenance}
        </footer>
      </div>
    </div>
  );
}
