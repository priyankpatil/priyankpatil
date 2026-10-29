import type { ReactNode } from "react";
import Navigation from "@/components/Navigation";
import DataCardTabs from "@/components/customer-segments/DataCardTabs";
import FeatureWalkthrough from "@/components/customer-segments/FeatureWalkthrough";
import Results from "@/components/customer-segments/Results";
import SegmentExplorer from "@/components/customer-segments/SegmentExplorer";
import SegmentsArchitecture from "@/components/customer-segments/SegmentsArchitecture";
import { data, gbp, int } from "@/lib/customer-segments/data";

export const metadata = {
  title: "Customer Segment Classifier",
  description:
    "Customer segments learned from 776,577 real order lines: cleaning, feature engineering, k-means, a check against the next year's behaviour, and a classifier that runs in the browser.",
};

// Segment colours, light and dark (the colour-blind-checked steps used on the CX eval page).
const PALETTE =
  "[--seg-0:#2a78d6] [--seg-1:#eb6834] [--seg-2:#1a7f37] [--seg-3:#8a96ab] " +
  "dark:[--seg-0:#3987e5] dark:[--seg-1:#d95926] dark:[--seg-2:#3fb950] dark:[--seg-3:#6b7891]";

function SectionHead({ id, kicker, title, children }: { id: string; kicker: string; title: string; children?: ReactNode }) {
  return (
    <header className="max-w-3xl">
      <p className="kicker mb-2">{kicker}</p>
      <h2 id={id} className="text-[clamp(1.6rem,3.2vw,2.2rem)] font-semibold leading-tight tracking-tight text-text">
        {title}
      </h2>
      {children && <p className="mt-3 text-lg leading-relaxed text-muted">{children}</p>}
    </header>
  );
}

const COLUMNS: [string, string][] = [
  ["Invoice", "the order number; a leading C marks a cancellation"],
  ["StockCode and Description", "the product"],
  ["Quantity and Price", "units and unit price in pounds sterling"],
  ["InvoiceDate", "date and time of the order"],
  ["Customer ID and Country", "who ordered, and where they are"],
];

export default function CustomerSegmentsPage() {
  const kept = data.cleaning[data.cleaning.length - 1].left;
  return (
    <>
      <Navigation />
      <main className={`page-pad ${PALETTE}`}>
        <div className="shell flex flex-col gap-24">
          {/* Hero */}
          <section className="max-w-3xl">
            <p className="kicker mb-3">Project · Customer segmentation</p>
            <h1 className="heading-lg font-semibold">
              Customer Segment <span className="text-accent">Classifier</span>
            </h1>
            <p className="body-lg mt-4">
              Customer segments learned from two years of real orders. This project walks through cleaning the transactions, turning them into features for
              each customer, finding segments with k-means, and checking whether the segments predict what customers did the following year. A classifier
              built from the result runs in your browser.
            </p>
          </section>

          {/* Data */}
          {/* Reads as part of the hero, so sits closer than the page's section gap. */}
          <section aria-labelledby="data" className="-mt-14">
            <article className="rounded-[22px] border border-border bg-surface p-5 sm:p-7">
              <p className="kicker mb-2">The data</p>
              <h2 id="data" className="text-[clamp(1.35rem,2.6vw,1.8rem)] font-semibold leading-tight tracking-tight text-text">
                {int(kept)} real order lines from {int(data.totals.customers)} customers
              </h2>
              <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted">
                Every order placed with a UK-based online retailer of gifts and homeware between December 2009 and December 2011: {int(data.totals.invoices)}{" "}
                orders, {gbp(data.totals.revenue)} in sales, customers in {data.totals.countries} countries. Many customers are wholesalers buying for their own
                shops, so the data is closer to a business customer base than a typical web shop.
              </p>

              <DataCardTabs
                overview={
                  <div className="grid gap-6 md:grid-cols-2">
                    <div>
                      <h3 className="text-sm font-semibold text-text">What each order line contains</h3>
                      <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
                        {COLUMNS.map(([name, what]) => (
                          <li key={name}>
                            <strong className="font-medium text-text">{name}</strong>: {what}.
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 text-sm leading-relaxed text-muted">
                        There are no customer attributes such as size or industry, so segments have to come from buying behaviour alone.
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-text">What cleaning removed</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted">
                        {int(data.cleaning[0].left)} rows delivered, {int(kept)} kept. Each rule runs in SQL and logs what it removed:
                      </p>
                      <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted">
                        {data.cleaning.slice(1).map((c) => (
                          <li key={c.step}>
                            · {c.rule}: <span className="tabular-nums text-text">{int(c.removed)}</span>
                            <span className="text-soft"> ({c.reason.charAt(0).toLowerCase() + c.reason.slice(1)})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                }
              />
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4">
                <a href={data.source.url} target="_blank" rel="noopener noreferrer" className="pill-link">
                  View the dataset at UCI ↗
                </a>
                <span className="text-xs text-soft">
                  {data.source.author}, {data.source.publisher} · {data.source.license}
                </span>
                <span className="text-xs text-soft">A re-creation, on public data, of a customer stratification model built at Clarke Power in 2019.</span>
              </div>
            </article>
          </section>

          {/* Features */}
          <section aria-labelledby="features" className="flex flex-col gap-6">
            <SectionHead id="features" kicker="Feature engineering" title="From orders to three numbers per customer">
              Pick a customer to see their orders become the inputs the model compares. Only orders before 1 December 2010 are used, so nothing from the
              future leaks in.
            </SectionHead>
            <FeatureWalkthrough />
          </section>

          {/* Segments */}
          <section aria-labelledby="segments" className="flex flex-col gap-6">
            <SectionHead id="segments" kicker="Interactive demo" title="Classify a customer">
              k-means found {data.model.k} segments among the {int(data.segments.reduce((s, x) => s + x.customers, 0))} customers active in the year before
              1 December 2010. Move the sliders to place a customer of your own.
            </SectionHead>
            <SegmentExplorer />
          </section>

          {/* Metrics */}
          <section aria-labelledby="metrics" className="flex flex-col gap-6">
            <SectionHead id="metrics" kicker="Metrics" title="Model quality, segment value and what happened next" />
            <Results />
          </section>

          {/* Architecture */}
          <SegmentsArchitecture />
        </div>
      </main>
    </>
  );
}
