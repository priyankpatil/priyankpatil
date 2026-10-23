"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseJudgeOutput } from "@/pipelines/cx-eval/src/judge/parse.ts";
import { blurbOf, buildContext, buildPrompt, demo, MODELS, shortModel, type ModelId } from "@/lib/cx-eval/demo";
import type { LiveEvent, RawRecord } from "@/lib/cx-eval/types";
import { validateRecord } from "@/lib/cx-eval/validate";
import { STAGES, StageDetail, type DemoActions, type JudgeView, type LiveView, type RunView } from "./stages";

// "Follow one conversation through the pipeline". Every stage is replayed from
// what the pipeline stored. Experiments live inside the stage they affect
// ("Try this" boxes); the live call in stage 5 goes through /api/cx-eval/judge
// and never replaces the recorded answer.

type StageStatus = "pending" | "running" | "done" | "failed" | "skipped" | "missing";

interface LiveState {
  key: string;
  phase: LiveView["phase"];
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
  const [rename, setRename] = useState(false);
  const [useAlt, setUseAlt] = useState(false);
  const [live, setLive] = useState<LiveState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [replays, setReplays] = useState(0);

  const chat = demo.chats.find((c) => c.id === chatId) ?? demo.chats[0];
  const liveKey = `${chatId}|${model}|${useAlt}`;

  // ── The run as the pipeline recorded it (rubric v1, the version in use) ──
  const run: RunView = useMemo(() => {
    const record = rename ? renameField(chat.raw) : chat.raw;
    const validation = validateRecord(record, { convoId: chat.id, batchDate: chat.batchDate, knownReasons });
    const context = buildContext(chat, useAlt);
    const prompt = buildPrompt(chat, "v1", useAlt);
    const baseline = buildPrompt(chat, "v1", false);

    let judge: JudgeView | null = null;
    if (useAlt) {
      const a = chat.alt.runs.find((r) => r.model === model && r.rubric === "v1" && r.status === "ok");
      if (a)
        judge = {
          source: "alt",
          model: a.model,
          rubric: a.rubric,
          status: a.status,
          output: a.output,
          rawContent: a.rawContent,
          latencyMs: a.latencyMs,
          promptTokens: a.promptTokens,
          completionTokens: a.completionTokens,
          repaired: a.repaired,
          judgedAt: a.judgedAt,
        };
    } else {
      const s = chat.runs.find((r) => r.model === model && r.rubric === "v1");
      if (s)
        judge = {
          source: "stored",
          role: s.role,
          model: s.model,
          rubric: s.rubric,
          status: "ok",
          output: s.output,
          rawContent: s.rawContent,
          latencyMs: s.latencyMs,
          promptTokens: s.promptTokens,
          completionTokens: s.completionTokens,
          repaired: s.repaired,
          attempts: s.attempts,
          judgedAt: s.judgedAt,
          resultId: s.resultId,
          promptHash: s.promptHash,
          scoreRows: s.scoreRows,
        };
    }
    const parse = judge ? parseJudgeOutput(judge.rawContent) : null;
    return { chat, record, renamed: rename, useAlt, validation, context, prompt, baseline, model, judge, parse };
  }, [chat, rename, useAlt, model]);

  // ── Stage statuses and the replay animation ──────────────────────────────
  const quarantined = run.validation.quarantined;
  const lastIndex = quarantined ? 1 : STAGES.length - 1;
  const landing = quarantined ? 1 : STAGES.length - 1;

  const [progress, setProgress] = useState(0); // stages lit so far
  const [follow, setFollow] = useState(true);
  const [selected, setSelected] = useState(0);
  const [anim, setAnim] = useState(false);
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const animating = anim && progress <= lastIndex;

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

  // Picking a chat (or "Replay this chat") replays it stage by stage. The
  // "Try this" experiments do not: they update the stages in place so the
  // panel the viewer is reading stays put.
  useEffect(() => {
    if (!visible) return;
    setFollow(true);
    if (reduceMotion) {
      setAnim(false);
      setProgress(STAGES.length);
      return;
    }
    setProgress(0);
    setAnim(true);
  }, [visible, chatId, replays, reduceMotion]);

