"use client";

import { useState, useCallback, useRef, useMemo } from "react";

// ── Schema ──────────────────────────────────────────────────────────────────

const SCHEMA = [
  { table: "orders",         columns: ["order_id","customer_id","product_id","order_date","status","total_amount","channel"] },
  { table: "customers",      columns: ["customer_id","segment","lifetime_value","acquisition_date","region","prime_member"] },
  { table: "products",       columns: ["product_id","product_name","category","brand","price","margin_pct"] },
  { table: "pharmacy_fills", columns: ["fill_id","customer_id","drug_id","fill_date","days_supply","copay","fill_status"] },
  { table: "inventory",      columns: ["product_id","warehouse_id","quantity_on_hand","reorder_point","last_restocked"] },
];

// ── Sample data ─────────────────────────────────────────────────────────────

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

const KW = new Set(["SELECT","FROM","WHERE","JOIN","LEFT","RIGHT","INNER","OUTER","ON","AS","GROUP","BY","ORDER","HAVING","LIMIT","AND","OR","NOT","IN","DISTINCT","OVER","PARTITION","ASC","DESC","WITH","UNION","ALL","NULL","IS","BETWEEN","LIKE","CAST","INTERVAL","EXTRACT","CURRENT_DATE","RETURNING"]);
const FN = new Set(["COUNT","SUM","AVG","MAX","MIN","ROUND","COALESCE","DATE_TRUNC","ROW_NUMBER","RANK","LAG","LEAD","NULLIF","CASE","WHEN","THEN","ELSE","END"]);

function renderSQL(sql: string) {
  return sql.split(/(\s+|[(),;]|'[^']*'|--[^\n]*|\d+(?:\.\d+)?)/).map((tok, i) => {
    if (!tok) return null;
    if (tok.startsWith("'"))        return <span key={i} style={{ color: "#ce9178" }}>{tok}</span>;
    if (tok.startsWith("--"))       return <span key={i} style={{ color: "#6a9955", fontStyle: "italic" }}>{tok}</span>;
    if (/^\d+(\.\d+)?$/.test(tok)) return <span key={i} style={{ color: "#b5cea8" }}>{tok}</span>;
    const up = tok.toUpperCase();
    if (FN.has(up))  return <span key={i} style={{ color: "#dcdcaa" }}>{tok}</span>;
    if (KW.has(up))  return <span key={i} style={{ color: "#569cd6", fontWeight: 600 }}>{tok}</span>;
    return <span key={i} style={{ color: "#d4d4d4" }}>{tok}</span>;
  });
}

// ── Data table ──────────────────────────────────────────────────────────────

