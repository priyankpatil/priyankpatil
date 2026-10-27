import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import { CompressionTypes, type Message } from "kafkajs";
import { database, loadState } from "../src/database.ts";
import { kafka, TOPICS } from "../src/kafka.ts";
import { normalize } from "../src/events.ts";
import { parseSSE } from "../src/sse.ts";
import { sourceResume } from "../src/resume.ts";

const userAgent = process.env.WIKISTREAM_USER_AGENT || "PriyankPatilWikiStream/0.1 (https://github.com/priyankpatil/priyankpatil)";
const db = database();
const producer = kafka().producer({ idempotent: true, maxInFlightRequests: 1, allowAutoTopicCreation: false });
const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop.abort());
let checkpoint = "", lastCheckpoint = 0, lastFlush = Date.now();
let pending: Message[] = [], errorsThisMinute = 0, errorMinute = 0;
let reconnects = 0;
let recentWindow = false;

async function flush(eventId: string) {
  if (pending.length) {
    await producer.send({ topic: TOPICS.raw, compression: CompressionTypes.GZIP, messages: pending });
    pending = [];
  }
  // Save only after broker acknowledgement. A crash before this write may replay,
  // so the sink also deduplicates recent source event ids.
  if (eventId && Date.now() - lastCheckpoint >= 5000) {
    await db.query("select wiki_stream.save_source_checkpoint($1)", [eventId]);
    lastCheckpoint = Date.now();
  }
  checkpoint = eventId || checkpoint;
  lastFlush = Date.now();
  process.send?.({ heartbeat: true });
}

try {
  await producer.connect();
  checkpoint = (await db.query("select wiki_stream.get_source_checkpoint() as id")).rows[0].id ?? "";
  const previous = await loadState(db);
  const lastAccepted = previous?.edits.length ? Math.max(...previous.edits.map((e) => e.receivedAt)) : undefined;
  // Free demo hosts can sleep for hours. Replaying the entire upstream Wikimedia
  // backlog would burn bandwidth without improving a short-window live display.
  // Preserve normal checkpoints, but explicitly limit recovery after a long idle.
  const resume = sourceResume(checkpoint, lastAccepted);
  if (resume.omittedHistory) {
    checkpoint = resume.checkpoint; recentWindow = true;
    console.log("[source] long idle detected; resuming the last 60 seconds. Older upstream history is intentionally omitted, not counted as recovered.");
  }
  while (!stop.signal.aborted) {
    try {
      const headers: Record<string, string> = { Accept: "text/event-stream", "User-Agent": userAgent };
      if (checkpoint) headers["Last-Event-ID"] = checkpoint;
      const sourceUrl = new URL("https://stream.wikimedia.org/v2/stream/recentchange");
      if (recentWindow && !checkpoint) sourceUrl.searchParams.set("since", new Date(Date.now() - 60_000).toISOString());
      const response = await fetch(sourceUrl, {
        headers, signal: AbortSignal.any([stop.signal, AbortSignal.timeout(120_000)]),
      });
      if (!response.ok || !response.body) throw new Error(`EventStreams HTTP ${response.status}`);
      console.log("[source] connected");
      reconnects = 0;
      for await (const event of parseSSE(response.body)) {
        if (stop.signal.aborted) break;
        if (event.event !== "message") continue;
        try {
          const edit = normalize(JSON.parse(event.data));
          if (edit) pending.push({ key: `${edit.wiki}:${edit.title}`, value: JSON.stringify(edit) });
        } catch {
          const minute = Math.floor(Date.now() / 60_000);
          if (minute !== errorMinute) { errorsThisMinute = 0; errorMinute = minute; }
          // Store a hash and reason, never the untrusted raw payload. Bound DLQ volume.
          if (errorsThisMinute++ < 10) await producer.send({ topic: TOPICS.dlq, messages: [{
            value: JSON.stringify({ stage: "source", reason: "Event contract rejected", hash: createHash("sha256").update(event.data).digest("hex"), at: Date.now() }),
          }] });
        }
        checkpoint = event.id || checkpoint;
        if (pending.length >= 50 || Date.now() - lastFlush >= 1000) await flush(checkpoint);
      }
      await flush(checkpoint);
    } catch {
      // Pending events are retained. Reconnection may duplicate acknowledged records;
      // no source checkpoint is persisted until flush succeeds.
      if (stop.signal.aborted) break;
      console.error("[source] disconnected; retrying with checkpoint (credentials and payload omitted)");
      await delay(Math.min(30_000, 1000 * 2 ** Math.min(reconnects++, 5)), undefined, { signal: stop.signal }).catch(() => {});
    }
  }
} finally {
  await flush(checkpoint).catch(() => {});
  await producer.disconnect(); await db.end();
}
