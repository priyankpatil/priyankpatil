import type { ReactNode } from "react";
import { data, gbp, int, pct, segmentColor } from "@/lib/customer-segments/data";

// Metrics, in the same group layout as the CX eval page: a short question,
// four tiles, then one chart. Model quality, segment value, next-year check
// (with the RFM-score baseline) and where customers moved.

const totalCustomers = data.segments.reduce((s, x) => s + x.customers, 0);
const totalRevenue = data.segments.reduce((s, x) => s + x.revenue, 0);
const SET_LABEL: Record<string, string> = {
  rfm: "Recency, orders, spend (chosen)",
  rfm_aov: "Recency, orders, typical order",
  rfm_breadth: "+ product range",
  core: "+ return rate",
  wide: "Seven features",
};

const MODEL_URL = "https://github.com/priyankpatil/priyankpatil/blob/master/pipelines/customer-segments/model/model.py";

function Group({ kicker, title, intro, tiles, chart, link }: { kicker: string; title: string; intro: ReactNode; tiles: ReactNode; chart: ReactNode; link?: ReactNode }) {
  return (
    <article className="min-w-0 rounded-[22px] border border-border bg-surface-muted/60 p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="max-w-3xl">
          <p className="kicker mb-2">{kicker}</p>
          <h3 className="text-[clamp(1.2rem,2.2vw,1.5rem)] font-semibold leading-tight tracking-tight text-text">{title}</h3>
        </div>
        {link}
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{intro}</p>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{tiles}</div>
      <div className="mt-5 min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">{chart}</div>
    </article>
  );
}

function Tile({ value, label, caption }: { value: ReactNode; label: string; caption?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-2xl font-semibold tabular-nums tracking-tight text-text">{value}</p>
      <p className="mt-1 text-sm font-medium text-text">{label}</p>
      {caption && <p className="mt-1 text-xs leading-relaxed text-muted">{caption}</p>}
    </div>
  );
}

function ChartHead({ title }: { title: string }) {
  return <p className="mb-3 text-sm font-semibold text-text">{title}</p>;
}

