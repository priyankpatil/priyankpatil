import type { ReactNode } from "react";
import Navigation from "@/components/Navigation";
import FeatureWalkthrough from "@/components/customer-segments/FeatureWalkthrough";
import Results from "@/components/customer-segments/Results";
import SegmentExplorer from "@/components/customer-segments/SegmentExplorer";
import SegmentsArchitecture from "@/components/customer-segments/SegmentsArchitecture";
import { data, gbp, int, pct } from "@/lib/customer-segments/data";

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

const delivered = data.cleaning[0].left;
const kept = data.cleaning[data.cleaning.length - 1].left;

export default function CustomerSegmentsPage() {
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
            <p className="mt-3 text-sm text-soft">A re-creation, on public data, of a customer stratification model built at Clarke Power in 2019.</p>
          </section>

          {/* Data */}
          <section aria-labelledby="data" className="-mt-14">
            <article className="rounded-[22px] border border-border bg-surface p-5 sm:p-7">
              <p className="kicker mb-2">The data</p>
              <h2 id="data" className="text-[clamp(1.35rem,2.6vw,1.8rem)] font-semibold leading-tight tracking-tight text-text">
                {int(data.totals.customers)} customers of a UK online gift shop
              </h2>
              <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted">
                Every order placed with a UK-based online retailer of gifts and homeware between December 2009 and December 2011. Many customers are
                wholesalers buying for their own shops, which makes the data closer to a business customer base than a typical web shop.
              </p>

              <div className="mt-6 grid gap-8 md:grid-cols-2">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 self-start">
                  {[
                    ["Customers", int(data.totals.customers)],
                    ["Orders", int(data.totals.invoices)],
                    ["Products", int(data.totals.products)],
                    ["Revenue", gbp(data.totals.revenue)],
                    ["Countries", int(data.totals.countries)],
                    ["Customers in the UK", pct(data.totals.share_uk)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-soft">{label}</dt>
                      <dd className="mt-0.5 text-xl font-semibold tabular-nums text-text">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div>
                  <h3 className="text-sm font-semibold text-text">Cleaning: {int(delivered)} rows in, {int(kept)} kept</h3>
                  <ol className="mt-3 flex flex-col gap-2.5">
                    {data.cleaning.slice(1).map((c) => (
                      <li key={c.step} className="grid grid-cols-[1fr_auto] gap-x-4 text-sm">
                        <span className="text-text">{c.rule}</span>
                        <span className="text-right tabular-nums text-muted">−{int(c.removed)}</span>
                        <span className="col-span-2 text-xs leading-relaxed text-soft">{c.reason}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4">
                <a href={data.source.url} target="_blank" rel="noopener noreferrer" className="pill-link">
                  View the dataset at UCI ↗
                </a>
                <span className="text-xs text-soft">
                  {data.source.name} · {data.source.author}, {data.source.publisher} · {data.source.license}
                </span>
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
            <SectionHead id="segments" kicker="Segments" title={`${data.model.k} segments, learned from the data`}>
              k-means grouped {int(data.segments.reduce((s, x) => s + x.customers, 0))} customers active in the year before 1 December 2010. Move the sliders
              to classify a customer of your own.
            </SectionHead>
            <SegmentExplorer />
            <p className="max-w-3xl text-sm leading-relaxed text-muted">
              Why {data.model.k}: of 3 to 8 segments and several feature sets, this was the best separated (silhouette {data.model.silhouette.toFixed(2)}),
              every segment holds at least 18% of customers, and it barely changes when the data is resampled (adjusted Rand index{" "}
              {data.model.stability.mean_ari.toFixed(2)} over {data.model.stability.bootstraps} resamples, where 1 means identical).
            </p>
          </section>

          {/* Results */}
          <section aria-labelledby="results" className="flex flex-col gap-6">
            <SectionHead id="results" kicker="Did it work" title="Do the segments mean anything a year later?" />
            <Results />
          </section>

          {/* Architecture */}
          <section aria-labelledby="architecture" className="flex flex-col gap-6">
            <SectionHead id="architecture" kicker="Data architecture" title="From a spreadsheet to a classifier in the browser" />
            <SegmentsArchitecture />
          </section>
        </div>
      </main>
    </>
  );
}
