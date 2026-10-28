"use client";

import { useId, useState } from "react";
import styles from "./architecture.module.css";
import ArchitectureIcon, { type ArchitectureIconKind } from "./ArchitectureIcon";

const stages: { title: string; host: string; detail: string; icon: ArchitectureIconKind; x: number; y: number }[] = [
  { title: "Wikipedia edits", host: "Wikimedia EventStreams", detail: "Public article-change stream", icon: "wikipedia", x: 85, y: 230 },
  { title: "Producer", host: "Render", detail: "Capture, validate and trim", icon: "ingest", x: 300, y: 115 },
  { title: "Raw events", host: "Aiven · Apache Kafka", detail: "wiki.edits.raw", icon: "apachekafka", x: 530, y: 115 },
  { title: "Enrichment consumer", host: "Render", detail: "Language and byte change", icon: "enrich", x: 760, y: 115 },
  { title: "Enriched events", host: "Aiven · Apache Kafka", detail: "wiki.edits.enriched", icon: "apachekafka", x: 760, y: 345 },
  { title: "Display consumer", host: "Render", detail: "Aggregate and sample", icon: "aggregate", x: 530, y: 345 },
  { title: "Supabase", host: "Postgres", detail: "Bounded frames and metrics", icon: "supabase", x: 1000, y: 230 },
  { title: "Live dashboard", host: "Vercel · Next.js", detail: "Cached API · 5-second refresh", icon: "dashboard", x: 1000, y: 430 },
];

const connections = [
  "M124 230 H171 V115 H260", "M340 115 H490", "M570 115 H720", "M760 223 V305",
  "M720 345 H570", "M530 453 V500 H887 V230 H960", "M1000 338 V390",
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
        <svg className={styles.diagram} viewBox="0 0 1120 550" role="img" aria-labelledby={`${id}-title ${id}-description`}>
          <title id={`${id}-title`}>Wikipedia streaming data architecture</title>
          <desc id={`${id}-description`}>Icon-based architecture, grouped into data source, data pipeline and serving. Wikimedia edits flow through a producer, a raw Kafka topic, an enrichment consumer, an enriched Kafka topic and a display consumer. The display consumer writes snapshots to Supabase, which serves the Vercel dashboard through a cached API. Rejected records go to a separate dead-letter Kafka topic.</desc>
          <defs>
            <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9" fill="none" stroke="var(--soft)" strokeWidth="1.5" /></marker>
          </defs>
          <g aria-hidden="true">
            <path className={styles.divider} d="M190 25 V526 M870 25 V526" />
            <text className={styles.groupTitle} x="85" y="38" textAnchor="middle">DATA SOURCE</text>
            <text className={styles.groupTitle} x="530" y="38" textAnchor="middle">DATA PIPELINE</text>
            <text className={styles.groupTitle} x="1000" y="38" textAnchor="middle">SERVING</text>
          </g>
          {connections.map((path, index) => <g key={path} aria-hidden="true">
            <path className={styles.connection} d={path} markerEnd={`url(#${id}-arrow)`} />
            <path className={styles.packet} d={path} pathLength="100" style={{ animationDelay: `${index * -1.1}s` }} />
          </g>)}
          <g aria-hidden="true">
            <path className={styles.rejected} d="M300 223 V310" markerEnd={`url(#${id}-arrow)`} />
            <path className={styles.rejected} d="M760 232 H300" />
            <text className={styles.edgeLabel} x="410" y="253">Rejected source / raw records</text>
            <text className={styles.edgeLabel} x="650" y="489">Write display snapshots</text>
            <svg x="274" y="319" width="52" height="52" viewBox="0 0 24 24" className={styles.rejectionIcon}><ArchitectureIcon kind="reject" /></svg>
            <text className={styles.nodeTitle} x="300" y="399" textAnchor="middle">Dead-letter topic</text>
            <text className={styles.nodeDetail} x="300" y="418" textAnchor="middle">wiki.edits.dlq</text>
          </g>
          {stages.map((stage) => <g key={stage.title} aria-hidden="true">
            <svg x={stage.x - 31} y={stage.y - 31} width="62" height="62" viewBox="0 0 24 24" className={stage.icon === "supabase" ? styles.supabaseIcon : stage.icon === "wikipedia" || stage.icon === "apachekafka" || stage.icon === "dashboard" ? styles.brandIcon : styles.processingIcon}><ArchitectureIcon kind={stage.icon} /></svg>
            <text className={styles.nodeTitle} x={stage.x} y={stage.y + 56} textAnchor="middle">{stage.title}</text>
            <text className={styles.nodeDetail} x={stage.x} y={stage.y + 76} textAnchor="middle">{stage.detail}</text>
            {stage.host === "Render" ? <g>
              <svg x={stage.x - 29} y={stage.y + 86} width="10" height="10" viewBox="0 0 24 24" className={styles.brandIcon}><ArchitectureIcon kind="render" /></svg>
              <text className={styles.nodeHost} x={stage.x + 3} y={stage.y + 95} textAnchor="middle">Render</text>
            </g> : <text className={styles.nodeHost} x={stage.x} y={stage.y + 95} textAnchor="middle">{stage.host}</text>}
          </g>)}
        </svg>

        <ol className={styles.mobileDiagram} aria-label="Data flow stages">
          {stages.map((stage, index) => <li key={stage.title} className={styles.mobileStage}>
            {[0, 1, 6].includes(index) && <p className={styles.mobileGroup}>{index === 0 ? "Data source" : index === 1 ? "Data pipeline" : "Serving"}</p>}
            <div className={styles.mobileNode}>
              <svg className={`${styles.mobileIcon} ${stage.icon === "supabase" ? styles.supabaseIcon : stage.icon === "wikipedia" || stage.icon === "apachekafka" || stage.icon === "dashboard" ? styles.brandIcon : styles.processingIcon}`} viewBox="0 0 24 24" aria-hidden="true"><ArchitectureIcon kind={stage.icon} /></svg>
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
