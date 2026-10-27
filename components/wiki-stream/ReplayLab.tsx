"use client";

import { useEffect, useState } from "react";
import capture from "@/lib/wiki-stream/recorded.json";
import { replayProgress } from "@/lib/wiki-stream/replay";
import type { DisplayEdit } from "@/lib/wiki-stream/types";
import styles from "./wiki-stream.module.css";

const edits = capture.edits as DisplayEdit[];

export default function ReplayLab() {
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    if (!playing || position >= edits.length) return;
    const timer = setTimeout(() => setPosition((p) => Math.min(edits.length, p + 1)), 700 / speed);
    return () => clearTimeout(timer);
  }, [playing, position, speed]);
  const progress = replayProgress(edits, position);
  const current = edits[Math.max(0, position - 1)];
  const done = position === edits.length;
  return <section className={`${styles.replay} mt-5`} aria-labelledby="replay-heading">
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div className="max-w-xl"><p className="kicker mb-2">Replay lab</p><h2 id="replay-heading" className="text-2xl font-semibold tracking-tight">A consumer can take its time.</h2><p className="mt-3 text-sm leading-6 text-muted">Play a real Kafka sample, pause its consumer, then catch up. The live pipeline above keeps running independently.</p></div>
      <span className={styles.count}>{edits.length} sampled records · captured {capture.capturedAt.slice(0, 10)}</span>
    </div>
    <div className={styles.replayGrid}>
      <div className={styles.partitions}>
        {progress.map((p) => <div key={p.partition} className={styles.partition}>
          <div className="mb-3 flex items-center justify-between gap-3 text-xs"><span className="font-mono text-muted">Partition {p.partition}</span><span className="text-soft">{p.remaining} sampled records left</span></div>
          <div className={styles.recordTrack} aria-label={`Partition ${p.partition}: ${p.consumed} of ${p.total} sample records consumed`}>{Array.from({ length: p.total }, (_, i) => <span key={i} className={i < p.consumed ? styles.consumed : ""} />)}</div>
          <p className="mt-3 break-all font-mono text-xs text-soft">Next offset {p.nextOffset}</p>
        </div>)}
      </div>
      <div className={styles.replayOutput}>
        <p className="kicker mb-3">{position ? "Consumer output" : "Ready to consume"}</p>
        <p className="min-h-12 break-words text-lg font-medium">{position ? current.title : "A recorded Kafka sample is ready to replay."}</p>
        <p className="mt-3 font-mono text-xs text-soft">{position ? `${current.wiki} · partition ${current.partition} · offset ${current.offset}` : "Press play to advance this isolated replay."}</p>
      </div>
    </div>
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <button type="button" className="pill-link primary text-xs" onClick={() => { if (done) setPosition(0); setPlaying((p) => done ? true : !p); }}>{done ? "↻ Replay" : playing ? "Ⅱ Pause consumer" : "▶ Play consumer"}</button>
      <button type="button" className="pill-link text-xs" disabled={!position && !playing} onClick={() => { setPosition(0); setPlaying(false); }}>Reset</button>
      <label className="ml-auto flex items-center gap-2 text-xs text-muted">Playback speed<select aria-label="Replay speed" className="rounded-lg border border-border bg-surface px-2 py-2 text-text" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}><option value={1}>1×</option><option value={4}>4× catch-up</option></select></label>
    </div>
    <p className="mt-5 text-xs leading-5 text-soft">This browser replay uses recorded, sampled records with real enriched-topic offsets. Gaps reflect sampling. The remaining count is sample backlog, not live broker lag; no live consumer group is paused or reset.</p>
  </section>;
}
