import test from "node:test";
import assert from "node:assert/strict";
import { SnapshotWriter } from "../src/writer.ts";
import { initialState, type SinkState } from "../src/state.ts";
import type { EnrichedEdit } from "../../../lib/wiki-stream/types.ts";
import { replayProgress } from "../../../lib/wiki-stream/replay.ts";

const edit = (id: string): EnrichedEdit => ({ id, wiki: "enwiki", title: id, timestamp: Date.now(), receivedAt: Date.now(), enrichedAt: Date.now(), bot: false, kind: "edit", delta: 1, oldLength: 1, newLength: 2, language: "en" });

test("both partitions share a durable snapshot before either caller can acknowledge", async () => {
  let persisted: SinkState | undefined;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const writer = new SnapshotWriter(initialState(), async (state) => { persisted = state; await barrier; state.revision++; });
  let acknowledged = 0;
  const a = writer.enqueue({ records: [{ edit: edit("a"), partition: 0, offset: "8" }], lag: 0 }).then(() => acknowledged++);
  const b = writer.enqueue({ records: [{ edit: edit("b"), partition: 1, offset: "3" }], lag: 0 }).then(() => acknowledged++);
  const flush = writer.flush();
  assert.equal(acknowledged, 0); assert.equal(persisted!.stats.events, 2);
  assert.deepEqual(persisted!.offsets, { "0": "8", "1": "3" });
  release(); await flush; await Promise.all([a, b]); assert.equal(acknowledged, 2);
});

test("failed persistence rejects acknowledgements and preserves previous counters", async () => {
  let fail = true; let count = 0;
  const writer = new SnapshotWriter(initialState(), async (state) => { if (fail) throw new Error("budget reached"); count = state.stats.events; });
  const batch = { records: [{ edit: edit("a"), partition: 0, offset: "8" }], lag: 0 };
  const first = assert.rejects(writer.enqueue(batch), /budget reached/);
  await writer.flush(); await first; fail = false;
  const retry = writer.enqueue(batch); await writer.flush(); await retry; assert.equal(count, 1);
});

test("replay tracks next offsets independently for each sampled partition", () => {
  const source = [ { ...edit("a"), partition: 0, offset: "9" }, { ...edit("b"), partition: 1, offset: "20" }, { ...edit("c"), partition: 0, offset: "14" } ];
  const p = replayProgress(source, 2);
  assert.deepEqual(p.map((x) => [x.partition, x.nextOffset, x.remaining]), [[0,"10",1],[1,"21",0]]);
  assert.equal(replayProgress(source, 99)[0].remaining, 0);
});
