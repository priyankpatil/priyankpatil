// Applies PII redaction to snapshots committed to the repo, which were exported
// from the database before redaction existed:
//   lib/cx-eval/demo.json                       chats shown on the project page
//                                               (`delivered` is the pre-redaction text, kept on purpose)
//   pipelines/cx-eval/calibration/sheet-1.md    the human calibration sheet
//
//   SUPABASE_DB_URL=... npx tsx pipelines/cx-eval/scripts/redact-published.mts
//
// Uses the database's own cx_eval.pii_redact() so the snapshots get exactly the
// redaction the pipeline applies. Each chat's transcript is redacted, then every
// other string in that chat (judge evidence, raw judge output) is masked with
// the values found in it. Re-exports from a backfilled database are already
// clean; this is for the existing files. Safe to re-run.

import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

type Turn = { speaker: string; text: string; button?: string };
type Found = { kind: string; value: string; placeholder: string };

const DEMO = "lib/cx-eval/demo.json";
const SHEET = "pipelines/cx-eval/calibration/sheet-1.md";

const dbUrl = process.env.SUPABASE_DB_URL ?? process.env.CXEVAL_DATABASE_URL;
if (!dbUrl) {
  console.error("Set SUPABASE_DB_URL (or CXEVAL_DATABASE_URL).");
  process.exit(1);
}
const client = new pg.Client({ connectionString: dbUrl });

async function redact(turns: Turn[]): Promise<{ turns: Turn[]; found: Found[] }> {
  const { rows } = await client.query("SELECT cx_eval.pii_redact($1::jsonb) AS r", [JSON.stringify(turns)]);
  return rows[0].r;
}

async function maskAll(texts: string[], found: Found[]): Promise<string[]> {
  if (!texts.length || !found.length) return texts;
  const { rows } = await client.query(
    "SELECT cx_eval.pii_mask_text(t, $2::jsonb) AS t FROM unnest($1::text[]) WITH ORDINALITY AS u(t, o) ORDER BY o",
    [texts, JSON.stringify(found)]
  );
  return rows.map((r) => r.t);
}

/** Masks every string leaf of an object in place, skipping the given keys. */
async function maskObject(obj: unknown, found: Found[], skip: Set<string>) {
  const refs: { holder: Record<string, unknown> | unknown[]; key: string | number }[] = [];
  const walk = (o: unknown) => {
    if (Array.isArray(o)) o.forEach((v, i) => (typeof v === "string" ? refs.push({ holder: o, key: i }) : walk(v)));
    else if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o)) {
        if (skip.has(k)) continue;
        if (typeof v === "string") refs.push({ holder: o as Record<string, unknown>, key: k });
        else walk(v);
      }
    }
  };
  walk(obj);
  const masked = await maskAll(refs.map((r) => (r.holder as Record<string | number, string>)[r.key]), found);
  refs.forEach((r, i) => ((r.holder as Record<string | number, string>)[r.key] = masked[i]));
}

async function redactDemo(): Promise<number> {
  const demo = JSON.parse(readFileSync(DEMO, "utf8"));
  let values = 0;
  for (const chat of demo.chats) {
    const transcript: Turn[] = chat.raw?.transcript ?? chat.raw?.messages ?? [];
    const { turns, found } = await redact(transcript);
    if (chat.raw?.transcript) chat.raw.transcript = turns;
    else if (chat.raw?.messages) chat.raw.messages = turns;
    await maskObject(chat, found, new Set(["transcript", "messages", "delivered", "promptHash", "id"]));
    values += found.length;
  }
  writeFileSync(DEMO, JSON.stringify(demo) + "\n");
  return values;
}

const LINE = /^(AGENT|CUSTOMER|ACTION): (?:\[([a-z0-9-]+)\] )?(.*)$/;

async function redactSheet(): Promise<number> {
  const lines = readFileSync(SHEET, "utf8").split("\n");
  let values = 0;
  // Each conversation's transcript is one fenced block of SPEAKER: text lines.
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== "```") continue;
    const end = lines.indexOf("```", i + 1);
    if (end === -1) break;
    const block = lines.slice(i + 1, end);
    const parsed = block.map((l) => LINE.exec(l));
    if (!parsed.every(Boolean)) {
      // A block that is not a transcript would be left unredacted: stop rather than skip.
      const bad = block.find((l, k) => !parsed[k]);
      throw new Error(`${SHEET}: unrecognised line in a transcript block: ${JSON.stringify(bad?.slice(0, 40))}`);
    }
    const turns: Turn[] = parsed.map((m) => {
      const [, speaker, button, text] = m!;
      return { speaker: speaker.toLowerCase(), text, ...(button ? { button } : {}) };
    });
    const { turns: out, found } = await redact(turns);
    values += found.length;
    out.forEach((t, k) => {
      lines[i + 1 + k] = `${t.speaker.toUpperCase()}: ${t.button ? `[${t.button}] ` : ""}${t.text}`;
    });
    i = end;
  }
  writeFileSync(SHEET, lines.join("\n"));
  return values;
}

await client.connect();
try {
  console.log(`${DEMO}: masked ${await redactDemo()} values`);
  console.log(`${SHEET}: masked ${await redactSheet()} values`);
} finally {
  await client.end();
}
