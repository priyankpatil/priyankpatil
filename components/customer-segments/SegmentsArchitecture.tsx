"use client";

import { Fragment, useId, useState } from "react";
import styles from "@/components/cx-eval/architecture.module.css";
import ArchitectureIcon, { type ArchitectureIconKind } from "@/components/wiki-stream/ArchitectureIcon";

// Where each part of the customer segments pipeline runs, in the same visual
// language as the CX eval and wiki-stream diagrams. Laptops and desktops get the
// SVG diagram; phones and tablets get the same flow as a list (below 1024px the
// diagram's text would be too small to read).

type Tone = "brand" | "processing" | "side" | "supabase";

interface Node {
  title: string;
  detail: string;
  host: string;
  icon: ArchitectureIconKind;
  tone: Tone;
  x: number;
  y: number;
}

const nodes = {
  source: { title: "Online Retail II", detail: "1.07M order lines", host: "UCI repository", icon: "sheet", tone: "brand", x: 95, y: 250 },
  load: { title: "Load", detail: "Read the workbook, land rows", host: "TypeScript script", icon: "ingest", tone: "processing", x: 300, y: 125 },
  clean: { title: "Clean", detail: "Five rules, each one logged", host: "Supabase · SQL", icon: "validate", tone: "processing", x: 530, y: 125 },
  features: { title: "Features", detail: "13 snapshots, no look-ahead", host: "Supabase · Postgres", icon: "supabase", tone: "supabase", x: 760, y: 125 },
  segment: { title: "Segment", detail: "k-means, stability, baseline", host: "TypeScript script", icon: "cluster", tone: "processing", x: 760, y: 365 },
  export: { title: "Export", detail: "Profiles, results, centroids", host: "JSON · 69 KB", icon: "file", tone: "processing", x: 530, y: 365 },
  log: { title: "Cleaning log", detail: "Rows removed, by rule", host: "Supabase · SQL", icon: "reject", tone: "side", x: 300, y: 365 },
  page: { title: "This page", detail: "Static, no database calls", host: "Vercel · Next.js", icon: "dashboard", tone: "brand", x: 1000, y: 140 },
  classifier: { title: "Classifier", detail: "Nearest segment centre", host: "Your browser", icon: "target", tone: "processing", x: 1000, y: 400 },
} satisfies Record<string, Node>;

const toneClass: Record<Tone, string> = { brand: styles.brandIcon, processing: styles.processingIcon, side: styles.sideIcon, supabase: styles.supabaseIcon };

// Main links, with the step at which the run reaches them (drives the animation).
const connections: { d: string; step: number }[] = [
  { d: "M125 250 H180 V125 H262", step: 0 },
  { d: "M338 125 H492", step: 1 },
  { d: "M568 125 H722", step: 2 },
  { d: "M760 232 V327", step: 3 },
  { d: "M722 365 H568", step: 4 },
  { d: "M530 472 V512 H905 V140 H962", step: 5 },
  { d: "M1000 247 V362", step: 6 },
];

// Phone and tablet list: main steps in order, each with an optional side output.
const flow: { group?: string; note?: string; main: Node; side?: Node }[] = [
  { group: "Data source", main: nodes.source },
  { group: "Data pipeline", note: "run on demand", main: nodes.load },
  { main: nodes.clean, side: nodes.log },
  { main: nodes.features },
  { main: nodes.segment },
  { main: nodes.export },
  { group: "Serving", main: nodes.page },
  { main: nodes.classifier },
];

function FlowNode({ node, side }: { node: Node; side?: boolean }) {
  return (
    <div className={`${styles.node} ${side ? styles.side : ""}`}>
      <svg className={`${styles.flowIcon} ${toneClass[node.tone]}`} viewBox="0 0 24 24" aria-hidden="true"><ArchitectureIcon kind={node.icon} /></svg>
      <div className="min-w-0">
        <p className="font-mono text-[11px] text-soft">{node.host}</p>
        <h3 className="mt-0.5 text-sm font-semibold text-text">{node.title}</h3>
        <p className="mt-0.5 text-xs text-muted">{node.detail}</p>
      </div>
    </div>
  );
}

