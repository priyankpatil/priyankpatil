// Writes lib/cx-eval/snapshot.json: the dashboard's fallback when the site
// cannot reach the database (no CXEVAL_READ_URL, or a query fails). Runs the
// same queries as the page, so the snapshot and the live view never diverge.
//
//   set -a; source .env; set +a
//   npx tsx pipelines/cx-eval/scripts/export-snapshot.mts

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createPool, queryDashboard } from "../../../lib/cx-eval/queries.ts";

const url = process.env.CXEVAL_READ_URL;
if (!url) {
  console.error("Set CXEVAL_READ_URL (read-only dashboard role).");
  process.exit(1);
}

const pool = createPool(url);
try {
  const data = await queryDashboard(pool);
  const out = fileURLToPath(new URL("../../../lib/cx-eval/snapshot.json", import.meta.url));
  await writeFile(out, JSON.stringify(data, null, 1) + "\n");
  const scored = data.daily.reduce((n, d) => n + d.scored, 0);
  console.log(`Wrote ${out}: ${data.daily.length} days, ${scored} scored chats, ${data.alerts.length} alerts.`);
} finally {
  await pool.end();
}
