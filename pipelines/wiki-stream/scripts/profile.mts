import { mkdir, writeFile } from "node:fs/promises";
import { normalize } from "../src/events.ts";
import { parseSSE } from "../src/sse.ts";
import type { WikiEdit } from "../../../lib/wiki-stream/types.ts";
import "../src/env.ts";

const durationIndex = process.argv.indexOf("--seconds");
const seconds = durationIndex < 0 ? 30 : Number(process.argv[durationIndex + 1]);
if (!Number.isFinite(seconds) || seconds < 5 || seconds > 300) throw new Error("Use --seconds between 5 and 300");
const started = Date.now();
const abort = AbortSignal.timeout(seconds * 1000);
const sample: WikiEdit[] = [];
const languages: Record<string, number> = {};
let all = 0, accepted = 0, bytes = 0, bots = 0, rejected = 0;
try {
  const response = await fetch("https://stream.wikimedia.org/v2/stream/recentchange", {
    headers: { "User-Agent": process.env.WIKISTREAM_USER_AGENT ?? "PriyankPatilWikiStream/0.1 (https://github.com/priyankpatil/priyankpatil)", Accept: "text/event-stream" }, signal: abort,
  });
  if (!response.ok || !response.body) throw new Error(`Source HTTP ${response.status}`);
  for await (const event of parseSSE(response.body)) {
    if (event.event !== "message") continue;
    all++;
    try {
      const edit = normalize(JSON.parse(event.data));
      if (!edit) continue;
      accepted++; bots += Number(edit.bot); bytes += Buffer.byteLength(JSON.stringify(edit));
      languages[edit.wiki] = (languages[edit.wiki] ?? 0) + 1;
      if (sample.length < 40) sample.push(edit);
    } catch { rejected++; }
  }
} catch (error) { if (!abort.aborted) throw error; }
const elapsed = (Date.now() - started) / 1000;
const report = {
  capturedAt: new Date().toISOString(), seconds: Math.round(elapsed), sourceEvents: all,
  wikipediaArticleEdits: accepted, editsPerSecond: Number((accepted / elapsed).toFixed(2)),
  projectedBytesPerSecond: Math.round(bytes / elapsed), meanProjectedBytes: accepted ? Math.round(bytes / accepted) : 0,
  botPct: accepted ? Number((100 * bots / accepted).toFixed(1)) : 0, rejected, languages,
};
console.log(JSON.stringify(report, null, 2));
if (!accepted) throw new Error("No usable Wikipedia events received; do not treat this as a successful profile");
if (process.argv.includes("--save-preview")) {
  await mkdir("lib/wiki-stream", { recursive: true });
  await writeFile("lib/wiki-stream/preview.json", JSON.stringify({ report, edits: sample }, null, 2) + "\n");
  console.log("Saved an attributed, recorded source sample; it has NOT traversed Kafka.");
}
