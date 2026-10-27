import type { DisplayEdit } from "./types";

/** Ordering is per partition. This is an isolated replay of a recorded sample. */
export function replayProgress(edits: DisplayEdit[], consumed: number) {
  const count = Math.min(edits.length, Math.max(0, consumed));
  return [...new Set(edits.map((e) => e.partition))].sort().map((partition) => {
    const all = edits.filter((e) => e.partition === partition);
    const done = edits.slice(0, count).filter((e) => e.partition === partition);
    const last = done.at(-1);
    return { partition, consumed: done.length, total: all.length, remaining: all.length - done.length,
      nextOffset: last ? (BigInt(last.offset) + BigInt(1)).toString() : all[0].offset };
  });
}
