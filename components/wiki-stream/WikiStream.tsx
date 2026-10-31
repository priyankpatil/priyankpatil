"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { articleUrl, type DisplayEdit, type WikiFrame, type WikiResponse } from "@/lib/wiki-stream/types";
import { previewCapturedAt, previewEdits, previewFrame } from "@/lib/wiki-stream/preview";
import styles from "./wiki-stream.module.css";
import { shouldAutoWake } from "@/lib/wiki-stream/wake-policy";

const editions: Record<string, string> = { en: "English", de: "German", fr: "French", es: "Spanish", ja: "Japanese", zh: "Chinese", ru: "Russian", ar: "Arabic", vi: "Vietnamese", ce: "Chechen", bg: "Bulgarian", pl: "Polish", ca: "Catalan", bn: "Bengali", nl: "Dutch", ko: "Korean", ta: "Tamil", cs: "Czech", fa: "Persian", it: "Italian", ceb: "Cebuano" };
const language = (wiki: string) => { const code = wiki.replace(/wiki$/, ""); return editions[code] ?? code.toUpperCase(); };
const number = (value: number) => value.toLocaleString("en-US");
const time = (value: number) => new Date(value).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function Sparkline({ frame }: { frame: WikiFrame }) {
  const max = Math.max(1, ...frame.activity.map((m) => m.count));
  return <div className={styles.sparkline} aria-label="Article edits per minute over the recent window">
    {frame.activity.length ? frame.activity.map((m) => <div key={m.minute} style={{ height: `${Math.max(4, m.count / max * 100)}%` }} title={`${time(m.minute)} · ${m.count} edits`} />) : <p className="self-center text-xs text-soft">Activity builds as the Kafka consumer runs.</p>}
  </div>;
}

// Placeholder rows shaped like edits while the worker wakes; real edits replace them as they arrive.
function FeedLoading({ elapsed }: { elapsed: number }) {
  return <div>
    <div className={styles.loadingHead}>
      <span className={styles.pulse} aria-hidden="true" />
      <div role="status"><p className="text-sm font-medium">Starting the stream…</p><p className="mt-1 text-xs leading-5 text-muted">The server was asleep. New Wikipedia edits usually show up within a minute.</p></div>
      <span className={styles.count} aria-hidden="true">{clock(elapsed)}</span>
    </div>
    {Array.from({ length: 6 }, (_, i) => <div key={i} className={styles.skeleton} style={{ "--i": i } as CSSProperties} aria-hidden="true">
      <span /><span><i style={{ width: `${55 + (i * 37) % 35}%` }} /><i /></span><span />
    </div>)}
  </div>;
}

function FeedIdle({ retry, onStart }: { retry: boolean; onStart: () => void }) {
  return <div className={styles.idle}>
    <span className={styles.restingDot} aria-hidden="true" />
    <p className="text-base font-semibold">{retry ? "The live feed hasn’t resumed yet" : "The live stream is resting"}</p>
    <p className="max-w-sm text-sm leading-6 text-muted">{retry ? "Waking it can occasionally take longer. Try starting it again." : "Start it to pull fresh edits from Wikipedia’s public feed through the pipeline. It takes about a minute, then edits appear here on their own."}</p>
    <button type="button" className="pill-link primary mt-2 text-sm" onClick={onStart}>{retry ? "Try again" : "▶ Start live feed"}</button>
  </div>;
}