  useEffect(() => {
    if (!anim) return;
    if (progress > lastIndex) {
      setAnim(false);
      setProgress(STAGES.length);
      return;
    }
    const delay = STAGES[progress]?.key === "judge" && run.judge ? JUDGE_DWELL_MS : STEP_MS;
    const t = setTimeout(() => setProgress((p) => p + 1), delay);
    return () => clearTimeout(t);
  }, [anim, progress, lastIndex, run.judge]);

  // The detail panel follows the animation until the user picks a stage.
  useEffect(() => {
    if (!follow) return;
    if (animating) setSelected(Math.min(progress, lastIndex));
    else if (progress >= STAGES.length) setSelected(landing);
  }, [follow, animating, progress, lastIndex, landing]);

  const statusOf = (i: number): StageStatus => {
    const key = STAGES[i].key;
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
    if (s === "missing") return "no recorded answer";
    if (s === "running") return STAGES[i].key === "judge" ? "replaying the answer…" : "";
    const e = chat.enrich;
    switch (STAGES[i].key) {
      case "ingest":
        return `${e.nTurns} turns`;
      case "validate": {
        const n = run.validation.checks.filter((c) => c.severity === "error").length;
        return quarantined ? "held back" : `${n} of ${n} checks pass`;
      }
      case "enrich":
        return `identity ${e.gtIdentity} · policy ${e.gtPolicy}`;
      case "prompt":
        return useAlt ? `reason swapped · ${chat.alt.contactReason}` : `~${Math.round((run.prompt.system.length + run.prompt.user.length) / 4).toLocaleString("en-US")} tokens`;
      case "judge":
        return run.judge ? `${shortModel(run.judge.model)} · ${(run.judge.latencyMs / 1000).toFixed(1)} s` : "";
      case "check":
        return run.parse?.ok ? (run.judge?.repaired ? "valid after one fix" : "format valid") : "invalid";
      case "store":
        return run.judge?.source === "stored" ? "5 rows stored" : "preview only";
      case "metrics": {
        if (!run.judge?.output) return "";
        const right = [run.judge.output.intent === e.trueFlow, run.judge.output.identity_verification === e.gtIdentity, run.judge.output.policy_adherence === e.gtPolicy].filter(Boolean).length;
        return `${right}/3 verdicts right`;
      }
    }
  };

