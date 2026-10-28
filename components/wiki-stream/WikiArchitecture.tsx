"use client";

import { useId, useState } from "react";
import styles from "./architecture.module.css";

const stages = [
  { title: "Wikimedia", host: "Public source", detail: "Wikipedia article edits · SSE", x: 24, y: 35 },
  { title: "Producer", host: "Render worker", detail: "Validate and trim each event", x: 306, y: 35 },
  { title: "Raw events", host: "Aiven · Kafka topic", detail: "wiki.edits.raw", x: 588, y: 35 },
  { title: "Enrichment consumer", host: "Render worker", detail: "Add language and byte change", x: 870, y: 35 },
  { title: "Enriched events", host: "Aiven · Kafka topic", detail: "wiki.edits.enriched", x: 870, y: 310 },
  { title: "Display consumer", host: "Render worker", detail: "Aggregate, sample and checkpoint", x: 588, y: 310 },
  { title: "Supabase", host: "Postgres", detail: "Recent frames and minute metrics", x: 306, y: 310 },
  { title: "Live dashboard", host: "Vercel · Next.js", detail: "Cached API · five-second refresh", x: 24, y: 310 },
];

const connections = [
  "M248 90 H306", "M530 90 H588", "M812 90 H870", "M982 145 V310",
  "M870 365 H812", "M588 365 H530", "M306 365 H248",
];

export default function WikiArchitecture() {
  const id = useId().replace(/:/g, "");
  const [paused, setPaused] = useState(false);
  return (
    <section className={styles.card} aria-labelledby={`${id}-heading`} data-paused={paused}>
      <div className={styles.header}>
        <div className="max-w-3xl">
          <p className="kicker mb-2">Data architecture</p>
          <h2 id={`${id}-heading`} className="text-2xl font-semibold tracking-tight text-text">From Wikipedia to the live dashboard</h2>
          <p className="mt-3 text-sm leading-6 text-muted">A producer captures article edits, Kafka buffers the events, and two consumers prepare them for the dashboard. The website reads a small, recent view from Supabase.</p>
        </div>
        <button type="button" className={`${styles.motionButton} pill-link text-xs`} aria-pressed={paused} aria-controls={`${id}-diagram`} onClick={() => setPaused((value) => !value)}>{paused ? "▶ Play animation" : "Ⅱ Pause animation"}</button>
      </div>

      <figure className={styles.figure} id={`${id}-diagram`}>
        <svg className={styles.diagram} viewBox="0 0 1120 455" role="img" aria-labelledby={`${id}-title ${id}-description`}>
          <title id={`${id}-title`}>Wikipedia streaming data architecture</title>
          <desc id={`${id}-description`}>Follow the top row from left to right: Wikimedia, producer, raw Kafka topic, enrichment consumer. Continue down and follow the bottom row from right to left: enriched Kafka topic, display consumer, Supabase, and the live dashboard. Rejected source or raw events go to a dead-letter Kafka topic.</desc>
          <defs>
            <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9" fill="none" stroke="var(--soft)" strokeWidth="1.5" /></marker>
          </defs>
          {connections.map((path, index) => <g key={path} aria-hidden="true">
            <path className={styles.connection} d={path} markerEnd={`url(#${id}-arrow)`} />
            <path className={styles.packet} d={path} pathLength="100" style={{ animationDelay: `${index * -1.1}s` }} />
          </g>)}
          <g aria-hidden="true">
            <path className={styles.rejected} d="M418 145 V243 H460" markerEnd={`url(#${id}-arrow)`} />
            <path className={styles.rejected} d="M982 182 H724 V243 H660" markerEnd={`url(#${id}-arrow)`} />
            <rect className={styles.deadLetter} x="460" y="213" width="200" height="60" rx="12" />
            <text className={styles.deadLetterTitle} x="560" y="238" textAnchor="middle">Rejected records</text>
            <text className={styles.nodeDetail} x="560" y="257" textAnchor="middle">wiki.edits.dlq</text>
          </g>
          {stages.map((stage, index) => <g key={stage.title} aria-hidden="true">
            <rect className={index === 2 || index === 4 ? styles.kafkaNode : styles.node} x={stage.x} y={stage.y} width="224" height="110" rx="14" />
            <text className={styles.nodeHost} x={stage.x + 16} y={stage.y + 24}>{String(index + 1).padStart(2, "0")} / {stage.host}</text>
            <text className={styles.nodeTitle} x={stage.x + 16} y={stage.y + 54}>{stage.title}</text>
            <text className={styles.nodeDetail} x={stage.x + 16} y={stage.y + 80}>{stage.detail}</text>
          </g>)}
        </svg>

        <ol className={styles.mobileDiagram} aria-label="Data flow stages">
          {stages.map((stage, index) => <li key={stage.title} className={styles.mobileStage}>
            <div className={styles.mobileNode}>
              <span className={styles.stageNumber}>{String(index + 1).padStart(2, "0")}</span>
              <div><p className="text-xs text-soft">{stage.host}</p><h3 className="mt-1 text-sm font-semibold text-text">{stage.title}</h3><p className="mt-1 text-xs text-muted">{stage.detail}</p></div>
            </div>
            {index < stages.length - 1 && <div className={styles.mobileLink} aria-hidden="true"><span /></div>}
          </li>)}
          <li className="mt-3 rounded-xl border border-border bg-surface-muted p-4 text-xs leading-5 text-muted">Rejected source or raw events go to the separate <code>wiki.edits.dlq</code> Kafka topic.</li>
        </ol>
        <figcaption className={styles.caption}><span>Illustrative data flow</span><span>All Kafka topics share one Aiven service. The producer and consumers run in one Render container.</span></figcaption>
      </figure>

      <div className={styles.explanation}>
        <div><h3 className="text-sm font-semibold text-text">Capture and buffer</h3><p className="mt-2 text-sm leading-6 text-muted">The producer selects Wikipedia article changes and keeps only the fields this project needs. Kafka stores raw and enriched events in separate topics, allowing capture and processing to run independently.</p></div>
        <div><h3 className="text-sm font-semibold text-text">Enrich and aggregate</h3><p className="mt-2 text-sm leading-6 text-muted">One consumer adds language and article-size changes. The display consumer builds activity counts, editing-burst candidates and sampled feed batches. It saves its state before acknowledging Kafka offsets.</p></div>
        <div><h3 className="text-sm font-semibold text-text">Store and serve a small view</h3><p className="mt-2 text-sm leading-6 text-muted">Supabase keeps a ten-minute ring of feed frames and 24 hours of minute summaries. Vercel serves a cached API response every five seconds, and the browser gradually displays the sampled edits.</p></div>
      </div>
    </section>
  );
}
