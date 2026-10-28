import Navigation from "@/components/Navigation";
import WikiStream from "@/components/wiki-stream/WikiStream";
import WikiDataCard from "@/components/wiki-stream/WikiDataCard";

export const metadata = {
  title: "Wikipedia Live · Kafka Streaming",
  description: "Watch Wikipedia change through an Apache Kafka streaming pipeline: live edits, language activity, event tracing and bounded storage.",
};

export default function WikiStreamPage() {
  return (
    <>
      <Navigation />
      <main className="page-pad">
        <div className="shell">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
            <header className="max-w-2xl">
              <p className="kicker mb-4">A living encyclopedia · An Apache Kafka project</p>
              <h1 className="heading-lg font-semibold tracking-tight">Wikipedia,<br /><span className="text-accent">as it happens.</span></h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">Somewhere, someone is changing what we know. Follow the edits, watch languages light up, and trace a change through the stream.</p>
            </header>
            <a className="pill-link text-xs" href="https://github.com/priyankpatil/priyankpatil/tree/master/pipelines/wiki-stream" target="_blank" rel="noopener noreferrer">Explore the pipeline ↗</a>
          </div>
          <WikiDataCard />
          <WikiStream />
          <section className="mt-16 grid gap-8 border-t border-border pt-10 md:grid-cols-[1fr_2fr]">
            <div><p className="kicker mb-3">Under the surface</p><h2 className="text-2xl font-semibold tracking-tight">Every edit has a journey.</h2></div>
            <div className="grid gap-6 sm:grid-cols-3">
              <div><span className="font-mono text-xs text-accent">01 / CAPTURE</span><h3 className="mt-2 font-semibold">A real public stream</h3><p className="mt-2 text-sm leading-6 text-muted">Wikimedia article edits enter Kafka with a stable event ID. Short disconnects resume from an acknowledged checkpoint. After a long idle, capture resumes a recent window and omits the gap.</p></div>
              <div><span className="font-mono text-xs text-accent">02 / PROCESS</span><h3 className="mt-2 font-semibold">Independent consumers</h3><p className="mt-2 text-sm leading-6 text-muted">One consumer enriches edits. Another computes event-time activity and keeps the display current. Each tracks its own offsets.</p></div>
              <div><span className="font-mono text-xs text-accent">03 / DELIVER</span><h3 className="mt-2 font-semibold">A small window on the world</h3><p className="mt-2 text-sm leading-6 text-muted">Sampled edits arrive in five-second batches. Recent display data expires; Kafka retains events within the broker’s retention window.</p></div>
            </div>
          </section>
          <p className="mt-10 text-xs leading-6 text-soft">Source: <a className="underline underline-offset-4" href="https://wikitech.wikimedia.org/wiki/EventStreams" target="_blank" rel="noopener noreferrer">Wikimedia EventStreams</a>. Article titles link to their source pages. This independent project is not affiliated with Wikimedia. Language editions identify wikis, not editor locations. The visible feed is a sample.</p>
        </div>
      </main>
    </>
  );
}
