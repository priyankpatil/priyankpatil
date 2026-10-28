import CardTabs from "@/components/cx-eval/CardTabs";
import capture from "@/lib/wiki-stream/preview.json";

// A real, recorded source event. Only fields retained from Wikimedia are shown;
// receivedAt is added by our producer and is explained separately below.
const sample = capture.edits.find((edit) => edit.wiki === "enwiki" && edit.kind === "edit") ?? capture.edits[0];
const { receivedAt, ...sourceFields } = sample;

function AboutData() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h3 className="text-sm font-semibold text-text">What each edit contains</h3>
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
          <li><strong className="font-medium text-text">The article and its language edition</strong>, such as an English or Japanese Wikipedia page.</li>
          <li><strong className="font-medium text-text">When it happened</strong>, with an event ID and a timestamp from Wikimedia.</li>
          <li><strong className="font-medium text-text">The kind of change</strong>, an edit to an existing article or the creation of a new one.</li>
          <li><strong className="font-medium text-text">The bot flag and article size</strong> before and after the change.</li>
        </ul>
        <p className="mt-3 text-sm leading-relaxed text-muted">The stream describes changes to articles. Article text, editor identities and edit summaries are left out of this project&apos;s stored events.</p>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-text">What this project adds</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">The edits and their source timestamps are real. The pipeline adds the information needed to follow and understand the stream:</p>
        <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted">
          <li>· The number of bytes added or removed</li>
          <li>· Kafka partition and offset for tracing each sampled event</li>
          <li>· Arrival and processing timestamps to measure delay</li>
          <li>· Activity by language and pages with editing bursts</li>
          <li>· A sampled live feed and a recorded Kafka replay</li>
        </ul>
        <p className="mt-3 text-sm leading-relaxed text-muted">The live display refreshes in five-second batches. Its visible edits are sampled; the counters include all accepted events.</p>
      </div>
    </div>
  );
}

function SampleEvent() {
  return (
    <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
      <div className="min-w-0">
        <p className="mb-3 text-xs text-soft">Recorded from Wikimedia on 27 October 2026 · retained source fields</p>
        <pre className="overflow-x-auto rounded-2xl border border-border bg-surface-muted p-4 font-mono text-xs leading-6 text-text" tabIndex={0} aria-label="Recorded Wikipedia edit as JSON"><code>{JSON.stringify(sourceFields, null, 2)}</code></pre>
      </div>
      <div className="space-y-4 text-sm leading-relaxed text-muted">
        <div><h3 className="font-semibold text-text">One real article edit</h3><p className="mt-2">A human edited <strong className="font-medium text-text">{sample.title}</strong> on English Wikipedia. The article grew from {sample.oldLength.toLocaleString("en-US")} to {sample.newLength.toLocaleString("en-US")} bytes: a change of <strong className="font-medium text-text">+{sample.newLength - sample.oldLength} bytes</strong>.</p></div>
        <div><h3 className="font-semibold text-text">Source fields, kept small</h3><p className="mt-2"><code className="text-xs">timestamp</code> is the source time in milliseconds. The ID combines the wiki name and Wikimedia&apos;s change ID. This trimmed event keeps the fields used by this project.</p></div>
        <div><h3 className="font-semibold text-text">Then the pipeline takes over</h3><p className="mt-2">Our producer recorded arrival at <time dateTime={new Date(receivedAt).toISOString()}>{new Date(receivedAt).toISOString().slice(11, 23)} UTC</time>. Kafka positions and the enrichment timestamp are added later. The live feed below links each sampled edit to its Wikipedia article.</p></div>
      </div>
    </div>
  );
}

export default function WikiDataCard() {
  return (
    <section aria-labelledby="wiki-data-heading" className="mb-10">
      <article className="rounded-[22px] border border-border bg-surface p-5 sm:p-7">
        <p className="kicker mb-2">The data</p>
        <h2 id="wiki-data-heading" className="text-[clamp(1.35rem,2.6vw,1.8rem)] font-semibold leading-tight tracking-tight text-text">Real Wikipedia edits, streamed as they happen</h2>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted">The data comes from Wikimedia EventStreams, a public feed of changes across Wikimedia&apos;s projects. This project follows edits and new articles on Wikipedia&apos;s language editions, made by both people and bots.</p>
        <CardTabs label="About the Wikipedia data" sizing="tallest" tabs={[
          { key: "about", label: "About the data", content: <AboutData /> },
          { key: "sample", label: "Sample event", content: <SampleEvent /> },
        ]} />
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4">
          <a href="https://wikitech.wikimedia.org/wiki/EventStreams" target="_blank" rel="noopener noreferrer" className="pill-link">Explore the data source ↗</a>
          <a href="https://github.com/wikimedia/mediawiki-event-schemas/blob/master/jsonschema/mediawiki/recentchange/current.yaml" target="_blank" rel="noopener noreferrer" className="text-sm text-muted underline decoration-border underline-offset-4 hover:text-text">View the event schema ↗</a>
          <span className="text-xs text-soft">Wikimedia EventStreams · Wikipedia article changes</span>
        </div>
      </article>
    </section>
  );
}
