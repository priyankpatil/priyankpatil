// Extract + load: lands the Online Retail II workbook in customer_segments.raw_transactions,
// then runs the cleaning rules (SQL) and empties the raw table. No business logic here.
//
//   npx tsx pipelines/customer-segments/scripts/load.mts
//
//   --keep-raw     keep raw_transactions after cleaning (~130 MB in the database)
//   --data <dir>   dataset cache (default pipelines/customer-segments/.data)
//
// Connects with SUPABASE_DB_URL.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import pg from "pg";

const SOURCE = "https://archive.ics.uci.edu/static/public/502/online+retail+ii.zip";
const WORKBOOK = "online_retail_II.xlsx";
const CHUNK = 10_000;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Set SUPABASE_DB_URL.");
  process.exit(1);
}
const dataDir = arg("data") ?? "pipelines/customer-segments/.data";
const keepRaw = process.argv.includes("--keep-raw");

async function download(): Promise<string> {
  const workbook = join(dataDir, WORKBOOK);
  if (existsSync(workbook)) return workbook;
  mkdirSync(dataDir, { recursive: true });
  console.log(`Downloading ${SOURCE}`);
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const zip = join(dataDir, "online_retail_ii.zip");
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  execFileSync("unzip", ["-o", "-q", zip, WORKBOOK, "-d", dataDir]);
  return workbook;
}

interface Row {
  row_no: number;
  sheet: string;
  invoice: string;
  stock_code: string;
  description: string | null;
  quantity: number;
  invoice_date: string;
  price: number;
  customer_id: number | null;
  country: string | null;
}

const text = (v: unknown) => (v == null || v === "" ? null : String(v).trim());

async function insert(client: pg.Client, rows: Row[]) {
  const col = <K extends keyof Row>(k: K) => rows.map((r) => r[k]);
  await client.query(
    `insert into customer_segments.raw_transactions
     select * from unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[], $7::timestamp[], $8::numeric[], $9::int[], $10::text[])`,
    [col("row_no"), col("sheet"), col("invoice"), col("stock_code"), col("description"), col("quantity"), col("invoice_date"), col("price"), col("customer_id"), col("country")],
  );
}

const workbook = await download();
const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
await client.query("set statement_timeout = 0");

const started = Date.now();
await client.query("truncate customer_segments.raw_transactions");
const { rows: [run] } = await client.query<{ run_id: string }>(
  "insert into customer_segments.load_runs (source, sheets, rows_loaded) values ($1, '{}', 0) returning run_id",
  [SOURCE],
);

// Stream the workbook: both sheets have the same eight columns and a header row.
const reader = new ExcelJS.stream.xlsx.WorkbookReader(workbook, { sharedStrings: "cache", styles: "cache", hyperlinks: "ignore", worksheets: "emit" });
const sheets: string[] = [];
let rowNo = 0;
let buffer: Row[] = [];
for await (const sheet of reader) {
  const name = (sheet as unknown as { name: string }).name;
  sheets.push(name);
  for await (const row of sheet) {
    if (row.number === 1) continue;
    const v = row.values as unknown[]; // 1-based
    const date = v[5] instanceof Date ? v[5] : new Date(String(v[5]));
    buffer.push({
      row_no: ++rowNo,
      sheet: name,
      invoice: String(v[1]).trim(),
      stock_code: String(v[2]).trim(),
      description: text(v[3]),
      quantity: Number(v[4]),
      invoice_date: date.toISOString().slice(0, 19),
      price: Number(v[6]),
      customer_id: v[7] == null || v[7] === "" ? null : Math.round(Number(v[7])),
      country: text(v[8]),
    });
    if (buffer.length === CHUNK) {
      await insert(client, buffer);
      buffer = [];
      if (rowNo % 100_000 === 0) console.log(`  ${rowNo.toLocaleString()} rows`);
    }
  }
}
if (buffer.length) await insert(client, buffer);
await client.query("update customer_segments.load_runs set sheets = $2, rows_loaded = $3, finished_at = now() where run_id = $1", [run.run_id, sheets, rowNo]);
console.log(`Loaded ${rowNo.toLocaleString()} rows from ${sheets.join(", ")} in ${((Date.now() - started) / 1000).toFixed(0)}s`);

console.log("Cleaning");
await client.query("select customer_segments.clean_transactions()");
const { rows: log } = await client.query("select step, rule, rows_removed, rows_left from customer_segments.cleaning_log order by step");
console.table(log);

if (!keepRaw) {
  await client.query("truncate customer_segments.raw_transactions");
  console.log("Emptied raw_transactions (use --keep-raw to keep it).");
}
await client.end();