export default function SegmentsArchitecture() {
  const id = useId().replace(/:/g, "");
  const [paused, setPaused] = useState(false);
  return (
    <section className={styles.card} aria-labelledby={`${id}-heading`} data-paused={paused}>
      <div className={styles.header}>
        <div className="max-w-3xl">
          <p className="kicker mb-2">Data architecture</p>
          <h2 id={`${id}-heading`} className="text-2xl font-semibold tracking-tight text-text">From a spreadsheet to a classifier in your browser</h2>
          <p className="mt-3 text-sm leading-6 text-muted">A script loads the workbook into Postgres, where SQL cleans it and builds one row of features per customer. A second script finds the segments, and a third exports a small file the page reads.</p>
        </div>
        <button type="button" className={`${styles.motionButton} pill-link text-xs`} aria-pressed={paused} aria-controls={`${id}-diagram`} onClick={() => setPaused((value) => !value)}>{paused ? "▶ Play animation" : "Ⅱ Pause animation"}</button>
      </div>

      <figure className={styles.figure} id={`${id}-diagram`}>
        <svg className={styles.diagram} viewBox="0 0 1120 540" role="img" aria-labelledby={`${id}-title ${id}-description`}>
          <title id={`${id}-title`}>Customer segments pipeline architecture</title>
          <desc id={`${id}-description`}>Grouped into data source, data pipeline and serving. A TypeScript script loads the Online Retail II workbook from UCI into Supabase. SQL cleans it, logging the rows each rule removes, and builds 13 feature snapshots. A TypeScript script runs k-means and checks the result, then an export script writes a small JSON file. The static page on Vercel reads it, and the classifier runs in the browser.</desc>
          <defs>
            <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9" fill="none" stroke="var(--soft)" strokeWidth="1.5" /></marker>
          </defs>
          <g aria-hidden="true">
            <path className={styles.divider} d="M190 25 V520 M870 25 V520" />
            <text className={styles.groupTitle} x="95" y="40" textAnchor="middle">DATA SOURCE</text>
            <text className={styles.groupTitle} x="530" y="40" textAnchor="middle">DATA PIPELINE</text>
            <text className={styles.groupNote} x="530" y="60" textAnchor="middle">Run on demand</text>
            <text className={styles.groupTitle} x="1000" y="40" textAnchor="middle">SERVING</text>
          </g>
          {connections.map(({ d, step }) => <g key={d} aria-hidden="true">
            <path className={styles.connection} d={d} markerEnd={`url(#${id}-arrow)`} />
            <path className={styles.packet} d={d} pathLength="100" style={{ animationDelay: `${step * 1.1}s` }} />
          </g>)}
          <g aria-hidden="true">
            <path className={styles.sideConnection} d="M530 232 V282 H300 V327" markerEnd={`url(#${id}-arrow)`} />
            <text className={styles.edgeLabel} x="415" y="274" textAnchor="middle">Removed rows, counted</text>
            <text className={styles.edgeLabel} x="725" y="504" textAnchor="middle">segments.json</text>
            <text className={styles.edgeLabel} x="1012" y="310">Centroids</text>
            <text className={styles.edgeLabel} x="1012" y="327">and scaler</text>
          </g>
          {Object.values(nodes).map((node: Node) => <g key={node.title} aria-hidden="true">
            <svg x={node.x - 30} y={node.y - 30} width="60" height="60" viewBox="0 0 24 24" className={toneClass[node.tone]}><ArchitectureIcon kind={node.icon} /></svg>
            <text className={styles.nodeTitle} x={node.x} y={node.y + 54} textAnchor="middle">{node.title}</text>
            <text className={styles.nodeDetail} x={node.x} y={node.y + 74} textAnchor="middle">{node.detail}</text>
            <text className={styles.nodeHost} x={node.x} y={node.y + 94} textAnchor="middle">{node.host}</text>
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
          <span>Historical data, run once</span>
          <span>No schedule: the orders end in December 2011. After cleaning, the raw rows are deleted to keep the database small; the cleaning log keeps the counts.</span>
        </figcaption>
      </figure>

      <div className={styles.explanation}>
        <div><h3 className="text-sm font-semibold text-text">Load and clean</h3><p className="mt-2 text-sm leading-6 text-muted">A script downloads the workbook from UCI and lands every row in Postgres. Five SQL rules remove duplicates, rows with no customer, non-product lines and adjustments, and move cancellations aside for the return rate.</p></div>
        <div><h3 className="text-sm font-semibold text-text">Features and segments</h3><p className="mt-2 text-sm leading-6 text-muted">SQL builds one row per customer for each snapshot date, using only earlier orders. A script compares feature sets and segment counts, checks stability and next-year results, and stores the chosen model.</p></div>
        <div><h3 className="text-sm font-semibold text-text">Export and serve</h3><p className="mt-2 text-sm leading-6 text-muted">The export writes profiles, results and the segment centres to a 69 KB file. The page is static; the classifier applies the same scaling as training and finds the nearest centre in your browser.</p></div>
      </div>
    </section>
  );
}
