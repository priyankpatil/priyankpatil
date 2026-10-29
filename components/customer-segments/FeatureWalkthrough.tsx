"use client";

import { useState } from "react";
import { data, FEATURE_LABEL, gbp, int, segmentColor } from "@/lib/customer-segments/data";

// "From transactions to features": one real customer's orders become three
// numbers, which are put on a common scale and compared with each segment's centre.

const STEP_NOTE: Record<string, string> = {
  log: "Log scale, so £100 → £1,000 counts as much as £1,000 → £10,000.",
  capped: "Capped at the 1st and 99th percentile, so one huge account can't pull a segment.",
  scaled: "Standardised: 0 is the typical customer, ±1 is one standard deviation.",
};

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="relative pl-10">
      <span aria-hidden className="absolute left-0 top-0 grid h-7 w-7 place-items-center rounded-full border border-border-strong bg-surface text-xs font-semibold text-text">
        {n}
      </span>
      <h3 className="text-base font-semibold text-text">{title}</h3>
      <div className="mt-3">{children}</div>
    </li>
  );
}

// Formatted by hand: Node and browsers disagree on short month names ("Sept" vs "Sep"), which breaks hydration.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dateLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

export default function FeatureWalkthrough() {
  const [index, setIndex] = useState(0);
  const ex = data.examples[index];
  const nearest = [...ex.distances].sort((a, b) => a.distance - b.distance);
  const maxDistance = Math.max(...ex.distances.map((d) => d.distance));
  const total = ex.orders.reduce((s, o) => s + o.value, 0);

  return (
    <div className="rounded-[22px] border border-border bg-surface p-5 sm:p-7">
      <div role="radiogroup" aria-label="Pick a customer" className="flex flex-wrap gap-2">
        {data.examples.map((e, i) => (
          <button
            key={e.customer_id}
            type="button"
            role="radio"
            aria-checked={i === index}
            onClick={() => setIndex(i)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              i === index ? "border-accent bg-accent-soft font-medium text-text" : "border-border text-muted hover:border-border-strong hover:text-text"
            }`}
          >
            Customer {e.customer_id}
          </button>
        ))}
      </div>

      <ol className="mt-7 flex flex-col gap-9">
        <Step n={1} title={`Their orders in the 12 months before ${dateLabel(data.asOf)}`}>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left text-xs text-soft">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">Invoice</th>
                  <th className="px-3 py-2 text-right font-medium">Products</th>
                  <th className="px-3 py-2 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {ex.orders.map((o) => (
                  <tr key={o.invoice} className="border-t border-border">
                    <td className="whitespace-nowrap px-3 py-1.5 text-muted">{dateLabel(o.date)}</td>
                    <td className="hidden px-3 py-1.5 font-mono text-xs text-muted sm:table-cell">{o.invoice}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted">{o.lines}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-text">{gbp(o.value)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border-strong">
                  <td colSpan={2} className="px-3 py-2 text-xs text-soft">{ex.country}</td>
                  <td className="hidden sm:table-cell" />
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-text">{gbp(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {ex.lines.length > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-soft">
              Latest order includes: {ex.lines.slice(0, 3).map((l) => `${l.quantity} × ${l.description?.toLowerCase() ?? l.stock_code}`).join(", ")}.
            </p>
          )}
        </Step>

        <Step n={2} title="Summarised as three numbers">
          <dl className="grid gap-3 sm:grid-cols-3">
            {ex.steps.map((s) => (
              <div key={s.feature} className="rounded-xl border border-border bg-surface-muted px-4 py-3">
                <dt className="text-xs text-soft">{FEATURE_LABEL[s.feature].label}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums text-text">{FEATURE_LABEL[s.feature].unit(s.raw)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Recency, frequency and spend. Other features (returns, product range, trend) were tested and are used to describe segments, not to form them.
          </p>
        </Step>

        <Step n={3} title="Put on a common scale">
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[19rem] text-xs sm:text-sm">
              <thead className="bg-surface-muted text-left text-xs text-soft">
                <tr>
                  <th className="px-3 py-2 font-medium">Feature</th>
                  <th className="px-3 py-2 text-right font-medium">Value</th>
                  <th className="px-3 py-2 text-right font-medium">Log</th>
                  <th className="px-3 py-2 text-right font-medium">Capped</th>
                  <th className="px-3 py-2 text-right font-medium">Scaled</th>
                </tr>
              </thead>
              <tbody>
                {ex.steps.map((s) => (
                  <tr key={s.feature} className="border-t border-border tabular-nums">
                    <td className="px-3 py-1.5 text-muted">{FEATURE_LABEL[s.feature].short}</td>
                    <td className="px-3 py-1.5 text-right text-muted">{s.feature === "revenue" ? gbp(s.raw) : int(s.raw)}</td>
                    <td className="px-3 py-1.5 text-right text-muted">{s.transformed.toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right text-muted">{s.capped.toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-text">{s.scaled >= 0 ? "+" : ""}{s.scaled.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-2 space-y-1 text-sm leading-relaxed text-muted">
            {Object.entries(STEP_NOTE).map(([k, v]) => (
              <li key={k}><strong className="font-medium capitalize text-text">{k}:</strong> {v}</li>
            ))}
          </ul>
        </Step>

        <Step n={4} title="Compared with each segment's centre">
          <ul className="flex flex-col gap-2.5">
            {ex.distances.map((d) => {
              const seg = data.segments[d.segment];
              const isNearest = d.segment === nearest[0].segment;
              return (
                <li key={d.segment} className="grid grid-cols-[8.5rem_1fr_3rem] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_3rem]">
                  <span className={`truncate ${isNearest ? "font-semibold text-text" : "text-muted"}`}>{seg.name}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface-muted">
                    <span className="block h-full rounded-full" style={{ width: `${(d.distance / maxDistance) * 100}%`, background: segmentColor(d.segment), opacity: isNearest ? 1 : 0.45 }} />
                  </span>
                  <span className="text-right tabular-nums text-muted">{d.distance.toFixed(2)}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Distance in scaled units; shorter is closer. This customer is nearest to{" "}
            <strong className="font-semibold" style={{ color: segmentColor(nearest[0].segment) }}>{data.segments[nearest[0].segment].name}</strong>, then{" "}
            {data.segments[nearest[1].segment].name}.
          </p>
        </Step>
      </ol>
    </div>
  );
}
