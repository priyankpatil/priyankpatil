import Navigation from "@/components/Navigation";
import WikiStream from "@/components/wiki-stream/WikiStream";
import WikiDataCard from "@/components/wiki-stream/WikiDataCard";
import WikiArchitecture from "@/components/wiki-stream/WikiArchitecture";

export const metadata = {
  title: "Wikipedia Data Streaming using Apache Kafka",
  description: "A real-time data pipeline for processing Wikipedia edits with Apache Kafka: event capture, enrichment, aggregation, and a live dashboard with activity and processing metrics.",
};

export default function WikiStreamPage() {
  return (
    <>
      <Navigation />
      <main className="page-pad">
        <div className="shell">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
            <header className="max-w-3xl">
              <p className="kicker mb-3">Project · Real-time data pipeline</p>
              <h1 className="heading-lg font-semibold">Wikipedia Data Streaming <span className="text-accent">using Apache Kafka</span></h1>
              <p className="body-lg mt-4">A real-time data pipeline for processing Wikipedia edits with Apache Kafka. This project walks through building a producer that captures article changes, consumers that enrich and aggregate the events, and a live dashboard that displays the results. It also provides metrics to monitor activity, measure processing delay, and compare activity across language editions.</p>
            </header>
            <a className="pill-link text-xs" href="https://github.com/priyankpatil/priyankpatil/tree/master/pipelines/wiki-stream" target="_blank" rel="noopener noreferrer">Explore the pipeline ↗</a>
          </div>
          <WikiDataCard />
          <WikiStream />
          <WikiArchitecture />
          <p className="mt-10 text-xs leading-6 text-soft">Source: <a className="underline underline-offset-4" href="https://wikitech.wikimedia.org/wiki/EventStreams" target="_blank" rel="noopener noreferrer">Wikimedia EventStreams</a>. Article titles link to their source pages. This independent project is not affiliated with Wikimedia. Language editions identify wikis, not editor locations. The visible feed is a sample.</p>
        </div>
      </main>
    </>
  );
}
