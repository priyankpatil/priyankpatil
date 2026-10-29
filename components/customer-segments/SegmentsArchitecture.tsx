import ArchitectureIcon, { type ArchitectureIconKind } from "@/components/wiki-stream/ArchitectureIcon";

// Where each part runs. A plain flow, not the animated diagram on the CX eval
// and wiki-stream pages: this pipeline runs on demand, once, over historical data.
// Four columns on laptops, two on tablets, one on phones.

const STEPS: { title: string; detail: string; host: string; icon: ArchitectureIconKind; tone: "brand" | "processing" | "supabase" }[] = [
  { title: "Online Retail II", detail: "1.07M order lines, 2009–2011", host: "UCI repository", icon: "chats", tone: "brand" },
  { title: "Load", detail: "Download, read the workbook, land raw rows", host: "TypeScript script", icon: "ingest", tone: "processing" },
  { title: "Clean", detail: "Five rules, each logged with its row count", host: "Supabase · SQL", icon: "validate", tone: "processing" },
  { title: "Features", detail: "One row per customer per snapshot, no look-ahead", host: "Supabase · SQL", icon: "supabase", tone: "supabase" },
  { title: "Segment", detail: "k-means, choice of k, stability, RFM baseline", host: "TypeScript script", icon: "aggregate", tone: "processing" },
  { title: "Export", detail: "Profiles, results and model as a small JSON file", host: "TypeScript script", icon: "scores", tone: "processing" },
  { title: "This page", detail: "Static page; the classifier runs in your browser", host: "Vercel · Next.js", icon: "dashboard", tone: "brand" },
];

const TONE = { brand: "text-text", processing: "text-accent", supabase: "text-[#239d70] dark:text-[#3ecf8e]" };

export default function SegmentsArchitecture() {
  return (
    <div className="rounded-[22px] border border-border bg-surface p-5 sm:p-7">
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Pipeline steps in order">
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative flex items-start gap-3.5 rounded-2xl border border-border bg-surface-muted p-4">
            <svg viewBox="0 0 24 24" aria-hidden className={`h-9 w-9 shrink-0 ${TONE[s.tone]}`}><ArchitectureIcon kind={s.icon} /></svg>
            <div className="min-w-0">
              <p className="font-mono text-[0.68rem] text-soft">{i + 1} · {s.host}</p>
              <h3 className="mt-0.5 text-sm font-semibold text-text">{s.title}</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs leading-relaxed text-soft">
        Runs on demand, not on a schedule: the data is historical. After cleaning, the raw rows are deleted to keep the database small; the cleaning log keeps the counts.
      </p>
    </div>
  );
}
