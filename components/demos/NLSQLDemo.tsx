"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { MAX_QUESTION_LENGTH } from "@/lib/nl-sql/constants";

// ── Schema ──────────────────────────────────────────────────────────────────

const SCHEMA = [
  { table: "orders",         columns: ["order_id","customer_id","product_id","order_date","status","total_amount","channel"] },
  { table: "customers",      columns: ["customer_id","segment","lifetime_value","acquisition_date","region","prime_member"] },
  { table: "products",       columns: ["product_id","product_name","category","brand","price","margin_pct"] },
  { table: "pharmacy_fills", columns: ["fill_id","customer_id","drug_id","fill_date","days_supply","copay","fill_status"] },
  { table: "inventory",      columns: ["product_id","warehouse_id","quantity_on_hand","reorder_point","last_restocked"] },
];

// ── Sample data ─────────────────────────────────────────────────────────────

// Fallback when live data is not configured.
const SAMPLE_DATA: Record<string, Record<string, string>[]> = {
  orders: [
    { order_id:"ord_8472a", customer_id:"cust_1234", product_id:"prod_9831", order_date:"2024-03-15", status:"completed",  total_amount:"$234.50", channel:"web"      },
    { order_id:"ord_2931b", customer_id:"cust_5678", product_id:"prod_4521", order_date:"2024-03-14", status:"completed",  total_amount:"$89.99",  channel:"mobile"   },
    { order_id:"ord_6183c", customer_id:"cust_9012", product_id:"prod_7732", order_date:"2024-03-14", status:"pending",    total_amount:"$156.75", channel:"web"      },
    { order_id:"ord_4827d", customer_id:"cust_3456", product_id:"prod_2219", order_date:"2024-03-13", status:"completed",  total_amount:"$412.00", channel:"pharmacy" },
    { order_id:"ord_9174e", customer_id:"cust_7890", product_id:"prod_6643", order_date:"2024-03-12", status:"refunded",   total_amount:"$67.25",  channel:"web"      },
  ],
  customers: [
    { customer_id:"cust_1234", segment:"Champions",  lifetime_value:"$4,820", acquisition_date:"2021-06-10", region:"Northeast", prime_member:"true"  },
    { customer_id:"cust_5678", segment:"Promising",  lifetime_value:"$892",   acquisition_date:"2024-01-22", region:"Southeast", prime_member:"false" },
    { customer_id:"cust_9012", segment:"At-Risk",    lifetime_value:"$3,240", acquisition_date:"2020-03-05", region:"Midwest",   prime_member:"true"  },
    { customer_id:"cust_3456", segment:"Champions",  lifetime_value:"$6,100", acquisition_date:"2019-11-18", region:"West",      prime_member:"true"  },
    { customer_id:"cust_7890", segment:"Inactive",   lifetime_value:"$210",   acquisition_date:"2022-08-30", region:"Southwest", prime_member:"false" },
  ],
  products: [
    { product_id:"prod_9831", product_name:"Metformin 500mg",    category:"Diabetes",       brand:"Generic",  price:"$12.99", margin_pct:"62%" },
    { product_id:"prod_4521", product_name:"Lisinopril 10mg",    category:"Blood Pressure", brand:"Generic",  price:"$8.50",  margin_pct:"58%" },
    { product_id:"prod_7732", product_name:"Atorvastatin 20mg",  category:"Cholesterol",    brand:"Lipitor",  price:"$45.00", margin_pct:"41%" },
    { product_id:"prod_2219", product_name:"Vitamin D3 2000IU",  category:"Supplements",    brand:"Nature",   price:"$18.75", margin_pct:"72%" },
    { product_id:"prod_6643", product_name:"Omeprazole 20mg",    category:"GI",             brand:"Generic",  price:"$14.25", margin_pct:"65%" },
  ],
  pharmacy_fills: [
    { fill_id:"fill_7821", customer_id:"cust_1234", drug_id:"drug_0031", fill_date:"2024-03-10", days_supply:"90", copay:"$10.00", fill_status:"dispensed" },
    { fill_id:"fill_4932", customer_id:"cust_9012", drug_id:"drug_0047", fill_date:"2024-03-08", days_supply:"30", copay:"$5.00",  fill_status:"dispensed" },
    { fill_id:"fill_1083", customer_id:"cust_5678", drug_id:"drug_0019", fill_date:"2024-03-05", days_supply:"90", copay:"$0.00",  fill_status:"dispensed" },
    { fill_id:"fill_6294", customer_id:"cust_3456", drug_id:"drug_0031", fill_date:"2024-03-01", days_supply:"90", copay:"$10.00", fill_status:"dispensed" },
    { fill_id:"fill_3815", customer_id:"cust_7890", drug_id:"drug_0062", fill_date:"2024-02-28", days_supply:"30", copay:"$20.00", fill_status:"abandoned" },
  ],
  inventory: [
    { product_id:"prod_9831", warehouse_id:"wh-east-01", quantity_on_hand:"4,820", reorder_point:"500", last_restocked:"2024-03-01" },
    { product_id:"prod_4521", warehouse_id:"wh-west-02", quantity_on_hand:"312",   reorder_point:"400", last_restocked:"2024-02-15" },
    { product_id:"prod_7732", warehouse_id:"wh-east-01", quantity_on_hand:"891",   reorder_point:"200", last_restocked:"2024-03-10" },
    { product_id:"prod_2219", warehouse_id:"wh-central", quantity_on_hand:"127",   reorder_point:"300", last_restocked:"2024-02-20" },
    { product_id:"prod_6643", warehouse_id:"wh-west-02", quantity_on_hand:"2,340", reorder_point:"600", last_restocked:"2024-03-05" },
  ],
};