function Bar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(value, 0) * 100}%`, background: color }} />
      </span>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{label}</span>
    </span>
  );
}

function BarTable({ head, rows }: { head: [string, string]; rows: { key: string | number; name: string; color: string; a: [number, string]; b: [number, string] }[] }) {
  return (
    <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-3 text-sm sm:grid-cols-[minmax(0,11rem)_1fr_1fr]">
      <span />
      <span className="text-xs text-soft">{head[0]}</span>
      <span className="text-xs text-soft">{head[1]}</span>
      {rows.map((r) => (
        <div key={r.key} className="contents">
          <span className="truncate text-muted">{r.name}</span>
          <Bar value={r.a[0]} color={r.color} label={r.a[1]} />
          <Bar value={r.b[0]} color={r.color} label={r.b[1]} />
        </div>
      ))}
    </div>
  );
}

function ModelQuality() {
  const m = data.model;
  const chosen = data.model.candidates.filter((c) => c.set === "rfm");
  const atK = data.model.candidates.filter((c) => c.k === m.k);
  const maxSil = Math.max(...data.model.candidates.map((c) => c.silhouette));
  return (
    <Group
      kicker="Model quality"
      title="Are the segments real, or an artefact of the method?"
      link={
        <a href={MODEL_URL} target="_blank" rel="noopener noreferrer" className="pill-link shrink-0 text-xs">
          View the Python model ↗
        </a>
      }
      intro={<>k-means always returns segments, even from noise. These checks were run before choosing: several feature sets, 3 to 8 segments each, each re-fitted on resampled data.</>}
      tiles={
        <>
          <Tile value={m.k} label="Segments" caption="Chosen from 3 to 8" />
          <Tile value={m.silhouette.toFixed(2)} label="Separation" caption="Silhouette score, best for these inputs" />
          <Tile value={m.stability.mean_ari.toFixed(2)} label="Stability" caption={`Agreement over ${m.stability.bootstraps} resamples (1 = identical)`} />
          <Tile value={pct(Math.min(...chosen.filter((c) => c.k === m.k).map((c) => c.smallest_share)))} label="Smallest segment" caption="Share of customers, big enough to act on" />
        </>
      }
      chart={
        <>
          <ChartHead title={`Separation with ${m.k} segments, by feature set`} />
          <ul className="flex flex-col gap-2.5">
            {atK.map((c) => (
              <li key={c.set} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-3 text-sm sm:grid-cols-[minmax(0,15rem)_1fr]">
                <span className={`truncate ${c.set === "rfm" ? "font-semibold text-text" : "text-muted"}`}>{SET_LABEL[c.set] ?? c.set}</span>
                <Bar value={c.silhouette / maxSil} color={c.set === "rfm" ? "var(--accent)" : "var(--border-strong)"} label={c.silhouette.toFixed(2)} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-soft">Silhouette: how much closer customers are to their own segment than to the next one, from −1 to 1. Values from 0.26 to 0.50 are usually read as real but overlapping groups, which is what customers are.</p>
        </>
      }
    />
  );
}

function Value() {
  const champions = data.segments[0];
  const quiet = data.segments[3];
  return (
    <Group
      kicker="Segment value"
      title="Who brings the revenue?"
      intro="Revenue in the twelve months before 1 December 2010, by segment."
      tiles={
        <>
          <Tile value={pct(champions.revenue / totalRevenue)} label={`of revenue from ${champions.name}`} caption={`${pct(champions.customers / totalCustomers)} of customers`} />
          <Tile value={gbp(champions.revenue / champions.customers)} label={`Avg revenue, ${champions.name}`} caption="Per customer, in the year" />
          <Tile value={pct(quiet.customers / totalCustomers)} label={`of customers are ${quiet.name}`} caption={`${pct(quiet.revenue / totalRevenue)} of revenue`} />
          <Tile value={gbp(totalRevenue)} label="Revenue in the year" caption={`${int(totalCustomers)} active customers`} />
        </>
      }
      chart={
        <>
          <ChartHead title="Share of customers and of revenue" />
          <BarTable
            head={["Customers", "Revenue"]}
            rows={data.segments.map((s) => ({
              key: s.segment, name: s.name, color: segmentColor(s.segment),
              a: [s.customers / totalCustomers, pct(s.customers / totalCustomers)],
              b: [s.revenue / totalRevenue, pct(s.revenue / totalRevenue)],
            }))}
          />
        </>
      }
    />
  );
}

function NextYear() {
  const r2 = data.model.r2;
  const maxChurn = Math.max(...data.value.map((v) => v.churn_rate));
  const maxNext = Math.max(...data.value.map((v) => v.next_year_revenue));
  const best = data.value[0];
  const worst = data.value[data.value.length - 1];
  return (
    <Group
      kicker="Validation"
      title="Do the segments predict the next year?"
      intro={
        <>
          Segments were set on 1 December 2010 and checked against what customers did in 2011. A plain RFM score cut into the same {data.model.k} groups is the
          baseline: it predicts spend slightly better, because a single score ranks customers by value well. The segments add the reason behind a middling
          score (new and growing, or regular and slipping away), which decides the action.
        </>
      }
      tiles={
        <>
          <Tile value={pct(best.churn_rate)} label={`of ${data.segments[0].name} stopped buying`} caption={`vs. ${pct(worst.churn_rate)} of ${data.segments[3].name}`} />
          <Tile value={gbp(best.next_year_revenue)} label={`avg 2011 spend, ${data.segments[0].name}`} caption={`vs. ${gbp(worst.next_year_revenue)}, ${data.segments[3].name}`} />
          <Tile value={pct(r2.segments.next_revenue)} label="of 2011 spend explained" caption="By the segments (R², log spend)" />
          <Tile value={pct(r2.rfm_score.r2_next_revenue)} label="explained by RFM score" caption="Baseline, same number of groups" />
        </>
      }
      chart={
        <>
          <ChartHead title="What each segment did in 2011" />
          <BarTable
            head={["Stopped buying", "Average spend"]}
            rows={data.value.map((v) => ({
              key: v.segment, name: data.segments[v.segment].name, color: segmentColor(v.segment),
              a: [v.churn_rate / maxChurn, pct(v.churn_rate)],
              b: [v.next_year_revenue / maxNext, gbp(v.next_year_revenue)],
            }))}
          />
        </>
      }
    />
  );
}

function Migration() {
  const toColumns: (number | "lapsed")[] = [...data.segments.map((s) => s.segment), "lapsed"];
  const rowTotal = (from: number) => data.migration.filter((m) => m.from === from).reduce((s, m) => s + m.customers, 0);
  const cell = (from: number, to: number | "lapsed") => data.migration.find((m) => m.from === from && m.to === to)?.customers ?? 0;
  const share = (from: number, to: number | "lapsed") => cell(from, to) / rowTotal(from);
  return (
    <Group
      kicker="Change over time"
      title="Where were customers a year later?"
      intro={<>Each row is a segment on 1 December 2010; columns show the same customers on 1 December 2011, scored with the same model. &ldquo;Lapsed&rdquo; means no order in between.</>}
      tiles={
        <>
          <Tile value={pct(share(0, 0))} label={`of ${data.segments[0].name} stayed`} caption={`${pct(share(0, 1))} became ${data.segments[1].name}`} />
          <Tile value={pct(share(1, "lapsed"))} label={`of ${data.segments[1].name} lapsed`} caption="The group a check-in is for" />
          <Tile value={pct(share(2, 0) + share(2, 1))} label={`of ${data.segments[2].name} became regulars`} caption={`${data.segments[0].name} or ${data.segments[1].name}`} />
          <Tile value={pct(share(3, "lapsed"))} label={`of ${data.segments[3].name} lapsed`} caption="Not worth heavy spend" />
        </>
      }
      chart={
        <>
          <ChartHead title="2010 segment → 2011 segment" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-soft">
                  <th className="pb-2 pr-3 font-medium">From</th>
                  {toColumns.map((c) => (
                    <th key={c} className="pb-2 text-right font-medium">{c === "lapsed" ? "Lapsed" : data.segments[c].name}</th>
                  ))}
                  <th className="pb-2 pl-3 text-right font-medium">Customers</th>
                </tr>
              </thead>
              <tbody>
                {data.segments.map((s) => (
                  <tr key={s.segment} className="border-t border-border">
                    <th scope="row" className="py-2 pr-3 text-left font-normal text-muted">{s.name}</th>
                    {toColumns.map((c) => {
                      const v = share(s.segment, c);
                      const color = c === "lapsed" ? "var(--soft)" : segmentColor(c);
                      return (
                        <td key={c} className="px-1 py-1 text-right tabular-nums">
                          <span
                            className={`block rounded-md px-2 py-1 ${c === s.segment ? "font-semibold text-text" : "text-muted"}`}
                            style={{ background: `color-mix(in srgb, ${color} ${Math.round(v * 60)}%, transparent)` }}
                          >
                            {pct(v)}
                          </span>
                        </td>
                      );
                    })}
                    <td className="py-2 pl-3 text-right tabular-nums text-soft">{int(rowTotal(s.segment))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      }
    />
  );
}

export default function Results() {
  return (
    <div className="flex flex-col gap-6">
      <ModelQuality />
      <Value />
      <NextYear />
      <Migration />
    </div>
  );
}
