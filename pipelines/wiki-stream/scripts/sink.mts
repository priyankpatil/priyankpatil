import { database, loadState, saveState } from "../src/database.ts";
import { kafka, TOPICS } from "../src/kafka.ts";
import { parseEnriched } from "../src/events.ts";
import { initialState } from "../src/state.ts";
import { SnapshotWriter } from "../src/writer.ts";
import { withHeartbeats } from "../src/heartbeat.ts";

const db = database();
const consumer = kafka().consumer({ groupId: "wiki-display-v1", allowAutoTopicCreation: false, maxBytesPerPartition: 128 * 1024, sessionTimeout: 60_000 });
const writer = new SnapshotWriter((await loadState(db)) ?? initialState(), async (state, frame) => {
  await saveState(db, state, frame);
  process.send?.({ heartbeat: true });
  console.log(`[sink] events=${state.stats.events} sampled=${frame.edits.length} buffered-partition-lag=${frame.pipeline.lag} bytes=${Buffer.byteLength(JSON.stringify(frame))}`);
});
async function shutdown() { await consumer.disconnect(); await db.end(); }
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void shutdown(); });
consumer.on(consumer.events.CRASH, (event) => { if (!event.payload.restart) { process.exitCode = 1; void shutdown(); } });
await consumer.connect();
await consumer.subscribe({ topic: TOPICS.enriched, fromBeginning: true });
await consumer.run({
  autoCommit: false, eachBatchAutoResolve: false, partitionsConsumedConcurrently: 2,
  eachBatch: async ({ batch, heartbeat, resolveOffset, isRunning, isStale }) => {
    await withHeartbeats(heartbeat, async () => {
    for (let i = 0; i < batch.messages.length; i += 200) {
      if (!isRunning() || isStale()) break;
      const chunk = batch.messages.slice(i, i + 200);
      const records = chunk.map((message) => ({ edit: parseEnriched(JSON.parse(message.value?.toString() ?? "null")), partition: batch.partition, offset: message.offset }));
      const offset = chunk[chunk.length - 1].offset;
      const lag = Math.max(0, Number(BigInt(batch.highWatermark) - BigInt(offset) - BigInt(1)));
      await heartbeat();
      await writer.enqueue({ records, lag });
      resolveOffset(offset);
      await consumer.commitOffsets([{ topic: batch.topic, partition: batch.partition, offset: (BigInt(offset) + BigInt(1)).toString() }]);
      await heartbeat();
    }
    });
  },
});
