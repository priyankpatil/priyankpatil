import { createHash } from "node:crypto";
import { CompressionTypes } from "kafkajs";
import { kafka, TOPICS } from "../src/kafka.ts";
import { enrich, parseRaw } from "../src/events.ts";
import { withHeartbeats } from "../src/heartbeat.ts";

const client = kafka();
const consumer = client.consumer({ groupId: "wiki-enrich-v1", allowAutoTopicCreation: false, maxBytesPerPartition: 128 * 1024, sessionTimeout: 60_000 });
const producer = client.producer({ idempotent: true, maxInFlightRequests: 1, allowAutoTopicCreation: false });
async function shutdown() { await consumer.disconnect(); await producer.disconnect(); }
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void shutdown(); });
consumer.on(consumer.events.CRASH, (event) => { if (!event.payload.restart) { process.exitCode = 1; void shutdown(); } });
await producer.connect(); await consumer.connect();
await consumer.subscribe({ topic: TOPICS.raw, fromBeginning: true });
await consumer.run({
  autoCommit: false, eachBatchAutoResolve: false,
  eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning, isStale }) => {
    await withHeartbeats(heartbeat, async () => {
    for (let i = 0; i < batch.messages.length; i += 100) {
      if (!isRunning() || isStale()) break;
      const chunk = batch.messages.slice(i, i + 100);
      const output = [], rejected = [];
      for (const message of chunk) {
        try {
          const value = enrich(parseRaw(JSON.parse(message.value?.toString() ?? "null")));
          output.push({ key: `${value.wiki}:${value.title}`, value: JSON.stringify(value) });
        } catch {
          rejected.push({ value: JSON.stringify({
            stage: "enrich", reason: "Raw contract rejected", partition: batch.partition, offset: message.offset,
            hash: createHash("sha256").update(message.value ?? "").digest("hex"), at: Date.now(),
          }) });
        }
      }
      if (output.length) await producer.send({ topic: TOPICS.enriched, compression: CompressionTypes.GZIP, messages: output });
      if (rejected.length) await producer.send({ topic: TOPICS.dlq, compression: CompressionTypes.GZIP, messages: rejected });
      // Commit only after enriched output (or DLQ acknowledgement) is durable.
      const offset = chunk[chunk.length - 1].offset;
      resolveOffset(offset);
      await consumer.commitOffsets([{ topic: batch.topic, partition: batch.partition, offset: (BigInt(offset) + BigInt(1)).toString() }]);
      await heartbeat();
      process.send?.({ heartbeat: true });
    }
    });
  },
});
