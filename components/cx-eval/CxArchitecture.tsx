"use client";

import { Fragment, useId, useState } from "react";
import styles from "./architecture.module.css";
import ArchitectureIcon, { type ArchitectureIconKind } from "@/components/wiki-stream/ArchitectureIcon";

// Where each part of the CX evaluation pipeline runs. Laptops and desktops get
// the SVG diagram; phones and tablets get the same flow as a list (below 1024px
// the diagram's text would be too small to read).

type Tone = "brand" | "processing" | "side" | "supabase";

interface Node {
  title: string;
  detail: string;
  host: string;
  hostIcon?: ArchitectureIconKind;
  icon: ArchitectureIconKind;
  tone: Tone;
  x: number;
  y: number;
}

const nodes = {
  chats: { title: "Support chats", detail: "ABCD dataset", host: "Simulated daily batches", icon: "chats", tone: "brand", x: 95, y: 250 },
  load: { title: "Load", detail: "Land the day's raw batch", host: "GitHub Actions", hostIcon: "githubactions", icon: "ingest", tone: "processing", x: 300, y: 125 },
  validate: { title: "Validate & transform", detail: "Schema checks, enrichment", host: "Supabase · SQL", icon: "validate", tone: "processing", x: 530, y: 125 },
  judge: { title: "LLM judge", detail: "Scores against the rubric", host: "gpt-oss-20b", hostIcon: "nvidia", icon: "judge", tone: "processing", x: 760, y: 125 },
  scores: { title: "Scores & marts", detail: "Append-only, versioned", host: "Supabase · Postgres", icon: "supabase", tone: "supabase", x: 760, y: 365 },
  checks: { title: "Checks & alerts", detail: "Drift, volume, freshness", host: "GitHub Actions", hostIcon: "githubactions", icon: "alert", tone: "processing", x: 530, y: 365 },
  quarantine: { title: "Quarantine", detail: "Records that fail checks", host: "Supabase · SQL", icon: "reject", tone: "side", x: 300, y: 365 },
  dashboard: { title: "Dashboard", detail: "This page", host: "Vercel · Next.js", icon: "dashboard", tone: "brand", x: 1000, y: 140 },
  issues: { title: "GitHub Issues", detail: "One issue per incident", host: "GitHub", icon: "github", tone: "brand", x: 1000, y: 400 },
} satisfies Record<string, Node>;

const toneClass: Record<Tone, string> = { brand: styles.brandIcon, processing: styles.processingIcon, side: styles.sideIcon, supabase: styles.supabaseIcon };

// Main links, with the step at which the batch reaches them (drives the animation).
const connections: { d: string; step: number }[] = [
  { d: "M125 250 H180 V125 H262", step: 0 },
  { d: "M338 125 H492", step: 1 },
  { d: "M568 125 H722", step: 2 },
  { d: "M760 232 V327", step: 3 },
  { d: "M722 365 H568", step: 4 },
  { d: "M798 365 H895 V140 H962", step: 4 },
  { d: "M530 472 V512 H920 V400 H962", step: 5 },
];

// Phone and tablet list: main steps in order, each with an optional side output.
const flow: { group?: string; note?: string; main: Node; side?: Node }[] = [
  { group: "Data source", main: nodes.chats },
  { group: "Data pipeline", note: "daily at 06:00 UTC", main: nodes.load },
  { main: nodes.validate, side: nodes.quarantine },
  { main: nodes.judge },
  { main: nodes.scores },
  { main: nodes.checks, side: nodes.issues },
  { group: "Serving", main: nodes.dashboard },
];

function FlowNode({ node, side }: { node: Node; side?: boolean }) {
  return (
    <div className={`${styles.node} ${side ? styles.side : ""}`}>
      <svg className={`${styles.flowIcon} ${toneClass[node.tone]}`} viewBox="0 0 24 24" aria-hidden="true"><ArchitectureIcon kind={node.icon} /></svg>
      <div className="min-w-0">
        <p className="font-mono text-[11px] text-soft">{node.hostIcon === "nvidia" ? `NVIDIA API · ${node.host}` : node.host}</p>
        <h3 className="mt-0.5 text-sm font-semibold text-text">{node.title}</h3>
        <p className="mt-0.5 text-xs text-muted">{node.detail}</p>
      </div>
    </div>
  );
}

