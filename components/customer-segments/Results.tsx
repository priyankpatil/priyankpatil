import { data, gbp, int, pct, segmentColor } from "@/lib/customer-segments/data";

// "Did it work": revenue concentration, what each segment did the next year
// (with the RFM-score baseline), and where customers moved.

const totalCustomers = data.segments.reduce((s, x) => s + x.customers, 0);
const totalRevenue = data.segments.reduce((s, x) => s + x.revenue, 0);

function Card({ title, children, note }: { title: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <article className="min-w-0 rounded-[22px] border border-border bg-surface p-5 sm:p-6">
      <h3 className="text-base font-semibold text-text">{title}</h3>
      <div className="mt-4">{children}</div>
      {note && <p className="mt-4 text-sm leading-relaxed text-muted">{note}</p>}
    </article>
  );
}

function Bar({ value, segment, label }: { value: number; segment: number; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <span className="block h-full rounded-full" style={{ width: `${value * 100}%`, background: segmentColor(segment) }} />
      </span>
      <span className="w-10 text-right text-xs tabular-nums text-muted">{label}</span>
    </span>
  );
}

export default function Results() {
  const champions = data.segments[0];
  const r2 = data.model.r2;
  const toColumns: (number | "lapsed")[] = [...data.segments.map((s) => s.segment), "lapsed"];
  const rowTotal = (from: number) => data.migration.filter((m) => m.from === from).reduce((s, m) => s + m.customers, 0);
  const cell = (from: number, to: number | "lapsed") => data.migration.find((m) => m.from === from && m.to === to)?.customers ?? 0;
  const maxChurn = Math.max(...data.value.map((v) => v.churn_rate));
  const maxNext = Math.max(...data.value.map((v) => v.next_year_revenue));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card
        title="Who brings the revenue"
        note={<>{champions.name} are {pct(champions.customers / totalCustomers)} of customers and bring {pct(champions.revenue / totalRevenue)} of revenue.</>}
      >
        <div className="grid grid-cols-[minmax(0,7.5rem)_1fr_1fr] gap-x-3 gap-y-3 text-sm sm:grid-cols-[9rem_1fr_1fr]">
          <span />
          <span className="text-xs text-soft">Share of customers</span>
          <span className="text-xs text-soft">Share of revenue</span>
          {data.segments.map((s) => (
            <div key={s.segment} className="contents">
              <span className="truncate text-muted">{s.name}</span>
              <Bar value={s.customers / totalCustomers} segment={s.segment} label={pct(s.customers / totalCustomers)} />
              <Bar value={s.revenue / totalRevenue} segment={s.segment} label={pct(s.revenue / totalRevenue)} />
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="What each segment did the next year"
        note={
          <>
            Segments were set on 1 Dec 2010 and checked against 2011. They explain {pct(r2.segments.next_revenue)} of the variation in next-year spend. A plain RFM score
            cut into the same {data.model.k} groups explains {pct(r2.rfm_score.r2_next_revenue)}, slightly more: a single score ranks customers by value well. What the segments
            add is the reason behind a middling score (new and still growing, or regular and slipping away), and that decides the action.
          </>
        }
      >
        <div className="grid grid-cols-[minmax(0,7.5rem)_1fr_1fr] gap-x-3 gap-y-3 text-sm sm:grid-cols-[9rem_1fr_1fr]">
          <span />
          <span className="text-xs text-soft">Stopped buying</span>
          <span className="text-xs text-soft">Avg spend in 2011</span>
          {data.value.map((v) => (
            <div key={v.segment} className="contents">
              <span className="truncate text-muted">{data.segments[v.segment].name}</span>
              <Bar value={v.churn_rate / maxChurn} segment={v.segment} label={pct(v.churn_rate)} />
              <Bar value={v.next_year_revenue / maxNext} segment={v.segment} label={gbp(v.next_year_revenue)} />
            </div>
          ))}
        </div>
      </Card>

      <div className="min-w-0 lg:col-span-2">
        <Card
          title="Where customers were a year later"
          note={<>Each row is a segment on 1 Dec 2010; columns show the same customers on 1 Dec 2011. &ldquo;Lapsed&rdquo; means no order in the twelve months between.</>}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-soft">
                  <th className="pb-2 pr-3 font-medium">2010 → 2011</th>
                  {toColumns.map((c) => (
                    <th key={c} className="pb-2 text-right font-medium">{c === "lapsed" ? "Lapsed" : data.segments[c].name}</th>
                  ))}
                  <th className="pb-2 pl-3 text-right font-medium">Customers</th>
                </tr>
              </thead>
              <tbody>
                {data.segments.map((s) => {
                  const total = rowTotal(s.segment);
                  return (
                    <tr key={s.segment} className="border-t border-border">
                      <th scope="row" className="py-2 pr-3 text-left font-normal text-muted">{s.name}</th>
                      {toColumns.map((c) => {
                        const share = cell(s.segment, c) / total;
                        const color = c === "lapsed" ? "var(--soft)" : segmentColor(c);
                        return (
                          <td key={c} className="px-1 py-1 text-right tabular-nums">
                            <span
                              className={`block rounded-md px-2 py-1 ${c === s.segment ? "font-semibold text-text" : "text-muted"}`}
                              style={{ background: `color-mix(in srgb, ${color} ${Math.round(share * 60)}%, transparent)` }}
                            >
                              {pct(share)}
                            </span>
                          </td>
                        );
                      })}
                      <td className="py-2 pl-3 text-right tabular-nums text-soft">{int(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