  // ── Live call (stage 5) ──────────────────────────────────────────────────
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const liveRunning = live?.phase === "running";
  useEffect(() => {
    if (!liveRunning || !live) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - live.startedAt) / 1000)), 500);
    return () => clearInterval(t);
  }, [liveRunning, live]);

  const cancelLive = useCallback(() => {
    abortRef.current?.abort();
    setLive(null);
  }, []);

  const askLive = useCallback(async () => {
    if (rename) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const key = liveKey;
    setElapsed(0);
    setLive({ key, phase: "running", startedAt: Date.now() });
    const finish = (patch: Partial<LiveState>) => setLive((prev) => (prev && prev.key === key ? { ...prev, ...patch } : prev));
    try {
      const res = await fetch("/api/cx-eval/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ convoId: chatId, model, rubric: "v1", mislabel: useAlt }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        finish({ phase: "fallback", notice: `the server returned an error (${(await res.text()) || res.status}).` });
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
            finish({ phase: "fallback", notice: ev.reason });
          } else if (ev.type === "result") {
            settled = true;
            finish({
              phase: "done",
              result: {
                source: "live",
                model: ev.model,
                rubric: "v1",
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
      if (!settled) finish({ phase: "fallback", notice: "the call ended without an answer." });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      finish({ phase: "fallback", notice: "the connection dropped." });
    }
  }, [rename, liveKey, chatId, model, useAlt]);

  // ── Experiments ──────────────────────────────────────────────────────────
  const stay = () => setFollow(false);
  const actions: DemoActions = {
    setRename: (v) => {
      stay();
      setRename(v);
    },
    setUseAlt: (v) => {
      stay();
      setUseAlt(v);
    },
    setModel: (m) => {
      stay();
      setModel(m);
    },
    goTo: (i) => pickStage(i),
    live: live && live.key === liveKey ? { phase: live.phase, elapsed, result: live.result, notice: live.notice } : null,
    askLive,
    cancelLive,
  };

  const pickChat = (id: string) => {
    abortRef.current?.abort();
    setChatId(id);
    setRename(false);
    setUseAlt(false);
    setModel(MODELS[0].id);
    setLive(null);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const stage = STAGES[selected];
  const j = run.judge;
  const provenance = quarantined
    ? "Nothing was judged: the record was held back at stage 2. The checks run in your browser, using the pipeline's rules."
    : !j
      ? `${shortModel(model)} has no recorded answer for this chat.`
      : j.source === "alt"
        ? `Recorded for this page on ${formatDate(j.judgedAt!)} with the swapped contact reason · judge: ${shortModel(j.model)} · rubric v1`
        : `Recorded run from ${formatDate(j.judgedAt!)} · judge: ${shortModel(j.model)} · rubric v1 (the version in use)`;

  const dot: Record<StageStatus, string> = {
    pending: "border-border bg-surface text-soft",
    running: "border-accent bg-accent-soft text-accent",
    done: "border-[color:var(--cx-good-line)] bg-[color:var(--cx-good-soft)] text-[color:var(--cx-good)]",
    failed: "border-[color:var(--cx-bad-line)] bg-[color:var(--cx-bad-soft)] text-[color:var(--cx-bad)]",
    skipped: "border-dashed border-border bg-transparent text-soft opacity-60",
    missing: "border-dashed border-border-strong bg-surface-muted text-soft",
  };
  const symbol = (s: StageStatus, n: number) => (s === "done" ? "✓" : s === "failed" ? "✗" : String(n));

  function pickStage(i: number) {
    setFollow(false);
    setSelected(i);
  }
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
                onClick={() => pickChat(c.id)}
                className={`min-w-0 rounded-xl border px-3 py-2 text-left text-sm leading-snug ${
                  active ? "border-accent bg-accent-soft text-text" : "border-border bg-surface text-muted hover:border-border-strong hover:text-text"
                }`}
              >
                <span className="font-medium">{c.label}</span>
                <span className="mt-0.5 block truncate font-mono text-[0.65rem] text-soft">
                  {c.id} · {c.enrich.trueFlow.replace(/_/g, " ")}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="max-w-2xl text-sm leading-relaxed text-muted">{blurbOf(chat)}</p>
          <button
            type="button"
            onClick={() => {
              pickChat(chatId);
              setReplays((n) => n + 1);
            }}
            className="shrink-0 rounded text-sm font-medium text-accent underline underline-offset-4 hover:no-underline"
          >
            ↻ Replay this chat
          </button>
        </div>
      </fieldset>

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
                      } ${st === "running" ? "animate-pulse motion-reduce:animate-none" : ""}`}
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
                          st === "running" ? "animate-pulse motion-reduce:animate-none" : ""
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
          <section aria-label={`Stage ${selected + 1}: ${stage.name}`} className="min-w-0 p-4 sm:p-5">
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
                key={`${stage.key}|${chatId}`}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                {statusOf(selected) === "pending" && !visible ? (
                  <p className="text-sm text-soft">Scroll here to replay the run.</p>
                ) : statusOf(selected) === "skipped" ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-soft">
                    Not reached: the record was quarantined at validation, so this stage did not run.
                  </p>
                ) : (
                  <StageDetail stage={stage.key} run={run} actions={actions} />
                )}
              </motion.div>
            </AnimatePresence>
          </section>
        </div>
        <footer className="border-t border-border bg-surface-muted px-4 py-2.5 text-xs leading-relaxed text-soft sm:px-5">{provenance}</footer>
      </div>
    </div>
  );
}
