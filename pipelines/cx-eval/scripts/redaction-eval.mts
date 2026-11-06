// Measures PII redaction (cx_eval.pii_redact) against ground truth.
//
//   npx tsx pipelines/cx-eval/scripts/redaction-eval.mts [--data <dir>] [--write] [--misses <type> <n>]
//
// ABCD ships each conversation with the customer profile the crowdworkers
// role-played (name, email, phone, username, account id, address, order id,
// PIN, security answer, password). Redaction never sees the profile: it works
// from the text alone. This script uses the profile only afterwards, to score
// what was missed (recall) and what was masked that is not personal data
// (precision). Nothing is written to the database; the function is pure.
//
// --write   saves aggregate scores (no values) to pipelines/cx-eval/redaction-eval.json
// --misses  prints a few missed values in context, for local debugging only
// --fp      prints masked values that are not in the profile, for local debugging only
//
// Connects with SUPABASE_DB_URL or CXEVAL_DATABASE_URL (needs the redaction migration).

import { writeFileSync } from "node:fs";
import pg from "pg";
import { extractAbcd, type AbcdConversation } from "../src/abcd.ts";

type Turn = { speaker: string; text: string; button?: string };
type Found = { kind: string; value: string; layer: string; placeholder: string };

const CHUNK = 250;
const TRUTH_FIELDS: { type: string; from: "personal" | "order"; key: string }[] = [
  { type: "name", from: "personal", key: "customer_name" },
  { type: "email", from: "personal", key: "email" },
  { type: "phone", from: "personal", key: "phone" },
  { type: "username", from: "personal", key: "username" },
  { type: "account_id", from: "personal", key: "account_id" },
  { type: "order_id", from: "order", key: "order_id" },
  { type: "street_address", from: "order", key: "street_address" },
  { type: "city", from: "order", key: "city" },
  { type: "zip_code", from: "order", key: "zip_code" },
  { type: "pin", from: "personal", key: "pin_number" },
  { type: "security_answer", from: "personal", key: "security_answer" },
  { type: "password", from: "personal", key: "password" },
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/**
 * Why a value was missed, read from the turn's shape. Ordered: the first match wins.
 * Rules work from cues (a label, the agent's question, a known line format), so
 * each reason is a way the cue was absent or took a shape the rules don't cover.
 */
const MISS_REASONS = {
  action_line: "System line in a format the templates don't cover",
  packed: "Listed with other details, no label for this one",
  bare_reply: "Bare reply, but the question was earlier or unrecognised",
  cue_unmatched: "Cue is there, sentence shape not covered",
  passing_mention: "Mentioned in passing: no label, no question",
} as const;
type MissReason = keyof typeof MISS_REASONS;
const CUE = /\b(name|it'?s|this is|here|answer|security|maiden|password|passwork|p\/w|account|acct|id|user|zip|address|pin)\b/i;

function missReason(t: Turn, redactedText: string, value: string): MissReason {
  if (t.speaker === "action") return "action_line";
  if (/\[[A-Z_]+(?:_\d+)?\]/.test(redactedText)) return "packed";
  const rest = t.text.replace(new RegExp(escape(value), "ig"), "").replace(/[^A-Za-z]+/g, " ").trim();
  if (rest.length <= 12) return "bare_reply";
  if (CUE.test(t.text)) return "cue_unmatched";
  return "passing_mention";
}

const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
const occurs = (text: string, value: string) =>
  new RegExp(`(?<![A-Za-z0-9])${escape(value)}(?![A-Za-z0-9])`, "i").test(text);

/** Same turn shape the source simulator delivers (original text + logged button). */
function turnsOf(c: AbcdConversation): Turn[] {
  return c.original.map(([speaker, text], i) => {
    const button = c.delexed[i]?.targets?.[2];
    return speaker === "action" && typeof button === "string" ? { speaker, text, button } : { speaker, text };
  });
}

/** Profile values worth checking: long enough to be meaningful, with the name's parts. */
function truthOf(c: AbcdConversation): { type: string; value: string }[] {
  const scenario = c.scenario as unknown as Record<string, Record<string, unknown>>;
  const out: { type: string; value: string }[] = [];
  for (const f of TRUTH_FIELDS) {
    const v = scenario[f.from]?.[f.key];
    if (v === undefined || v === null) continue;
    const value = String(v).trim();
    if (value.length >= 3) out.push({ type: f.type, value });
    if (f.type === "name") {
      for (const part of value.split(/\s+/)) if (part.length >= 3) out.push({ type: "name_part", value: part });
    }
  }
  return out;
}

const dbUrl = process.env.SUPABASE_DB_URL ?? process.env.CXEVAL_DATABASE_URL;
if (!dbUrl) {
  console.error("Set SUPABASE_DB_URL (or CXEVAL_DATABASE_URL).");
  process.exit(1);
}

const data = await extractAbcd(arg("data") ?? "pipelines/cx-eval/.data");
const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

const recall = new Map<string, { present: number; missed: number }>();
const precision = new Map<string, { masked: number; personal: number }>();
// Masked values that are not in the profile but are personal data by construction:
// well-formed contact details, and credentials an agent issued ("Your new password is …").
let verifiedExtra = 0;
const byLayer = new Map<string, number>();
const missWanted = process.argv.includes("--misses") ? { type: process.argv[process.argv.indexOf("--misses") + 1], n: Number(process.argv[process.argv.indexOf("--misses") + 2] ?? 10) } : null;
const misses: string[] = [];
const missesByReason = new Map<MissReason, { total: number; byType: Record<string, number> }>();
const fpWanted = process.argv.includes("--fp") ? { kind: process.argv[process.argv.indexOf("--fp") + 1], n: Number(process.argv[process.argv.indexOf("--fp") + 2] ?? 10) } : null;
const falsePositives: string[] = [];
let turnsTotal = 0;
let leakTurns = 0;
const started = Date.now();

try {
  for (let i = 0; i < data.conversations.length; i += CHUNK) {
    const chunk = data.conversations.slice(i, i + CHUNK);
    const { rows } = await client.query<{ r: { turns: Turn[]; found: Found[] } }>(
      "SELECT cx_eval.pii_redact(t) AS r FROM unnest($1::jsonb[]) WITH ORDINALITY AS u(t, o) ORDER BY o",
      [chunk.map((c) => JSON.stringify(turnsOf(c)))]
    );

    chunk.forEach((c, j) => {
      const original = turnsOf(c);
      const { turns: redacted, found } = rows[j].r;
      const truth = truthOf(c);
      turnsTotal += redacted.length;

      // Recall: every turn where a profile value appeared, and whether it is still there.
      original.forEach((t, k) => {
        for (const { type, value } of truth) {
          if (!occurs(t.text, value)) continue;
          const stat = recall.get(type) ?? { present: 0, missed: 0 };
          stat.present++;
          if (occurs(redacted[k].text, value)) {
            stat.missed++;
            const reason = missReason(t, redacted[k].text, value);
            const r = missesByReason.get(reason) ?? { total: 0, byType: {} };
            r.total++;
            r.byType[type] = (r.byType[type] ?? 0) + 1;
            missesByReason.set(reason, r);
            if (missWanted && missWanted.type === type && misses.length < missWanted.n) {
              misses.push(`${type} "${value}" | prev: ${original[k - 1]?.text.slice(0, 70) ?? ""} | turn: ${t.text.slice(0, 90)}`);
            }
          }
          recall.set(type, stat);
        }
        if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\(\d{3}\)\s?\d{3}[ .-]?\d{4}/.test(redacted[k].text)) leakTurns++;
      });

      // Precision: a masked value counts as personal if it is, contains or is part of a profile value.
      for (const f of found) {
        const v = f.value.toLowerCase();
        const personal = truth.some(({ value }) => {
          const tv = value.toLowerCase();
          return tv === v || tv.includes(v) || v.includes(tv);
        });
        const stat = precision.get(f.kind) ?? { masked: 0, personal: 0 };
        stat.masked++;
        if (personal) stat.personal++;
        else if (["EMAIL", "PHONE", "ADDRESS", "ZIP", "CITY"].includes(f.kind) && f.layer === "pattern") verifiedExtra++;
        else if (original.some((t) => t.speaker === "agent" && /password/i.test(t.text) && occurs(t.text, f.value))) verifiedExtra++;
        if (!personal && fpWanted && fpWanted.kind === f.kind && falsePositives.length < fpWanted.n) {
          const at = original.findIndex((t) => occurs(t.text, f.value));
          falsePositives.push(`${f.kind}/${f.layer} "${f.value}" | prev: ${original[at - 1]?.text.slice(0, 60) ?? ""} | turn: ${original[at]?.text.slice(0, 90) ?? ""}`);
        }
        precision.set(f.kind, stat);
        byLayer.set(f.layer, (byLayer.get(f.layer) ?? 0) + 1);
      }
    });
  }
} finally {
  await client.end();
}

const pct = (a: number, b: number) => (b ? Math.round((1000 * a) / b) / 10 : null);
const recallRows = [...recall].map(([type, s]) => ({ type, present: s.present, missed: s.missed, recallPct: pct(s.present - s.missed, s.present) }));
const precisionRows = [...precision].map(([kind, s]) => ({ kind, masked: s.masked, personal: s.personal, precisionPct: pct(s.personal, s.masked) }));
const allPresent = recallRows.reduce((a, r) => a + r.present, 0);
const allMissed = recallRows.reduce((a, r) => a + r.missed, 0);
const allMasked = precisionRows.reduce((a, r) => a + r.masked, 0);
const allPersonal = precisionRows.reduce((a, r) => a + r.personal, 0);

const report = {
  evaluatedAt: new Date().toISOString(),
  dataset: `ABCD v1.1 (sha256 ${data.checksum.slice(0, 12)})`,
  conversations: data.conversations.length,
  turns: turnsTotal,
  overall: {
    recallPct: pct(allPresent - allMissed, allPresent),
    precisionPct: pct(allPersonal, allMasked),
    precisionInclVerifiedPct: pct(allPersonal + verifiedExtra, allMasked),
    present: allPresent, missed: allMissed, masked: allMasked, verifiedExtra,
  },
  recall: recallRows.sort((a, b) => b.present - a.present),
  precision: precisionRows.sort((a, b) => b.masked - a.masked),
  missesByReason: [...missesByReason]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([reason, r]) => ({ reason, label: MISS_REASONS[reason], missed: r.total, byType: r.byType })),
  valuesByLayer: Object.fromEntries([...byLayer].sort((a, b) => b[1] - a[1])),
  turnsWithEmailOrPhoneAfter: leakTurns,
  note: "Recall counts turns where a profile value appeared. Strict precision counts masked values that match a profile value; the second figure also counts well-formed contact details and agent-issued passwords that are not in the profile (a customer's new address, a second phone number). Profile values are ground truth only and are never used for redaction or stored.",
};

