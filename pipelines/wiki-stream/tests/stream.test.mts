import test from "node:test";
import assert from "node:assert/strict";
import { normalize, enrich, parseEnriched } from "../src/events.ts";
import { applyEvents, initialState, makeFrame } from "../src/state.ts";
import { parseSSE } from "../src/sse.ts";
import { articleUrl } from "../../../lib/wiki-stream/types.ts";
import { sourceResume } from "../src/resume.ts";

const now = 1_800_000_000_000;
const source = { wiki: "enwiki", server_name: "en.wikipedia.org", namespace: 0, type: "edit", id: 42, timestamp: now / 1000, title: "A page", bot: false, length: { old: 10, new: 15 } };
const edit = () => enrich(normalize(source, now)!, now + 20);

test("projects article edits and excludes canaries, other projects and private editor data", () => {
  const event = normalize({ ...source, user: "private-editor", comment: "untrusted summary" }, now)!;
  assert.equal("user" in event, false); assert.equal("comment" in event, false);
  assert.equal(normalize({ ...source, meta: { domain: "canary" } }, now), null);
  assert.equal(normalize({ ...source, namespace: 1 }, now), null);
  assert.equal(normalize({ ...source, server_name: "www.wikidata.org" }, now), null);
  assert.throws(() => normalize({ ...source, timestamp: "bad" }, now));
  assert.throws(() => parseEnriched({ ...edit(), delta: 999 }));
});

test("reprocessing offsets is idempotent and recent source replays do not inflate counts", () => {
  const first = applyEvents(initialState(now), [{ edit: edit(), partition: 0, offset: "100" }], now);
  const replay = applyEvents(first, [{ edit: edit(), partition: 0, offset: "100" }], now);
  assert.deepEqual(replay, first);
  const duplicate = applyEvents(replay, [{ edit: edit(), partition: 0, offset: "101" }], now);
  assert.equal(duplicate.stats.events, 1); assert.equal(duplicate.stats.duplicates, 1);
  assert.equal(duplicate.offsets["0"], "101");
  const otherPartition = applyEvents(duplicate, [{ edit: { ...edit(), id: "enwiki:43" }, partition: 1, offset: "0" }], now);
  assert.equal(otherPartition.stats.events, 2);
});

test("late records count in totals but do not distort live windows or burst rankings", () => {
  const late = { ...edit(), timestamp: now - 180_000 };
  const state = applyEvents(initialState(now), [{ edit: late, partition: 0, offset: "0" }], now);
  assert.equal(state.stats.events, 1); assert.equal(state.stats.late, 1);
  assert.equal(state.edits.length, 0); assert.equal(state.minutes.length, 0);
  assert.equal(makeFrame(state, 0, now).trending.length, 0);
});

test("state cardinality and UTF-8 wire frames remain bounded under a busy multilingual stream", () => {
  let state = initialState(now);
  for (let i = 0; i < 2500; i += 100) state = applyEvents(state, Array.from({ length: 100 }, (_, n) => ({
    edit: { ...edit(), id: `event-${i + n}`, wiki: `${String.fromCharCode(97 + n % 26)}${String.fromCharCode(97 + Math.floor(n / 26))}wiki`, title: "百科全书".repeat(40) }, partition: 0, offset: String(i + n),
  })), now);
  assert.equal(state.stats.events, 2500);
  assert.ok(state.seen.length <= 1000); assert.ok(state.pages.length <= 150);
  assert.ok(Object.keys(state.minutes[0].languages).length <= 41);
  assert.ok(Buffer.byteLength(JSON.stringify(state)) <= 196608);
  assert.ok(Buffer.byteLength(JSON.stringify(makeFrame(state, 0, now))) <= 4096);
});

test("bursts compare adjacent five-minute windows and old candidates expire", () => {
  const state = initialState(now);
  state.pages = [ { wiki: "enwiki", title: "Busy page", buckets: [{ minute: now, count: 4 }, { minute: now - 6 * 60_000, count: 1 }] } ];
  assert.equal(makeFrame(state, 0, now).trending[0].count, 4);
  const expired = applyEvents(state, [], now + 11 * 60_000);
  assert.equal(expired.pages.length, 0);
});

test("SSE parser handles UTF-8 split across chunks, CRLF, comments and persisted event ids", async () => {
  const text = ': heartbeat\r\nid: cursor-1\r\ndata: {"title":"日本"}\r\n\r\ndata: first\ndata: second\n\n';
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const b of bytes) controller.enqueue(Uint8Array.of(b)); controller.close(); } });
  const events = [];
  for await (const event of parseSSE(stream)) events.push(event);
  assert.equal(events.length, 2); assert.equal(JSON.parse(events[0].data).title, "日本");
  assert.equal(events[1].id, "cursor-1"); assert.equal(events[1].data, "first\nsecond");
});

test("article links encode titles and cannot escape to arbitrary hosts", () => {
  assert.equal(new URL(articleUrl({ wiki: "enwiki", title: "A page?#" })).hostname, "en.wikipedia.org");
  assert.equal(articleUrl({ wiki: "evil.example/wiki", title: "test" }), "https://www.wikipedia.org/");
});

test("long-idle source recovery is bounded and explicitly reports omitted history", () => {
  assert.equal(sourceResume("cursor", now - 60_000, now).checkpoint, "cursor");
  const resumed = sourceResume("cursor", now - 16 * 60_000, now);
  assert.equal(resumed.omittedHistory, true); assert.equal(resumed.checkpoint, "");
  assert.equal(resumed.since, new Date(now - 60_000).toISOString());
  assert.equal(sourceResume("cursor", undefined, now).omittedHistory, true);
  assert.equal(sourceResume("", undefined, now).omittedHistory, false);
});

test("large multilingual titles and a full hour of language buckets respect the state byte cap", () => {
  const state = initialState(now);
  state.pages = Array.from({ length: 150 }, (_, i) => ({ wiki: "enwiki", title: "百科全书".repeat(63) + i,
    buckets: Array.from({ length: 10 }, (_, j) => ({ minute: now - j * 60_000, count: 1 })) }));
  state.minutes = Array.from({ length: 60 }, (_, i) => ({ minute: now - i * 60_000, count: 40, bots: 0, bytes: 0,
    languages: Object.fromEntries(Array.from({ length: 40 }, (_, j) => [`language${j}wiki`, 100])) }));
  state.seen = Array.from({ length: 1000 }, (_, i) => `long-language-wiki:${i}`);
  const bounded = applyEvents(state, [], now);
  assert.ok(Buffer.byteLength(JSON.stringify(bounded)) <= 160 * 1024);
  assert.ok(bounded.pages.length < 150);
});
