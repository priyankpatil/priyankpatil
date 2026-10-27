import type { DisplayEdit, EnrichedEdit, WikiFrame } from "../../../lib/wiki-stream/types.ts";

export interface SinkState {
  revision: number;
  offsets: Record<string, string>;
  seen: string[];
  stats: WikiFrame["stats"];
  edits: DisplayEdit[];
  minutes: { minute: number; count: number; bots: number; bytes: number; languages: Record<string, number> }[];
  pages: { wiki: string; title: string; buckets: { minute: number; count: number }[] }[];
}

export function initialState(now = Date.now()): SinkState {
  return { revision: 0, offsets: {}, seen: [], edits: [], minutes: [], pages: [], stats: { events: 0, bots: 0, bytes: 0, late: 0, duplicates: 0, startedAt: now } };
}

export function applyEvents(state: SinkState, records: { edit: EnrichedEdit; partition: number; offset: string }[], now = Date.now()): SinkState {
  const s = structuredClone(state);
  const seen = new Set(s.seen);
  const minute = Math.floor(now / 60_000) * 60_000;
  s.minutes = s.minutes.filter((m) => m.minute >= minute - 59 * 60_000);
  s.pages = s.pages.map((p) => ({ ...p, buckets: p.buckets.filter((b) => b.minute >= minute - 9 * 60_000) })).filter((p) => p.buckets.length);
  for (const { edit, partition, offset } of records) {
    const key = String(partition);
    if (s.offsets[key] !== undefined && BigInt(offset) <= BigInt(s.offsets[key])) continue;
    s.offsets[key] = offset;
    if (seen.has(edit.id)) { s.stats.duplicates++; continue; }
    seen.add(edit.id);
    s.stats.events++; s.stats.bots += Number(edit.bot); s.stats.bytes += edit.delta;
    const eventMinute = Math.floor(edit.timestamp / 60_000) * 60_000;
    if (eventMinute < minute - 60_000) s.stats.late++;
    // Event-time windows accept one minute of lateness. Older events stay in lifetime totals only.
    if (eventMinute >= minute - 60_000 && eventMinute <= minute) {
      let bucket = s.minutes.find((m) => m.minute === eventMinute);
      if (!bucket) { bucket = { minute: eventMinute, count: 0, bots: 0, bytes: 0, languages: {} }; s.minutes.push(bucket); }
      bucket.count++; bucket.bots += Number(edit.bot); bucket.bytes += edit.delta;
      // Fixed cap bounds language cardinality even if the source changes.
      const languageKey = edit.wiki in bucket.languages || Object.keys(bucket.languages).length < 40 ? edit.wiki : "other";
      bucket.languages[languageKey] = (bucket.languages[languageKey] ?? 0) + 1;
      let page = s.pages.find((p) => p.wiki === edit.wiki && p.title === edit.title);
      if (!page && s.pages.length < 150) { page = { wiki: edit.wiki, title: edit.title, buckets: [] }; s.pages.push(page); }
      if (page) {
        const b = page.buckets.find((x) => x.minute === eventMinute);
        if (b) b.count++; else page.buckets.push({ minute: eventMinute, count: 1 });
      }
      const { id, wiki, title, timestamp, bot, kind, delta, receivedAt, enrichedAt } = edit;
      s.edits.push({ id, wiki, title, timestamp, bot, kind, delta, receivedAt, enrichedAt, partition, offset });
    }
  }
  s.edits = s.edits.slice(-10);
  s.seen = [...seen].slice(-1000);
  // Keep headroom for JSONB's whitespace/TOAST representation. Bounded row counts
  // alone do not bound UTF-8 storage when titles and language cardinality grow.
  while (Buffer.byteLength(JSON.stringify(s)) > 160 * 1024) {
    if (s.pages.length) s.pages.shift();
    else if (s.minutes.length > 5) s.minutes.shift();
    else if (s.seen.length > 100) s.seen.splice(0, 100);
    else throw new Error("Aggregate metadata exceeds state budget");
  }
  return s;
}

export function makeFrame(s: SinkState, lag = 0, now = Date.now()): WikiFrame {
  const minute = Math.floor(now / 60_000) * 60_000;
  const languages: Record<string, number> = {};
  for (const m of s.minutes.filter((m) => m.minute >= minute - 4 * 60_000)) {
    for (const [wiki, count] of Object.entries(m.languages)) languages[wiki] = (languages[wiki] ?? 0) + count;
  }
  const trending = s.pages.map((p) => ({
    wiki: p.wiki, title: p.title,
    count: p.buckets.filter((b) => b.minute >= minute - 4 * 60_000).reduce((n, b) => n + b.count, 0),
    previous: p.buckets.filter((b) => b.minute < minute - 4 * 60_000).reduce((n, b) => n + b.count, 0),
  })).filter((p) => p.count >= 3 && p.count >= p.previous * 2).sort((a, b) => b.count - a.count).slice(0, 3);
  const latest = s.edits.at(-1);
  const frame: WikiFrame = {
    at: now, edits: s.edits.slice(-10), stats: s.stats,
    languages: Object.entries(languages).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([wiki, count]) => ({ wiki, count })),
    trending, activity: s.minutes.sort((a, b) => a.minute - b.minute).slice(-20).map(({ minute, count }) => ({ minute, count })),
    pipeline: { lag, sourceToSinkMs: latest ? Math.max(0, now - latest.timestamp) : null },
  };
  // The 4 KiB contract applies to UTF-8 bytes, including multilingual titles.
  while (Buffer.byteLength(JSON.stringify(frame)) > 4096) {
    if (frame.edits.length) frame.edits.shift();
    else if (frame.activity.length) frame.activity.shift();
    else if (frame.trending.length) frame.trending.pop();
    else throw new Error("Frame metadata exceeds budget");
  }
  return frame;
}