function DataTable({ table }: { table: string }) {
  const rows = SAMPLE_DATA[table] ?? [];
  const cols = Object.keys(rows[0] ?? {});
  const th: React.CSSProperties = { padding: "6px 12px", textAlign: "left", fontSize: "0.68rem", fontWeight: 600, color: "#858585", borderBottom: "1px solid #3e3e3e", whiteSpace: "nowrap", fontFamily: "var(--font-mono)" };
  const td: React.CSSProperties = { padding: "6px 12px", fontSize: "0.72rem", color: "#d4d4d4", borderBottom: "1px solid #2d2d2d", whiteSpace: "nowrap", fontFamily: "var(--font-mono)" };
  return (
    <div style={{ overflowX: "auto" }}>
      <p style={{ color: "#858585", fontSize: "0.62rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.75rem" }}>
        {table} — sample data (5 rows)
      </p>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.75rem" }}>
        <thead>
          <tr>{cols.map(c => <th key={c} style={th}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>{cols.map(c => <td key={c} style={td}>{row[c]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function NLSQLDemo() {
  const [question,     setQuestion]     = useState("");
  const [sql,          setSql]          = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set(["orders","customers"]));
  const [previewTable, setPreviewTable] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const mentioned = useMemo(() => {
    const found = new Set<string>();
    const lower = sql.toLowerCase();
    for (const { table, columns } of SCHEMA) {
      if (lower.includes(table)) found.add(table);
      for (const col of columns) if (lower.includes(col)) found.add(`${table}.${col}`);
    }
    return found;
  }, [sql]);

  const toggle = (t: string) =>
    setExpanded(prev => { const n = new Set(prev); if (n.has(t)) { n.delete(t); } else { n.add(t); } return n; });

  const run = useCallback(async (q: string) => {
    if (!q.trim() || loading) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSql(""); setError(""); setLoading(true); setPreviewTable(null);
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
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setSql(acc);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") setError(e.message);
    } finally { setLoading(false); }
  }, [loading]);

  const panelContent = previewTable
    ? <DataTable table={previewTable} />
    : error
      ? <p style={{ color: "#f85149", fontSize: "0.85rem", fontFamily: "var(--font-mono)" }}>{error}</p>
      : sql
        ? <pre style={{ margin: 0, fontSize: "0.82rem", lineHeight: 1.75, whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)" }}>
            {renderSQL(sql)}
            {loading && <span style={{ display: "inline-block", width: "2px", height: "1em", background: "#569cd6", marginLeft: "2px", verticalAlign: "text-bottom", animation: "blink 1s step-end infinite" }} />}
          </pre>
        : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <p style={{ color: "#555", fontSize: "0.875rem", fontFamily: "var(--font-mono)" }}>
              {loading ? "Generating…" : "// Ask a question below or click a table to preview data"}
            </p>
          </div>;

  const pillBtn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", borderRadius: "999px",
    border: "1px solid var(--border)", background: "transparent",
    color: "var(--muted)", padding: "0.45rem 0.9rem", fontSize: "0.78rem",
    fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
    fontFamily: "var(--font-sans)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>

      {/* ── Main panel ── */}
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", minHeight: "440px", borderRadius: "20px", border: "1px solid var(--border)", overflow: "hidden", boxShadow: "var(--shadow)", background: "var(--surface)" }}>

        {/* Schema sidebar */}
        <div style={{ borderRight: "1px solid var(--border)", padding: "1rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px" }}>
          <p style={{ color: "var(--soft)", fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "0.6rem" }}>Schema</p>

          {SCHEMA.map(({ table, columns }) => {
            const tHit   = mentioned.has(table);
            const isOpen = expanded.has(table);
            const isPrev = previewTable === table;
            return (
              <div key={table}>
                <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                  {/* Expand arrow */}
                  <button type="button" onClick={() => toggle(table)} style={{ display: "flex", alignItems: "center", gap: "5px", flex: 1, padding: "4px 6px", borderRadius: "6px", border: "none", background: tHit ? "var(--accent-soft)" : "transparent", color: tHit ? "var(--text)" : "var(--muted)", cursor: "pointer", textAlign: "left", fontSize: "0.74rem", fontWeight: 500, fontFamily: "var(--font-mono)" }}>
                    <span style={{ fontSize: "0.55rem", color: "var(--soft)", flexShrink: 0 }}>{isOpen ? "▾" : "▸"}</span>
                    {table}
                  </button>
                  {/* Preview button */}
                  <button
                    type="button"
                    title={`Preview ${table}`}
                    onClick={() => setPreviewTable(isPrev ? null : table)}
                    style={{ padding: "4px 5px", borderRadius: "5px", border: "none", background: isPrev ? "var(--accent-soft)" : "transparent", color: isPrev ? "var(--accent)" : "var(--soft)", cursor: "pointer", fontSize: "0.7rem", lineHeight: 1 }}
                  >
                    ⊞
                  </button>
                </div>

                {isOpen && (
                  <div style={{ marginLeft: "1rem", display: "flex", flexDirection: "column", gap: "1px", paddingBottom: "4px" }}>
                    {columns.map(col => {
                      const cHit = mentioned.has(`${table}.${col}`);
                      return (
                        <span key={col} style={{ display: "block", fontSize: "0.68rem", fontFamily: "var(--font-mono)", padding: "2px 6px", borderRadius: "4px", color: cHit ? "var(--accent)" : "var(--soft)", background: cHit ? "var(--accent-soft)" : "transparent", transition: "all 0.15s" }}>
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

        {/* SQL / preview panel — always dark */}
        <div style={{ background: "#1e1e1e", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem", overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#858585", fontSize: "0.62rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}>
              {previewTable ? `${previewTable} · sample data` : "Generated SQL"}
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {previewTable && (
                <button type="button" onClick={() => setPreviewTable(null)} style={{ color: "#858585", fontSize: "0.65rem", background: "none", border: "1px solid #3e3e3e", borderRadius: "4px", padding: "2px 8px", cursor: "pointer" }}>
                  ← SQL
                </button>
              )}
              {sql && !previewTable && (
                <button type="button" onClick={() => navigator.clipboard.writeText(sql)} style={{ color: "#858585", fontSize: "0.65rem", background: "none", border: "1px solid #3e3e3e", borderRadius: "4px", padding: "2px 8px", cursor: "pointer" }}>
                  Copy
                </button>
              )}
            </div>
          </div>
          {panelContent}
        </div>
      </div>

      {/* Sample questions */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {SAMPLE_QUESTIONS.map(q => (
          <button key={q} type="button" onClick={() => { setQuestion(q); run(q); }} disabled={loading} style={{ ...pillBtn, opacity: loading ? 0.5 : 1 }}>
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={e => { e.preventDefault(); run(question); }} style={{ display: "flex", gap: "0.75rem" }}>
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Ask a question about the data…"
          disabled={loading}
          style={{ flex: 1, padding: "0.75rem 1rem", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.875rem", outline: "none", fontFamily: "var(--font-sans)" }}
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          style={{ ...pillBtn, background: "var(--accent)", color: "#fff", border: "none", paddingInline: "1.25rem", opacity: loading || !question.trim() ? 0.5 : 1, cursor: loading || !question.trim() ? "not-allowed" : "pointer" }}
        >
          {loading ? "Generating…" : "Generate SQL"}
        </button>
      </form>

      <p style={{ textAlign: "right", fontSize: "0.65rem", color: "var(--soft)" }}>
        Llama 3.3 70B via Groq · Click ⊞ on any table to preview sample data
      </p>
    </div>
  );
}
