import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { kafka, TOPICS } from "../src/kafka.ts";
import { database, loadState } from "../src/database.ts";
import type { DisplayEdit } from "../../../lib/wiki-stream/types.ts";

const db = database(), reader = database("WIKISTREAM_READ_URL"), admin = kafka().admin();
try {
  await admin.connect();
  const metadata = await admin.fetchTopicMetadata({ topics: Object.values(TOPICS) });
  const topics = [];
  // KafkaJS's metadata/offset cache is shared; serialize requests on one client.
  for (const topic of [TOPICS.raw, TOPICS.enriched]) topics.push({ topic, offsets: await admin.fetchTopicOffsets(topic) });
  const groups = [];
  for (const [groupId, topic] of [["wiki-enrich-v1", TOPICS.raw], ["wiki-display-v1", TOPICS.enriched]]) {
    const offsets = await admin.fetchOffsets({ groupId, topics: [topic] });
    const heads = topics.find((t) => t.topic === topic)!.offsets;
    const partitions = offsets[0].partitions.map((p) => ({ partition: p.partition, nextOffset: p.offset,
      lag: Math.max(0, Number(BigInt(heads.find((h) => h.partition === p.partition)!.high) - BigInt(p.offset === "-1" ? "0" : p.offset))) }));
    groups.push({ groupId, partitions, lag: partitions.reduce((sum, p) => sum + p.lag, 0) });
  }
  let state = await loadState(db);
  assert.ok(state && state.stats.events > 0, "No processed events; run wiki:worker first");
  const samples = new Map<string, DisplayEdit>();
  const capture = process.argv.includes("--capture");
  for (let i = 0; i < (capture ? 5 : 1); i++) {
    if (i) { await delay(5000); state = (await loadState(db))!; }
    for (const edit of state.edits) samples.set(edit.id, edit);
  }
  const { rows: [row] } = await reader.query("select wiki_stream.read_frame() as response");
  const response = row.response;
  assert.equal(response.mode, "live", "The latest database frame must be fresh");
  assert.ok(response.frame.edits.length > 0, "No recent sampled edits");
  assert.ok(response.frame.edits.every((e: DisplayEdit) => e.partition >= 0 && /^\d+$/.test(e.offset)), "Missing real Kafka positions");
  assert.ok(Buffer.byteLength(JSON.stringify(response.frame)) <= 4096, "Frame exceeded wire budget");
  assert.ok(Buffer.byteLength(JSON.stringify(state)) <= 196608, "State exceeded storage budget");
  const health = (await db.query("select wiki_stream.health() as health")).rows[0].health;
  assert.ok(health.schemaBytes < 31457280);
  assert.ok(health.frames <= 120 && health.minutes <= 1440);
  let recovery: { beforeEvents: number; afterEvents: number; offsetsPreserved: boolean } | undefined;
  const beforeIndex = process.argv.indexOf("--recovery-before");
  if (beforeIndex >= 0) {
    const before = JSON.parse(await readFile(process.argv[beforeIndex + 1], "utf8")) as { events: number; offsets: Record<string, string> };
    assert.ok(state.stats.events >= before.events, "Counters reset across restart");
    assert.ok(Object.entries(before.offsets).every(([p, offset]) => state.offsets[p] !== undefined && BigInt(state.offsets[p]) >= BigInt(offset)), "Partition offsets regressed across restart");
    recovery = { beforeEvents: before.events, afterEvents: state.stats.events, offsetsPreserved: true };
  }
  const report = { checkedAt: new Date().toISOString(), processedEvents: state.stats.events, revision: state.revision,
    frameBytes: Buffer.byteLength(JSON.stringify(response.frame)), stateBytes: Buffer.byteLength(JSON.stringify(state)),
    schemaBytes: health.schemaBytes, databaseBytes: health.databaseBytes, frames: health.frames, minutes: health.minutes,
    duplicatesSuppressed: state.stats.duplicates, lateEvents: state.stats.late, groups,
    topics: metadata.topics.map((t) => ({ name: t.name, partitions: t.partitions.length })),
    sourceToStorageMs: response.frame.pipeline.sourceToSinkMs, ...(recovery ? { recovery } : {}) };
  console.log(JSON.stringify(report, null, 2));
  if (capture) {
    // Actual Kafka-processed events, with measured timestamps/offsets. No editor
    // identities, credentials, broker endpoints or raw SSE records are exported.
    await writeFile("lib/wiki-stream/recorded.json", JSON.stringify({
      capturedAt: report.checkedAt, frame: response.frame, edits: [...samples.values()].slice(-40),
    }, null, 2) + "\n");
    await writeFile("pipelines/wiki-stream/verification.json", JSON.stringify(report, null, 2) + "\n");
    console.log("Saved a verified Kafka replay sample and public verification report.");
  }
} finally { await admin.disconnect(); await reader.end(); await db.end(); }
