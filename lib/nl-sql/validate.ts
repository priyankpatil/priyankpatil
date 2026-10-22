import { Parser } from "node-sql-parser/build/postgresql";
import { DEMO_TABLES } from "@/lib/nl-sql/knowledge";

// Application-level checks on model-written SQL before it reaches the
// database. The database is the real safety boundary (a login role with
// SELECT-only grants, a read-only transaction and a timeout); this layer
// rejects anything outside the demo's scope early and gives the model a
// precise error to repair.

const parser = new Parser();
const DIALECT = { database: "PostgresQL" };

const ALLOWED_FUNCTIONS = new Set([
  // aggregates
  "count", "sum", "avg", "min", "max", "stddev", "stddev_samp", "stddev_pop", "variance", "var_samp", "var_pop",
  "percentile_cont", "percentile_disc", "mode", "string_agg", "array_agg", "bool_and", "bool_or", "every", "corr",
  // window
  "row_number", "rank", "dense_rank", "lag", "lead", "first_value", "last_value", "nth_value", "ntile",
  "percent_rank", "cume_dist",
  // math
  "round", "ceil", "ceiling", "floor", "abs", "power", "sqrt", "ln", "log", "exp", "mod", "sign", "trunc", "random",
  // conditional
  "coalesce", "nullif", "greatest", "least",
  // dates
  "date_trunc", "date_part", "extract", "to_char", "to_date", "age", "now", "make_date", "make_interval",
  "justify_days", "justify_interval", "generate_series", "date", "current_date",
  // strings
  "lower", "upper", "initcap", "length", "char_length", "concat", "concat_ws", "substring", "substr", "trim",
  "ltrim", "rtrim", "replace", "split_part", "left", "right", "position", "strpos", "format",
  // casts
  "cast", "to_number",
]);

// Belt and braces: never allow these, however they are written.
const DENYLIST = /\b(set_config|current_setting|query_to_xml\w*|table_to_xml\w*|cursor_to_xml\w*|schema_to_xml\w*|database_to_xml\w*|dblink\w*|pg_\w+|lo_\w+|copy)\s*\(|\bu&['"]/i;

export interface ValidationResult {
  ok: boolean;
  sql: string;
  error?: string;
  tables: string[];
}

// The system prompt asks the model to answer with this marker instead of SQL
// when a question is out of scope (writes, other data, not a data question).
export const CANNOT_ANSWER = "-- CANNOT_ANSWER:";
const DEFAULT_REFUSAL = "This demo can only answer read-only questions about the sample pharmacy data.";

/**
 * Returns a message for the user when the model declined to write SQL, either
 * with the marker or with plain prose, or null when the output looks like SQL.
 * A refusal is final: asking the model to repair it only produces another one.
 */
export function refusalReason(raw: string): string | null {
  const text = cleanSql(raw);
  const marker = text.toUpperCase().indexOf(CANNOT_ANSWER);
  if (marker !== -1) {
    const reason = text.slice(marker + CANNOT_ANSWER.length).split("\n")[0].trim();
    return reason ? reason.slice(0, 200) : DEFAULT_REFUSAL;
  }
  const firstCode = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("--"));
  if (!firstCode) return text ? DEFAULT_REFUSAL : null;
  return /^(select|with|\()/i.test(firstCode) ? null : DEFAULT_REFUSAL;
}

export function cleanSql(raw: string): string {
  return raw
    .replace(/^\s*```[a-zA-Z]*\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim()
    .replace(/;\s*$/, "")
    .trim();
}

function functionNames(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) functionNames(child, out);
    return;
  }
  const n = node as Record<string, unknown>;
  if (n.type === "function") {
    const name = n.name as { name?: { value?: string }[] } | string | undefined;
    const parts = typeof name === "string" ? [name] : (name?.name ?? []).map((p) => p.value ?? "");
    out.add(parts.join(".").toLowerCase());
  } else if (n.type === "aggr_func" && typeof n.name === "string") {
    out.add(n.name.toLowerCase());
  } else if (n.type === "cast") {
    out.add("cast");
  }
  for (const value of Object.values(n)) functionNames(value, out);
}

function cteNames(ast: Record<string, unknown>): Set<string> {
  const names = new Set<string>();
  const withClause = ast.with as { name?: { value?: string } | string }[] | null | undefined;
  for (const cte of withClause ?? []) {
    const name = typeof cte.name === "string" ? cte.name : cte.name?.value;
    if (name) names.add(name.toLowerCase());
  }
  return names;
}

export function validateSql(raw: string): ValidationResult {
  const sql = cleanSql(raw);
  const fail = (error: string): ValidationResult => ({ ok: false, sql, error, tables: [] });

  if (!sql) return fail("The model returned no SQL.");
  if (DENYLIST.test(sql.replace(/"/g, ""))) return fail("The query uses a function that is not allowed in this demo.");

  let ast: unknown;
  let tableRefs: string[];
  try {
    ast = parser.astify(sql, DIALECT);
    tableRefs = parser.tableList(sql, DIALECT);
  } catch (err) {
    return fail(`Could not parse the SQL: ${(err as Error).message.split("\n")[0].slice(0, 200)}`);
  }

  const statements = Array.isArray(ast) ? ast : [ast];
  if (statements.length !== 1) return fail("Only a single SQL statement is allowed.");
  const statement = statements[0] as Record<string, unknown>;
  if (statement.type !== "select") return fail("Only SELECT queries are allowed.");

  const ctes = cteNames(statement);
  const tables = new Set<string>();
  for (const ref of tableRefs) {
    const [kind, schema, table] = ref.split("::");
    const name = table.toLowerCase();
    if (kind.toLowerCase() !== "select") return fail("Only SELECT queries are allowed.");
    if (ctes.has(name) && (schema === "null" || !schema)) continue;
    if (schema && schema !== "null" && schema.toLowerCase() !== "nlsql_demo") {
      return fail(`Table ${schema}.${table} is not available. Use only: ${DEMO_TABLES.join(", ")}.`);
    }
    if (!(DEMO_TABLES as readonly string[]).includes(name)) {
      return fail(`Unknown table "${table}". Use only: ${DEMO_TABLES.join(", ")}.`);
    }
    tables.add(name);
  }

  const functions = new Set<string>();
  functionNames(statement, functions);
  const disallowed = [...functions].filter((f) => !ALLOWED_FUNCTIONS.has(f));
  if (disallowed.length) return fail(`Function(s) not allowed in this demo: ${disallowed.join(", ")}.`);

  return { ok: true, sql, tables: [...tables] };
}
