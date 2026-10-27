import type { EnrichedEdit, WikiEdit } from "../../../lib/wiki-stream/types.ts";

const object = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Project only article edits from Wikipedia. Usernames, IPs and summaries are never retained. */
export function normalize(input: unknown, now = Date.now()): WikiEdit | null {
  if (!object(input)) throw new Error("Event must be an object");
  if (object(input.meta) && input.meta.domain === "canary") return null;
  if (input.type !== "edit" && input.type !== "new") return null;
  if (input.namespace !== 0 || typeof input.wiki !== "string" || !/^[a-z][a-z0-9-]{0,19}wiki$/.test(input.wiki)) return null;
  if (typeof input.server_name !== "string" || !input.server_name.endsWith(".wikipedia.org")) return null;
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 255 || typeof input.id !== "number" || !Number.isSafeInteger(input.id)) throw new Error("Missing title or event id");
  if (typeof input.timestamp !== "number" || !Number.isFinite(input.timestamp) || input.timestamp < 0 || input.timestamp * 1000 > now + 60_000) throw new Error("Invalid event timestamp");
  const length = object(input.length) ? input.length : {};
  const size = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : 0;
  return {
    id: `${input.wiki}:${input.id}`, wiki: input.wiki, title: input.title,
    timestamp: input.timestamp * 1000, receivedAt: now, bot: input.bot === true,
    kind: input.type, oldLength: size(length.old), newLength: size(length.new),
  };
}

export function parseRaw(input: unknown): WikiEdit {
  if (!object(input) || typeof input.id !== "string" || input.id.length > 80 || typeof input.wiki !== "string" || !/^[a-z][a-z0-9-]{0,19}wiki$/.test(input.wiki)
    || typeof input.title !== "string" || input.title.length > 255 || typeof input.bot !== "boolean" || !["edit", "new"].includes(String(input.kind))
    || ![input.timestamp, input.receivedAt, input.oldLength, input.newLength].every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0)) throw new Error("Invalid raw event contract");
  return input as unknown as WikiEdit;
}

export function enrich(edit: WikiEdit, now = Date.now()): EnrichedEdit {
  return { ...edit, language: edit.wiki.replace(/wiki$/, ""), delta: edit.newLength - edit.oldLength, enrichedAt: now };
}

export function parseEnriched(input: unknown): EnrichedEdit {
  const raw = parseRaw(input);
  const value = input as Record<string, unknown>;
  if (value.language !== raw.wiki.replace(/wiki$/, "") || value.delta !== raw.newLength - raw.oldLength || typeof value.enrichedAt !== "number" || !Number.isFinite(value.enrichedAt)) throw new Error("Invalid enriched event contract");
  return input as EnrichedEdit;
}
