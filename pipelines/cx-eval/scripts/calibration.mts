// Human calibration for the rubric (RUBRIC.md → "Scoring sheet").
//
//   npx tsx pipelines/cx-eval/scripts/calibration.mts --export          # writes calibration/sheet-1.md + .csv
//   npx tsx pipelines/cx-eval/scripts/calibration.mts --import --rater priyank
//
// The sample is stratified so the hard cases are represented: chats ground
// truth fails on identity, chats where the judge and ground truth disagree,
// FAQ chats, and ordinary ones. Judge and ground-truth answers are NOT in the
// sheet, so the human scores blind.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

const DIR = "pipelines/cx-eval/calibration";
const SHEET = `${DIR}/sheet-1`;
const COLUMNS = ["convo_id", "intent", "identity_verification", "policy_adherence", "resolution", "empathy", "notes"];

const dbUrl = process.env.CXEVAL_DATABASE_URL ?? process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Set CXEVAL_DATABASE_URL (or SUPABASE_DB_URL).");
  process.exit(1);
}
const db = new pg.Client({ connectionString: dbUrl });
await db.connect();

async function exportSheet() {
  const { rows } = await db.query(`
    with pool as (
      select m.*, case
               when m.gt_identity = 'fail' then 'identity_fail'
               when m.identity_correct = false or m.policy_correct = false then 'disagreement'
               when m.is_faq then 'faq'
               else 'ordinary' end as stratum,
             cx_eval.hash_unit(m.convo_id, 'calibration') as r
      from cx_eval.mart_conversation_scores m
      where m.model = 'openai/gpt-oss-20b'
    ),
    ranked as (select *, row_number() over (partition by stratum order by r) as k from pool)
    select convo_id, stratum, logged_reason,
           (select string_agg(upper(t.speaker) || ': ' || coalesce('[' || t.button || '] ', '') || t.text, E'\n' order by t.turn_idx)
            from cx_eval.turns t where t.convo_id = ranked.convo_id) as transcript,
           (select array_to_string(policy_steps, ' → ') from cx_eval.ref_subflows where subflow = ranked.logged_reason) as steps
    from ranked
    where (stratum = 'identity_fail' and k <= 4) or (stratum = 'disagreement' and k <= 4)
       or (stratum = 'faq' and k <= 3) or (stratum = 'ordinary' and k <= 4)
    order by r`);
  mkdirSync(DIR, { recursive: true });
  const md = [
    "# Calibration sheet 1",
    "",
    `${rows.length} conversations. Score each with [RUBRIC.md](../RUBRIC.md) and record your answers in \`sheet-1.csv\` (one row per conversation, already listed).`,
    "Score blind: don't look up the judge's or ground truth's answers first. Then import with `calibration.mts --import --rater <name>`.",
    "",
    ...rows.flatMap((r, i) => [
      `## ${i + 1}. ${r.convo_id}`,
      "",
      `- Logged contact reason (may be wrong): \`${r.logged_reason}\``,
      `- Policy steps for it: ${r.steps || "none (FAQ intent)"}`,
      "",
      "```",
      r.transcript,
      "```",
      "",
    ]),
  ].join("\n");
  writeFileSync(`${SHEET}.md`, md);
  writeFileSync(`${SHEET}.csv`, [COLUMNS.join(","), ...rows.map((r) => `${r.convo_id},,,,,,`)].join("\n") + "\n");
  const strata = rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.stratum]: (acc[r.stratum] ?? 0) + 1 }), {});
  console.log(`Wrote ${SHEET}.md and ${SHEET}.csv (${rows.length} conversations: ${JSON.stringify(strata)})`);
}

async function importSheet(rater: string) {
  const lines = readFileSync(`${SHEET}.csv`, "utf8").trim().split("\n").slice(1);
  let n = 0;
  for (const line of lines) {
    // Notes may contain commas; everything after the 6th comma is the note.
    const parts = line.split(",");
    const [convoId, intent, identity, policy, resolution, empathy] = parts.map((p) => p.trim());
    const notes = parts.slice(6).join(",").trim();
    if (!intent && !identity && !policy && !resolution && !empathy) continue;
    await db.query(
      `INSERT INTO cx_eval.human_labels (convo_id, rater, intent, identity_verification, policy_adherence, resolution, empathy, notes)
       VALUES ($1, $2, nullif($3, ''), nullif($4, ''), nullif($5, ''), nullif($6, ''), nullif($7, '')::int, nullif($8, ''))
       ON CONFLICT (convo_id, rater) DO UPDATE SET intent = excluded.intent,
         identity_verification = excluded.identity_verification, policy_adherence = excluded.policy_adherence,
         resolution = excluded.resolution, empathy = excluded.empathy, notes = excluded.notes, labelled_at = now()`,
      [convoId, rater, intent, identity, policy, resolution, empathy, notes]
    );
    n++;
  }
  console.log(`Imported ${n} labelled conversations for ${rater}.`);
  const { rows } = await db.query("SELECT * FROM cx_eval.mart_human_agreement WHERE rater = $1", [rater]);
  console.table(rows);
}

try {
  if (process.argv.includes("--export")) await exportSheet();
  else if (process.argv.includes("--import")) {
    const i = process.argv.indexOf("--rater");
    if (i === -1) throw new Error("--import needs --rater <name>");
    await importSheet(process.argv[i + 1]);
  } else console.log("Use --export or --import --rater <name>.");
} finally {
  await db.end();
}