const SAMPLE_QUESTIONS = [
  "Top 10 customers by lifetime value with order count",
  "Monthly revenue for the past 12 months",
  "Fill rate by region — prime vs non-prime",
  "Products with inventory below reorder point",
  "Average order value by acquisition channel",
];

// ── SQL highlighting ─────────────────────────────────────────────────────────

const KW = new Set(["SELECT","FROM","WHERE","JOIN","LEFT","RIGHT","INNER","OUTER","ON","AS","GROUP","BY","ORDER","HAVING","LIMIT","AND","OR","NOT","IN","DISTINCT","OVER","PARTITION","ASC","DESC","WITH","UNION","ALL","NULL","IS","BETWEEN","LIKE","CAST","INTERVAL","EXTRACT","CURRENT_DATE","RETURNING","FILTER","CASE","WHEN","THEN","ELSE","END","TRUE","FALSE","ILIKE","FULL","CROSS"]);
const FN = new Set(["COUNT","SUM","AVG","MAX","MIN","ROUND","COALESCE","DATE_TRUNC","ROW_NUMBER","RANK","DENSE_RANK","LAG","LEAD","NULLIF","GREATEST","LEAST","TO_CHAR","STRING_AGG","PERCENTILE_CONT"]);

function renderSQL(sql: string) {
  return sql.split(/(\s+|[(),;]|'[^']*'|--[^\n]*|\d+(?:\.\d+)?)/).map((tok, i) => {
    if (!tok) return null;
    if (tok.startsWith("'"))        return <span key={i} className="text-[#ce9178]">{tok}</span>;
    if (tok.startsWith("--"))       return <span key={i} className="italic text-[#6a9955]">{tok}</span>;
    if (/^\d+(\.\d+)?$/.test(tok)) return <span key={i} className="text-[#b5cea8]">{tok}</span>;
    const up = tok.toUpperCase();
    if (FN.has(up))  return <span key={i} className="text-[#dcdcaa]">{tok}</span>;
    if (KW.has(up))  return <span key={i} className="font-semibold text-[#569cd6]">{tok}</span>;
    return <span key={i} className="text-[#d4d4d4]">{tok}</span>;
  });
}

// Models sometimes wrap SQL in Markdown fences despite instructions.
function stripFences(text: string) {
  return text.replace(/^\s*```[a-zA-Z]*\s*\n?/, "").replace(/\n?```\s*$/, "");
}

// ── Pipeline events (mirrors lib/nl-sql/pipeline.ts) ────────────────────────

type Stage = "retrieve" | "generate" | "validate" | "execute";
type StageStatus = "idle" | "running" | "done" | "error";
type Cell = string | number | boolean | null;

interface ResultSet { columns: string[]; rows: Cell[][]; rowCount: number; truncated: boolean; durationMs: number }
interface Context { mode: "hybrid" | "full-text" | "static"; tables: string[]; definitions: string[]; examples: string[] }
interface RunMeta { model: string | null; attempts: number; executed: boolean; latencyMs: number }

type PipelineEvent =
  | { type: "stage"; stage: Stage; status: "start" | "done" | "error"; detail?: string }
  | ({ type: "context" } & Context)
  | { type: "sql_delta"; text: string }
  | { type: "sql_reset"; reason: string }
  | { type: "sql"; sql: string }
  | ({ type: "result" } & ResultSet)
  | { type: "notice"; message: string }
  | { type: "error"; message: string }
  | ({ type: "done" } & RunMeta);