export default function WikiStream() {
  const [response, setResponse] = useState<WikiResponse>({ mode: "preview", frame: null });
  const [feed, setFeed] = useState<DisplayEdit[]>(previewFrame.edits.slice(0, 6));
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [edition, setEdition] = useState("all");
  const [humans, setHumans] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [wakeState, setWakeState] = useState<"idle" | "requesting" | "waiting" | "retry">("idle");
  const [wakeStartedAt, setWakeStartedAt] = useState<number | null>(null);
  // Dev only: ?feed=idle|loading|retry holds the empty feed in that state without polling or waking the pipeline.
  const [forced, setForced] = useState<"idle" | "loading" | "retry" | null>(null);
  const wakeAttempted = useRef(false);
  const wakeController = useRef<AbortController | null>(null);
  const hasFreshFeed = useRef(false);
  const queue = useRef<DisplayEdit[]>([]);
  const known = useRef(new Set(previewFrame.edits.slice(0, 6).map((e) => e.id)));
  const previewIndex = useRef(6);
  const contentMode = useRef("preview");
  const frame = response.frame ?? previewFrame;
  const recorded = !response.frame;
  const stale = Boolean(response.frame && (response.mode === "stale" || (now !== null && now - response.frame.at > 30_000)));
  const running = !paused && visible && !forced;

  const startLiveFeed = useCallback(async () => {
    if (wakeController.current) return;
    wakeAttempted.current = true;
    const controller = new AbortController();
    wakeController.current = controller;
    setWakeState("requesting");
    setWakeStartedAt(Date.now());
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const result = await fetch("/api/wiki-stream/wake", { method: "POST", signal: controller.signal });
      setWakeState(hasFreshFeed.current ? "idle" : result.ok ? "waiting" : "retry");
    } catch { setWakeState(hasFreshFeed.current ? "idle" : "retry"); }
    finally { clearTimeout(timeout); wakeController.current = null; }
  }, []);

  useEffect(() => () => { wakeController.current?.abort(); }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const state = new URLSearchParams(window.location.search).get("feed");
    if (state === "idle" || state === "loading" || state === "retry") { setForced(state); setFeed([]); setWakeStartedAt(Date.now()); }
  }, []);

  useEffect(() => {
    if (forced !== "loading") return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [forced]);

  useEffect(() => {
    if (wakeState !== "waiting") return;
    const timer = setTimeout(() => setWakeState("retry"), 90_000);
    return () => clearTimeout(timer);
  }, [wakeState]);

  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update); update();
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (!running) return;
    queue.current = [];
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await fetch("/api/wiki-stream", { signal: controller.signal, cache: "no-store" });
        if (!result.ok) throw new Error("Feed unavailable");
        const next = await result.json() as WikiResponse;
        if (controller.signal.aborted) return;
        const currentMode = next.frame ? "pipeline" : "preview";
        if (contentMode.current !== currentMode) { queue.current = []; known.current.clear(); setFeed([]); }
        contentMode.current = currentMode;
        setResponse(next);
        hasFreshFeed.current = Boolean(next.mode === "live" && next.frame && Date.now() - next.frame.at <= 30_000);
        if (shouldAutoWake(next) && !wakeAttempted.current) void startLiveFeed();
        else if (hasFreshFeed.current) setWakeState("idle");
        if (next.mode === "budget") return;
        if (next.frame) {
          for (const edit of next.frame.edits) if (!known.current.has(edit.id)) { known.current.add(edit.id); queue.current.push(edit); }
          queue.current = queue.current.slice(-30);
          if (known.current.size > 500) known.current = new Set([...known.current].slice(-200));
        }
      } catch { if (!controller.signal.aborted) setResponse((old) => ({ ...old, mode: old.frame ? "stale" : "unavailable" })); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 5000);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [running, startLiveFeed]);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setNow(Date.now());
      let edit: DisplayEdit | undefined;
      if (recorded) { edit = previewEdits[previewIndex.current++ % previewEdits.length]; }
      else if (!stale) edit = queue.current.shift();
      if (edit) { const next = edit; setFeed((old) => [next, ...old.filter((e) => e.id !== next.id)].slice(0, 40)); }
    }, 650);
    return () => clearInterval(interval);
  }, [running, recorded, stale]);

  const filtered = useMemo(() => feed.filter((e) => (edition === "all" || e.wiki === edition) && (!humans || !e.bot)), [feed, edition, humans]);
  const editionOptions = [...new Set([...frame.languages.map((l) => l.wiki), ...feed.map((e) => e.wiki), ...(edition === "all" ? [] : [edition])])].sort();
  const maxLanguage = Math.max(1, ...frame.languages.map((l) => l.count));
  const botPct = frame.stats.events ? Math.round(frame.stats.bots / frame.stats.events * 100) : 0;
  const wake = forced === "loading" ? "waiting" : forced ?? wakeState;
  const starting = wake === "requesting" || wake === "waiting";
  const canStart = Boolean(forced) || (!paused && response.mode !== "budget" && (stale || response.mode === "unavailable" || wake !== "idle"));
  const start = () => { if (forced) { setForced("loading"); setWakeStartedAt(Date.now()); } else void startLiveFeed(); };
  const elapsed = starting && wakeStartedAt && now ? Math.max(0, Math.floor((now - wakeStartedAt) / 1000)) : 0;
  const status = paused ? "Display paused" : recorded ? "Recorded Kafka run" : stale ? "Last received batch" : "Live from the pipeline";

  return <div className={styles.dashboard}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`${styles.status} ${!recorded && !stale && !paused ? styles.live : ""}`}><span />{status}</span>
        <span className="text-xs text-soft">{recorded ? `Captured ${previewCapturedAt.slice(0, 10)} · replaying recorded events` : `${now ? time(frame.at) : "Latest batch"} · refreshes every 5 seconds`}</span>
      </div>
      <button type="button" className="pill-link text-xs" onClick={() => setPaused((p) => !p)}>{paused ? "▶ Resume display" : "Ⅱ Pause display"}</button>
    </div>

    <div className={styles.stats}>
      <div><p>Article edits observed</p><strong>{number(frame.stats.events)}</strong><span>{recorded ? "Pipeline total at the time of recording" : "Accepted edits across active capture windows"}</span></div>
      <div><p>Human / bot</p><strong>{100 - botPct}<small>%</small> <i>/</i> {botPct}<small>%</small></strong><span>Using Wikimedia’s bot flag</span></div>
      <div><p>Source → storage</p><strong>{frame.pipeline.sourceToSinkMs === null ? "—" : `${(frame.pipeline.sourceToSinkMs / 1000).toFixed(1)}`}<small>{frame.pipeline.sourceToSinkMs === null ? "" : " sec"}</small></strong><span>{recorded ? "Measured during the recorded Kafka run" : "Latest sampled event · includes delivery delay"}</span></div>
    </div>

    <div className={styles.mainGrid}>
      <section className={styles.feedPanel} aria-labelledby="wiki-feed-heading">
        <div className={styles.panelHeader}><div><p className="kicker mb-1">The world is editing</p><h2 id="wiki-feed-heading" className="text-xl font-semibold">The edit stream</h2></div><span className={styles.count}>{Math.min(filtered.length, 12)} on screen</span></div>
        <div className={styles.filters}>
          <label className="sr-only" htmlFor="wiki-language">Language edition</label>
          <select id="wiki-language" value={edition} onChange={(e) => setEdition(e.target.value)}><option value="all">All editions</option>{editionOptions.map((wiki) => <option key={wiki} value={wiki}>{language(wiki)}</option>)}</select>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted"><input type="checkbox" checked={humans} onChange={(e) => setHumans(e.target.checked)} /> Humans only</label>
          <span className="ml-auto text-xs text-soft">Open an article on Wikipedia ↗</span>
        </div>
        {feed.length > 0 && canStart && <div className={styles.notice}>
          {starting ? <span className={styles.pulse} aria-hidden="true" /> : <span className={styles.restingDot} aria-hidden="true" />}
          <p role="status">{starting ? "Starting the stream… New Wikipedia edits usually show up within a minute."
            : wake === "retry" ? "The live feed hasn’t resumed yet."
            : recorded ? "The live stream is resting, so this is a recorded sample." : "The live stream is resting. These are the last edits it received."}</p>
          {starting ? <span className={styles.count} aria-hidden="true">{clock(elapsed)}</span>
            : <button type="button" className="pill-link text-xs" onClick={start}>{wake === "retry" ? "Try again" : "▶ Start live feed"}</button>}
        </div>}
        <div className={styles.feed} role="region" aria-label="Sampled Wikipedia edits" tabIndex={0}>
          {filtered.slice(0, 12).map((edit) => <a key={edit.id} className={styles.edit} href={articleUrl(edit)} target="_blank" rel="noopener noreferrer" aria-label={`Read ${edit.title} on ${language(edit.wiki)} Wikipedia (opens in a new tab)`}>
            <span className={styles.languageCode}>{edit.wiki.replace(/wiki$/, "").slice(0, 3)}</span>
            <span className="min-w-0"><span className="flex items-center gap-2"><span className={styles.articleTitle}>{edit.title}</span>{edit.kind === "new" && <span className={styles.newBadge}>NEW</span>}</span><span className={styles.editMeta}>{language(edit.wiki)} <span>·</span> {edit.bot ? "Bot" : "Human"} <span>·</span> {now ? time(edit.timestamp) : "Source timestamp"}</span></span>
            <span className={`${styles.delta} ${edit.delta < 0 ? styles.negative : ""}`}>{edit.delta >= 0 ? "+" : ""}{number(edit.delta)}<small> bytes</small></span>
          </a>)}
          {!filtered.length && (feed.length
            ? <div className="p-10 text-center text-sm text-muted"><p>No edits in this view yet.</p><button type="button" className="pill-link mt-4 text-xs" onClick={() => { setEdition("all"); setHumans(false); }}>Show all edits</button></div>
            : starting ? <FeedLoading elapsed={elapsed} />
            : canStart ? <FeedIdle retry={wake === "retry"} onStart={start} />
            : <p className="p-10 text-center text-sm text-muted">{response.mode === "budget" ? "The live feed has used today’s free read budget. It returns tomorrow." : "Waiting for the next batch of edits…"}</p>)}
        </div>
        <div className={styles.feedFooter}><span>Sampled article edits · select an article to open Wikipedia</span><span>{recorded ? "Recorded source data" : "Up to 10 edits / batch"}</span></div>
      </section>

      <aside className="flex min-w-0 flex-col gap-5">
        <section className={styles.sidePanel}><p className="kicker mb-2">Across the editions</p><h2 className="mb-5 text-lg font-semibold">Languages in motion</h2>
          {frame.languages.map((l, index) => <div key={l.wiki} className={styles.languageRow}><div><span>{language(l.wiki)}</span><span>{number(l.count)}</span></div><div className={styles.track}><div style={{ width: `${l.count / maxLanguage * 100}%`, opacity: 1 - index * 0.11 }} /></div></div>)}
          <p className="mt-4 text-xs text-soft">{recorded ? "Counts from the recorded pipeline window" : "Edits in the current and four preceding minute buckets"}</p>
        </section>
        <section className={styles.sidePanel}><p className="kicker mb-2">Editing bursts</p><h2 className="mb-3 text-lg font-semibold">Heating up</h2>
          {frame.trending.length ? frame.trending.map((page) => <a key={`${page.wiki}:${page.title}`} href={articleUrl(page)} target="_blank" rel="noopener noreferrer" className={styles.trending}><span>{page.title} ↗</span><small>{page.count} edits · previous window {page.previous}</small></a>) : <p className="text-sm leading-6 text-muted">Watching for pages with at least 3 edits and twice their previous window’s activity.</p>}
          <p className="mt-4 text-xs leading-5 text-soft">Two adjacent 5-minute bucket windows. A bounded candidate set, not an exhaustive ranking. Activity is not a news signal.</p>
        </section>
      </aside>
    </div>

    <section className={`${styles.sidePanel} mt-5 grid gap-6 md:grid-cols-[1fr_2fr]`}>
      <div><p className="kicker mb-2">The stream’s pulse</p><h2 className="text-lg font-semibold">Recent edit activity</h2><p className="mt-2 text-xs leading-5 text-soft">Event-time minute buckets; events over one minute late remain in totals. Tallies cover accepted Wikipedia article edits.</p></div><Sparkline frame={frame} />
    </section>
  </div>;
}
