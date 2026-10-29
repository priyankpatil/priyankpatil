import { Fragment, type ReactNode } from "react";
import CardTabs from "@/components/cx-eval/CardTabs";
import { data } from "@/lib/customer-segments/data";

// The data card's tabs, as on the CX eval and wiki-stream pages: an overview,
// then a few real order lines. Tab contents are keyed because they cross from a
// server component to the client CardTabs inside an array prop.

export default function DataCardTabs({ overview }: { overview: ReactNode }) {
  const sample = data.examples[0];
  return (
    <CardTabs
      label="The data"
      tabs={[
        { key: "overview", label: "About the data", content: <Fragment key="overview">{overview}</Fragment> },
        {
          key: "sample",
          label: "Sample order lines",
          content: (
            <div key="sample">
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead className="bg-surface-muted text-left font-mono text-[0.7rem] text-soft">
                    <tr>
                      {["Invoice", "StockCode", "Description", "Quantity", "InvoiceDate", "Price", "Customer ID"].map((h, i) => (
                        <th key={h} className={`px-3 py-2 font-medium ${i === 3 || i === 5 ? "text-right" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sample.lines.map((l, i) => (
                      // The same product can appear twice on one invoice, so the row index is part of the key.
                      <tr key={`${l.invoice}-${l.stock_code}-${i}`} className="border-t border-border">
                        <td className="px-3 py-1.5 font-mono text-xs text-muted">{l.invoice}</td>
                        <td className="px-3 py-1.5 font-mono text-xs text-muted">{l.stock_code}</td>
                        <td className="px-3 py-1.5 text-text">{l.description}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted">{l.quantity}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-muted">{l.date}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted">£{l.price.toFixed(2)}</td>
                        <td className="px-3 py-1.5 font-mono text-xs text-muted">{sample.customer_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-soft">
                The latest lines from customer {sample.customer_id} ({sample.country}), as delivered. Country is the eighth column. Prices are in pounds sterling; the
                time of day is dropped here.
              </p>
            </div>
          ),
        },
      ]}
    />
  );
}