const STAGES: { key: Stage; label: string }[] = [
  { key: "retrieve", label: "Retrieve" },
  { key: "generate", label: "Generate" },
  { key: "validate", label: "Validate" },
  { key: "execute",  label: "Run" },
];

const IDLE_STAGES: Record<Stage, StageStatus> = { retrieve: "idle", generate: "idle", validate: "idle", execute: "idle" };

const MODE_LABEL: Record<Context["mode"], string> = {
  "hybrid": "hybrid search (vector + full-text)",
  "full-text": "full-text search",
  "static": "full schema",
};

function formatCell(value: Cell) {
  if (value === null) return "—";
  if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return String(value);
}

// ── Tables ──────────────────────────────────────────────────────────────────

function ResultTable({ columns, rows, caption }: { columns: string[]; rows: Cell[][]; caption: string }) {
  const cell = "whitespace-nowrap px-3 py-1.5 font-mono";
  return (
    <div className="overflow-x-auto">
      <p className="mb-2 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#858585]">{caption}</p>
      {rows.length === 0 ? (
        <p className="font-mono text-[0.75rem] text-[#858585]">No rows returned.</p>
      ) : (
        <table className="w-full border-collapse text-[0.75rem]">
          <thead>
            <tr>
              {columns.map(c => (
                <th key={c} className={`${cell} border-b border-[#3e3e3e] text-left text-[0.68rem] font-semibold text-[#858585]`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((value, j) => (
                  <td key={j} className={`${cell} border-b border-[#2d2d2d] text-[0.72rem] ${typeof value === "number" ? "text-right text-[#b5cea8]" : "text-[#d4d4d4]"}`}>
                    {formatCell(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TablePreview({ table }: { table: string }) {
  const [live, setLive] = useState<ResultSet | null>(null);
  const [state, setState] = useState<"loading" | "live" | "sample">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`/api/nl-sql/preview?table=${encodeURIComponent(table)}`)
      .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: ResultSet) => { if (!cancelled) { setLive(data); setState("live"); } })
      .catch(() => { if (!cancelled) setState("sample"); });
    return () => { cancelled = true; };
  }, [table]);

  if (state === "loading") return <p className="font-mono text-[0.75rem] text-[#858585]">Loading {table}…</p>;
  if (state === "live" && live) return <ResultTable columns={live.columns} rows={live.rows} caption={`${table} — live sample (5 rows)`} />;

  const sample = SAMPLE_DATA[table] ?? [];
  const columns = Object.keys(sample[0] ?? {});
  return <ResultTable columns={columns} rows={sample.map(r => columns.map(c => r[c]))} caption={`${table} — sample data (5 rows)`} />;
}

// ── Main component ───────────────────────────────────────────────────────────

export default function NLSQLDemo() {
  const [question,     setQuestion]     = useState("");
  const [sql,          setSql]          = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [notice,       setNotice]       = useState("");
  const [stages,       setStages]       = useState<Record<Stage, StageStatus>>(IDLE_STAGES);
  const [context,      setContext]      = useState<Context | null>(null);
  const [repairs,      setRepairs]      = useState<string[]>([]);
  const [result,       setResult]       = useState<ResultSet | null>(null);
  const [meta,         setMeta]         = useState<RunMeta | null>(null);
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set(["orders","customers"]));
  const [previewTable, setPreviewTable] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const mentioned = useMemo(() => {
    const found = new Set<string>(context?.tables ?? []);
    const lower = sql.toLowerCase();
    for (const { table, columns } of SCHEMA) {
      if (lower.includes(table)) found.add(table);
      for (const col of columns) if (lower.includes(col)) found.add(`${table}.${col}`);
    }
    return found;
  }, [sql, context]);

  const toggle = (t: string) =>
    setExpanded(prev => { const n = new Set(prev); if (n.has(t)) { n.delete(t); } else { n.add(t); } return n; });

  const handleEvent = useCallback((event: PipelineEvent) => {
    switch (event.type) {
      case "stage":
        setStages(prev => ({ ...prev, [event.stage]: event.status === "start" ? "running" : event.status }));
        break;
      case "context":
        setContext({ mode: event.mode, tables: event.tables, definitions: event.definitions, examples: event.examples });
        break;
      case "sql_delta":
        setSql(prev => prev + event.text);
        break;
      case "sql_reset":
        setRepairs(prev => [...prev, event.reason]);
        setSql("");
        setStages(prev => ({ ...prev, generate: "idle", validate: "idle", execute: "idle" }));
        break;
      case "sql":
        setSql(event.sql);
        break;
      case "result":
        setResult({ columns: event.columns, rows: event.rows, rowCount: event.rowCount, truncated: event.truncated, durationMs: event.durationMs });
        break;
      case "notice":
        setNotice(event.message);
        break;
      case "error":
        setError(event.message);
        break;
      case "done":
        setMeta({ model: event.model, attempts: event.attempts, executed: event.executed, latencyMs: event.latencyMs });
        break;
    }
  }, []);

  const run = useCallback(async (q: string) => {
    if (!q.trim() || loading) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSql(""); setError(""); setNotice(""); setContext(null); setRepairs([]); setResult(null); setMeta(null);
    setStages(IDLE_STAGES); setLoading(true); setPreviewTable(null);
    try {
      const res = await fetch("/api/nl-sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
        signal: ctrl.signal,
      });
      if (!res.ok) { setError(await res.text()); return; }
      const reader = res.body!.getReader();
      const dec    = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) handleEvent(JSON.parse(line) as PipelineEvent);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        setError("The connection was interrupted before the query finished. Please try again.");
      }
    } finally { setLoading(false); }
  }, [loading, handleEvent]);

  const shownSql = stripFences(sql);
  const started = loading || meta !== null || Boolean(error);

  const stageDot = (status: StageStatus) =>
    status === "done"    ? "bg-[#4ec9b0]" :
    status === "running" ? "bg-[#569cd6] animate-pulse" :
    status === "error"   ? "bg-[#f48771]" : "bg-[#3e3e3e]";

  const pillBtn =
    "inline-flex items-center whitespace-nowrap rounded-full px-[0.9rem] py-[0.45rem] font-sans text-[0.78rem] font-medium disabled:opacity-50";
  const darkBtn = "rounded border border-[#3e3e3e] bg-transparent px-2 py-0.5 text-[0.65rem] text-[#858585]";
  const chip = "rounded border border-[#3e3e3e] px-1.5 py-0.5 font-mono text-[0.65rem] text-[#c5c5c5]";

  return (
    <div className="flex flex-col gap-4">
      {/* ── Main panel ── */}
      <div className="grid min-h-[480px] grid-cols-1 overflow-hidden rounded-[20px] border border-border bg-surface shadow-[var(--shadow)] md:grid-cols-[200px_1fr]">

        {/* Schema sidebar */}
        <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto border-b border-border p-4 md:max-h-none md:border-b-0 md:border-r">
          <p className="mb-[0.6rem] text-[0.62rem] font-bold uppercase tracking-[0.2em] text-soft">Schema</p>

          {SCHEMA.map(({ table, columns }) => {
            const tHit   = mentioned.has(table);
            const isOpen = expanded.has(table);
            const isPrev = previewTable === table;
            return (
              <div key={table}>
                <div className="flex items-center gap-0.5">
                  {/* Expand arrow */}
                  <button
                    type="button"
                    onClick={() => toggle(table)}
                    className={`flex flex-1 items-center gap-[5px] rounded-md px-1.5 py-1 text-left font-mono text-[0.74rem] font-medium ${tHit ? "bg-accent-soft text-text" : "bg-transparent text-muted"}`}
                  >
                    <span className="shrink-0 text-[0.55rem] text-soft">{isOpen ? "▾" : "▸"}</span>
                    {table}
                  </button>
                  {/* Preview button */}
                  <button
                    type="button"
                    title={`Preview ${table}`}
                    aria-label={`Preview ${table}`}
                    onClick={() => setPreviewTable(isPrev ? null : table)}
                    className={`rounded-[5px] px-[5px] py-1 text-[0.7rem] leading-none ${isPrev ? "bg-accent-soft text-accent" : "bg-transparent text-soft"}`}
                  >
                    ⊞
                  </button>
                </div>

                {isOpen && (
                  <div className="ml-4 flex flex-col gap-px pb-1">
                    {columns.map(col => {
                      const cHit = mentioned.has(`${table}.${col}`);
                      return (
                        <span
                          key={col}
                          className={`block rounded px-1.5 py-0.5 font-mono text-[0.68rem] transition-all duration-150 ${cHit ? "bg-accent-soft text-accent" : "bg-transparent text-soft"}`}
                        >
                          {col}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* SQL / results panel — always dark */}
        <div className="flex min-h-[320px] flex-col gap-3 overflow-y-auto bg-[#1e1e1e] p-5">
          <div className="flex items-center justify-between gap-3">
            {previewTable ? (
              <span className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-[#858585]">Table preview</span>
            ) : (
              <ol className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Pipeline progress">
                {STAGES.map(({ key, label }) => (
                  <li key={key} className="flex items-center gap-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[#858585]">
                    <span className={`h-1.5 w-1.5 rounded-full ${stageDot(stages[key])}`} />
                    {label}
                  </li>
                ))}
              </ol>
            )}
            <div className="flex shrink-0 gap-2">
              {previewTable && (
                <button type="button" onClick={() => setPreviewTable(null)} className={darkBtn}>
                  ← SQL
                </button>
              )}
              {shownSql && !previewTable && !loading && (
                <button type="button" onClick={() => navigator.clipboard.writeText(shownSql)} className={darkBtn}>
                  Copy
                </button>
              )}
            </div>
          </div>

          {previewTable ? (
            <TablePreview table={previewTable} />
          ) : !started ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-center font-mono text-[0.875rem] text-[#555]">
                {"// Ask a question below or click ⊞ to preview a table"}
              </p>
            </div>
          ) : (
            <>
              {context && (
                <div className="flex flex-col gap-1.5 border-b border-[#2d2d2d] pb-3">
                  <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[#858585]">
                    Context · {MODE_LABEL[context.mode]}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {context.tables.map(t => <span key={t} className={chip}>{t}</span>)}
                    {context.definitions.map(d => <span key={d} className={`${chip} border-[#4b3f72] text-[#c5b8f0]`}>{d}</span>)}
                  </div>
                  {context.examples.length > 0 && (
                    <p className="text-[0.65rem] leading-relaxed text-[#858585]">
                      Similar verified examples: {context.examples.join(" · ")}
                    </p>
                  )}
                </div>
              )}

              {repairs.map((reason, i) => (
                <p key={i} className="rounded border border-[#5a4a1f] bg-[#2b2615] px-2 py-1 font-mono text-[0.68rem] text-[#e5c07b]">
                  Self-correcting: {reason}
                </p>
              ))}

              {shownSql ? (
                <pre className="m-0 whitespace-pre-wrap font-mono text-[0.82rem] leading-[1.75]">
                  {renderSQL(shownSql)}
                  {loading && stages.generate === "running" && <span className="ml-0.5 inline-block h-[1em] w-0.5 animate-blink bg-[#569cd6] align-text-bottom" />}
                </pre>
              ) : loading ? (
                <p className="font-mono text-[0.82rem] text-[#555]">
                  {stages.retrieve === "running" ? "Retrieving schema, definitions and examples…" : "Generating SQL…"}
                </p>
              ) : null}

              {error && <p className="font-mono text-[0.85rem] text-[#f85149]">{error}</p>}
              {notice && <p className="font-mono text-[0.75rem] text-[#e5c07b]">{notice}</p>}

              {result && (
                <div className="border-t border-[#2d2d2d] pt-3">
                  <ResultTable
                    columns={result.columns}
                    rows={result.rows}
                    caption={`Result · ${result.rowCount}${result.truncated ? "+" : ""} rows · ${result.durationMs} ms`}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sample questions */}
      <div className="flex flex-wrap gap-2">
        {SAMPLE_QUESTIONS.map(q => (
          <button
            key={q}
            type="button"
            onClick={() => { setQuestion(q); run(q); }}
            disabled={loading}
            className={`${pillBtn} border border-border bg-transparent text-muted`}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={e => { e.preventDefault(); run(question); }} className="flex gap-3">
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Ask a question about the data…"
          aria-label="Question"
          maxLength={MAX_QUESTION_LENGTH}
          disabled={loading}
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 py-3 font-sans text-[0.875rem] text-text outline-none"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className={`${pillBtn} border-none bg-accent px-5 text-white disabled:cursor-not-allowed`}
        >
          {loading ? "Working…" : "Ask"}
        </button>
      </form>

      <p className="text-right text-[0.65rem] text-soft">
        {meta?.model
          ? `${meta.model.replace(/^[^/]+\//, "")} via Groq · ${(meta.latencyMs / 1000).toFixed(1)}s${meta.attempts > 1 ? " · self-corrected" : ""}`
          : "Open-weight models via Groq · RAG over Supabase pgvector"}
        {" · "}Click ⊞ to preview a table
      </p>
    </div>
  );
}