export default function CxArchitecture() {
  const id = useId().replace(/:/g, "");
  const [paused, setPaused] = useState(false);
  return (
    <section className={styles.card} aria-labelledby={`${id}-heading`} data-paused={paused}>
      <div className={styles.header}>
        <div className="max-w-3xl">
          <p className="kicker mb-2">Data architecture</p>
          <h2 id={`${id}-heading`} className="text-2xl font-semibold tracking-tight text-text">From support chats to scores and alerts</h2>
          <p className="mt-3 text-sm leading-6 text-muted">Once a day, a scheduled job loads a batch of chats, checks and cleans it in Postgres, and has an LLM score each chat. Checks on the results open GitHub issues when something looks wrong.</p>
        </div>
        <button type="button" className={`${styles.motionButton} pill-link text-xs`} aria-pressed={paused} aria-controls={`${id}-diagram`} onClick={() => setPaused((value) => !value)}>{paused ? "▶ Play animation" : "Ⅱ Pause animation"}</button>
      </div>

      <figure className={styles.figure} id={`${id}-diagram`}>
        <svg className={styles.diagram} viewBox="0 0 1120 540" role="img" aria-labelledby={`${id}-title ${id}-description`}>
          <title id={`${id}-title`}>CX evaluation pipeline architecture</title>
          <desc id={`${id}-description`}>Grouped into data source, data pipeline and serving. Once a day a GitHub Actions job loads a batch of support chats. SQL in Supabase validates and transforms it, sending failed records to quarantine. An LLM judge (gpt-oss-20b on the NVIDIA API) scores each chat, and scores are stored append-only in Supabase with marts built on top. Checks on each run open or close GitHub issues. The dashboard on Vercel shows an exported snapshot of the marts.</desc>
          <defs>
            <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9" fill="none" stroke="var(--soft)" strokeWidth="1.5" /></marker>
          </defs>
          <g aria-hidden="true">
            <path className={styles.divider} d="M190 25 V520 M870 25 V520" />
            <text className={styles.groupTitle} x="95" y="40" textAnchor="middle">DATA SOURCE</text>
            <text className={styles.groupTitle} x="530" y="40" textAnchor="middle">DATA PIPELINE</text>
            <text className={styles.groupNote} x="530" y="60" textAnchor="middle">Daily at 06:00 UTC</text>
            <text className={styles.groupTitle} x="1000" y="40" textAnchor="middle">SERVING</text>
          </g>
          {connections.map(({ d, step }) => <g key={d} aria-hidden="true">
            <path className={styles.connection} d={d} markerEnd={`url(#${id}-arrow)`} />
            <path className={styles.packet} d={d} pathLength="100" style={{ animationDelay: `${step * 1.1}s` }} />
          </g>)}
          <g aria-hidden="true">
            <path className={styles.sideConnection} d="M530 232 V282 H300 V327" markerEnd={`url(#${id}-arrow)`} />
            <text className={styles.edgeLabel} x="415" y="274" textAnchor="middle">Failed records</text>
            <text className={styles.edgeLabel} x="905" y="262">Exported</text>
            <text className={styles.edgeLabel} x="905" y="279">snapshot</text>
            <text className={styles.edgeLabel} x="725" y="504" textAnchor="middle">Open or close an issue</text>
          </g>
          {Object.values(nodes).map((node: Node) => <g key={node.title} aria-hidden="true">
            <svg x={node.x - 30} y={node.y - 30} width="60" height="60" viewBox="0 0 24 24" className={toneClass[node.tone]}><ArchitectureIcon kind={node.icon} /></svg>
            <text className={styles.nodeTitle} x={node.x} y={node.y + 54} textAnchor="middle">{node.title}</text>
            <text className={styles.nodeDetail} x={node.x} y={node.y + 74} textAnchor="middle">{node.detail}</text>
            {node.hostIcon ? <g>
              <svg x={node.x - node.host.length * 3.6 - 9} y={node.y + 83} width="13" height="13" viewBox="0 0 24 24" className={styles.brandIcon}><ArchitectureIcon kind={node.hostIcon} /></svg>
              <text className={styles.nodeHost} x={node.x + 9} y={node.y + 94} textAnchor="middle">{node.host}</text>
            </g> : <text className={styles.nodeHost} x={node.x} y={node.y + 94} textAnchor="middle">{node.host}</text>}
          </g>)}
        </svg>

        <ol className={styles.flow} aria-label="Data flow stages">
          {flow.map(({ group, note, main, side }, index) => <Fragment key={main.title}>
            {group && <li className={styles.group}>{group}{note && <span>· {note}</span>}</li>}
            <li className={styles.row}>
              <FlowNode node={main} />
              {side && <FlowNode node={side} side />}
            </li>
            {index < flow.length - 1 && <li className={styles.link} aria-hidden="true" />}
          </Fragment>)}
        </ol>

        <figcaption className={styles.caption}>
          <span>Daily batch, not a stream</span>
          <span>The &ldquo;Try this&rdquo; box in the demo calls the judge live from Vercel; those answers are not stored. An hourly pg_cron check in Supabase raises an alert if a day&apos;s batch never arrives.</span>
        </figcaption>
      </figure>

      <div className={styles.explanation}>
        <div><h3 className="text-sm font-semibold text-text">Load and check</h3><p className="mt-2 text-sm leading-6 text-muted">A GitHub Actions job lands one day of chats. SQL in Postgres checks each record against the expected fields; records that fail are held in quarantine instead of reaching the judge. The rest are cleaned and enriched.</p></div>
        <div><h3 className="text-sm font-semibold text-text">Score with an LLM</h3><p className="mt-2 text-sm leading-6 text-muted">For each chat, the job builds a prompt from the rubric, sends it to gpt-oss-20b and checks the JSON reply. Failed calls are retried on the next run. Scores are only ever added, each tagged with its rubric and model.</p></div>
        <div><h3 className="text-sm font-semibold text-text">Watch and serve</h3><p className="mt-2 text-sm leading-6 text-muted">Checks look for judge drift, volume drops and quarantine spikes. Each new problem opens a GitHub issue that closes itself when the check clears. This page shows an exported snapshot of the marts.</p></div>
      </div>
    </section>
  );
}