console.log(`Evaluated ${report.conversations} conversations (${report.turns} turns) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`Overall recall ${report.overall.recallPct}% · precision ${report.overall.precisionPct}% (profile matches only), ${report.overall.precisionInclVerifiedPct}% counting other contact details and issued credentials`);
console.log("\nRecall by profile field");
for (const r of report.recall) console.log(`  ${r.type.padEnd(16)} ${String(r.recallPct).padStart(5)}%   ${r.present - r.missed}/${r.present}`);
console.log("\nPrecision by placeholder type");
for (const r of report.precision) console.log(`  ${r.kind.padEnd(16)} ${String(r.precisionPct).padStart(5)}%   ${r.personal}/${r.masked}`);
console.log("\nMisses by reason");
for (const r of report.missesByReason) console.log(`  ${String(r.missed).padStart(4)}  ${r.label}  ${JSON.stringify(r.byType)}`);
console.log(`\nValues by layer: ${JSON.stringify(report.valuesByLayer)}`);
console.log(`Turns still containing an email or phone format: ${leakTurns}`);
if (falsePositives.length) console.log(`\nNot in the profile (local debugging only):\n  ${falsePositives.join("\n  ")}`);
if (misses.length) console.log(`\nMissed (local debugging only):\n  ${misses.join("\n  ")}`);

if (process.argv.includes("--write")) {
  writeFileSync("pipelines/cx-eval/redaction-eval.json", JSON.stringify(report, null, 1) + "\n");
  console.log("\nWrote pipelines/cx-eval/redaction-eval.json");
}
