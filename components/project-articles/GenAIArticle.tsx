import ArchDiagram from "@/components/ArchDiagram";

const pipelineNodes = [
  { label: "NL Query", sublabel: "User intent" },
  { label: "Schema Retrieval", sublabel: "RAG · embedding search" },
  { label: "SQL Generation", sublabel: "LLM · few-shot prompted" },
  { label: "Validation", sublabel: "Parse + dry-run" },
  { label: "Execution", sublabel: "Warehouse · read-only" },
  { label: "Result", sublabel: "Formatted · audited" },
];

const feedbackNodes = [
  { label: "Query + Result", sublabel: "Execution pair" },
  { label: "User Feedback", sublabel: "Thumbs · correction" },
  { label: "Reward Signal", sublabel: "Success + rating" },
  { label: "Prompt Update", sublabel: "Few-shot pool refresh" },
  { label: "Better SQL", sublabel: "Next generation" },
];

const systemPromptExample = `SYSTEM PROMPT (excerpt)
────────────────────────────────────────────────────

You are a read-only SQL analyst with access to the following schema.
Generate valid Amazon Redshift SQL only. Never use UPDATE, DELETE,
INSERT, DROP, or any DDL statement. If the user's question cannot
be answered from the available tables, say so explicitly.

AVAILABLE TABLES
────────────────
fills (
  fill_id          BIGINT,        -- unique prescription fill event
  patient_id       BIGINT,        -- FK → customers.patient_id (PII-masked)
  ndc_code         VARCHAR(11),   -- national drug code (non-PII)
  channel          VARCHAR(20),   -- 'prime_rx' | 'mail_order' | 'retail'
  fill_ts          TIMESTAMP,     -- UTC time of dispense
  copay_usd        NUMERIC(10,2), -- patient copay amount
  cost_usd         NUMERIC(10,2), -- total drug cost
  days_supply      INT,           -- quantity dispensed in days
  status           VARCHAR(20)    -- 'completed' | 'returned' | 'partial'
)

orders (
  order_id         BIGINT,
  fill_id          BIGINT,        -- FK → fills.fill_id
  pharmacy_id      VARCHAR(8),    -- fulfillment location code
  promised_ts      TIMESTAMP,     -- SLA promise time
  shipped_ts       TIMESTAMP,     -- actual ship time
  delivery_days    INT            -- transit days, NULL if not yet delivered
)

RULES
──────
1. Always qualify ambiguous date columns with the table name.
2. When aggregating across channels, GROUP BY channel before filtering.
3. NULL delivery_days means the order is in-transit; exclude from SLA calcs
   unless the user explicitly asks for in-transit data.
4. Use DATE_TRUNC for all period bucketing — never EXTRACT alone.
5. Prefer CTEs over subqueries for readability.

FEW-SHOT EXAMPLES (highest-rated pairs from feedback pool)
──────────────────────────────────────────────────────────
Q: "What was the 30-day fill rate by channel last month?"
A:
WITH monthly_fills AS (
  SELECT
    channel,
    COUNT(*) FILTER (WHERE days_supply = 30)  AS thirty_day_fills,
    COUNT(*)                                   AS total_fills
  FROM fills
  WHERE DATE_TRUNC('month', fill_ts) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
  GROUP BY channel
)
SELECT
  channel,
  thirty_day_fills,
  total_fills,
  ROUND(100.0 * thirty_day_fills / NULLIF(total_fills, 0), 2) AS fill_rate_pct
FROM monthly_fills
ORDER BY fill_rate_pct DESC;`;

export default function GenAIArticle() {
  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "0 1rem" }}>
      {/* Lead paragraph */}
      <p
        style={{
          fontSize: "1.15rem",
          lineHeight: 1.8,
          color: "var(--text)",
          fontWeight: 450,
          marginBottom: "2.5rem",
          maxWidth: "640px",
        }}
      >
        Natural language to SQL is one of those demos that looks trivial in a notebook and breaks
        catastrophically in production. Getting a model to turn &ldquo;what was our fill rate last
        month?&rdquo; into a syntactically correct Redshift query is a solved problem. Getting it to
        do that reliably, safely, at scale, across a schema with hundreds of tables and PII-adjacent
        data — that&rsquo;s a different engineering problem entirely.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        This is a write-up of the production system I built at Amazon Pharmacy and the lessons it
        forced. It covers the full pipeline — from intent classification through schema retrieval,
        generation, validation, execution, and feedback capture — along with the privacy
        architecture that made it safe to deploy, and the reinforcement learning loop that made it
        get better over time.
      </p>

      {/* ── Section 1 ── */}
      <h2
        style={{
          fontSize: "clamp(1.15rem, 2vw, 1.45rem)",
          fontWeight: 700,
          color: "var(--text)",
          letterSpacing: "-0.02em",
          margin: "3rem 0 1rem 0",
          paddingTop: "3rem",
          borderTop: "1px solid var(--border)",
        }}
      >
        Why Naive Approaches Break
      </h2>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        The simplest version of NL-to-SQL is: stuff the entire schema into the system prompt and
        ask GPT-4 to write a query. For a schema with five tables and thirty columns, this works
        surprisingly well. For a production data warehouse with 300 tables and 8,000 columns — the
        kind of environment Uber&rsquo;s QueryGPT operates in — it fails in four distinct ways.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        <strong style={{ color: "var(--text)" }}>Context window saturation.</strong> A full schema
        dump for a mature warehouse will exceed the context limit of any production model. Even
        within the limit, attention degrades at the periphery. Tables mentioned in the first third
        of the prompt will be used more reliably than those buried in the middle. You cannot solve a
        retrieval problem by throwing more tokens at it.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        <strong style={{ color: "var(--text)" }}>Column hallucination.</strong> When a model
        doesn&rsquo;t find the column it needs, it invents one. This isn&rsquo;t a failure mode you
        can catch at generation time — the SQL looks valid. It fails at execution, or worse, it
        executes on a column that happens to exist but means something different. In a pharmacy
        context, a hallucinated column mapping in a cost query isn&rsquo;t just wrong; it could
        drive a procurement decision in the wrong direction.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        <strong style={{ color: "var(--text)" }}>Schema drift.</strong> Columns get renamed.
        Deprecated tables stay in the warehouse for months after they stop being populated. A prompt
        that was accurate in Q1 is subtly wrong by Q3 because nobody updated the schema description
        embedded in it. Static schema injection has no versioning story.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        <strong style={{ color: "var(--text)" }}>Ambiguity compounding.</strong> Business questions
        are semantically ambiguous in ways that domain experts don&rsquo;t notice. &ldquo;Active
        customers&rdquo; means different things to finance, marketing, and operations. An LLM will
        make a silent choice. The query runs. The result looks plausible. The decision it informs is
        based on a definition nobody agreed on. Ambiguity in the input doesn&rsquo;t produce an
        error — it produces a confidently wrong answer.
      </p>

      {/* ── Section 2 ── */}
      <h2
        style={{
          fontSize: "clamp(1.15rem, 2vw, 1.45rem)",
          fontWeight: 700,
          color: "var(--text)",
          letterSpacing: "-0.02em",
          margin: "3rem 0 1rem 0",
          paddingTop: "3rem",
          borderTop: "1px solid var(--border)",
        }}
      >
        The Production Pipeline
      </h2>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        A production NL-to-SQL system is not a prompt. It&rsquo;s a pipeline with at least six
        distinct stages, each of which can fail independently and needs to be observable
        independently.
      </p>

      <div style={{ margin: "2rem 0" }}>
        <div
          className="panel"
          style={{ padding: "2rem" }}
        >
          <ArchDiagram nodes={pipelineNodes} />
          <p
            style={{
              fontSize: "0.78rem",
              color: "var(--soft)",
              marginTop: "1.25rem",
              textAlign: "center",
              fontStyle: "italic",
            }}
          >
            The six-stage generation pipeline. Each stage emits a structured event for
            observability. Failures at any stage route to the self-correction loop before surfacing
            an error.
          </p>
        </div>
      </div>

      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        <strong style={{ color: "var(--text)" }}>Intent classification</strong> is the first gate.
        Before schema retrieval, a lightweight classifier — either a small fine-tuned model or a
        zero-shot LLM call — determines whether the query is (a) answerable from the available
        data, (b) a meta-question about the system itself, or (c) out of scope. Uber&rsquo;s
        QueryGPT uses a dedicated Intent Agent to route queries to the correct &ldquo;workspace&rdquo;
        — a curated collection of tables and SQL samples scoped to a specific business domain like
        Mobility, Ads, or Core Services. The workspace concept is the right abstraction: it bounds
        the retrieval problem and improves precision dramatically.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        <strong style={{ color: "var(--text)" }}>Schema retrieval</strong> happens against a
        pre-indexed embedding store. Tables and columns are embedded as rich semantic descriptions
        — not raw DDL. The query embedding is compared via cosine similarity to retrieve the
        most-relevant subset of schema, typically ten to twenty columns across three to five tables.
        This is where the difference between &ldquo;user_id&rdquo; and &ldquo;unique identifier for
        a customer session, joins to the orders table via session_id&rdquo; becomes load-bearing.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        <strong style={{ color: "var(--text)" }}>Validation</strong> runs before execution. A SQL
        parser checks syntax. A column-existence check runs the referenced column names against the
        live schema catalog. A dry-run against EXPLAIN (or Redshift&rsquo;s EXPLAIN equivalent)
        catches join errors and type mismatches without touching actual data. Queries that fail
        validation are not executed — they are fed back to the generation stage with the error
        appended.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        <strong style={{ color: "var(--text)" }}>Execution</strong> runs in a read-only IAM role
        with no write permissions on any table. Row limits are enforced at the query wrapper layer,
        not the generated SQL — because a model will sometimes omit a LIMIT clause. Result
        formatting is a separate step: numbers get locale-appropriate formatting, column headers get
        humanized, and the result is accompanied by the SQL that produced it, so users can verify
        what was run.
      </p>

      {/* ── Section 3 ── */}
      <h2
        style={{
          fontSize: "clamp(1.15rem, 2vw, 1.45rem)",
          fontWeight: 700,
          color: "var(--text)",
          letterSpacing: "-0.02em",
          margin: "3rem 0 1rem 0",
          paddingTop: "3rem",
          borderTop: "1px solid var(--border)",
        }}
      >
        Prompt Engineering and Schema Design
      </h2>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        The system prompt is the application logic. That sounds like a metaphor; it isn&rsquo;t.
        Every constraint, business rule, and edge-case handler that would live in code in a
        traditional system lives in the prompt in a production NL-to-SQL system. It deserves the
        same review process, versioning, and regression testing as code.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        Column descriptions outperform column names by a wide margin. A column called{" "}
        <code
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.85em",
            background: "var(--surface-muted)",
            padding: "1px 5px",
            borderRadius: "4px",
          }}
        >
          cpa_usd
        </code>{" "}
        is opaque. A column described as &ldquo;total cost-per-acquisition in USD, including
        marketing attribution and fulfillment overhead, used for channel ROI calculation&rdquo; is
        not. The model will use the latter correctly in a join it has never seen before. This is
        because the model is doing semantic matching between the user&rsquo;s question and the
        schema description — the richer the description, the more signal there is to match against.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        Domain-specific few-shot examples are more valuable than general SQL examples by roughly an
        order of magnitude. A model that has seen ten correct pharmacy fill-rate queries in its
        context will write the eleventh correctly under conditions where zero-shot inference would
        hallucinate a GROUP BY. The examples in the pool should come from real, high-rated query
        pairs — not hand-authored demonstrations. More on how to build that pool in the RL section.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        Explicit prohibition rules prevent the most common error classes. &ldquo;Never use EXTRACT
        without also using DATE_TRUNC&rdquo; is a rule. &ldquo;When the user asks about delivery
        performance, exclude NULL delivery_days unless they explicitly ask for in-transit
        orders&rdquo; is a rule. These rules encode the institutional knowledge that turns a
        technically-correct query into a business-correct query. Below is a representative excerpt
        from the system prompt used in this project:
      </p>

      <pre
        style={{
          background: "#0d1117",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "14px",
          padding: "1.5rem",
          overflowX: "auto",
          fontSize: "0.8rem",
          lineHeight: 1.75,
          color: "#e6edf3",
          fontFamily: "var(--font-mono)",
          margin: "1.5rem 0",
          whiteSpace: "pre",
        }}
      >
        {systemPromptExample}
      </pre>

      {/* ── Section 4 ── */}
      <h2
        style={{
          fontSize: "clamp(1.15rem, 2vw, 1.45rem)",
          fontWeight: 700,
          color: "var(--text)",
          letterSpacing: "-0.02em",
          margin: "3rem 0 1rem 0",
          paddingTop: "3rem",
          borderTop: "1px solid var(--border)",
        }}
      >
        RAG for Schema Retrieval
      </h2>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        At small schema sizes, you can inject everything into the prompt. Past roughly 50 tables,
        you cannot — not because of token limits alone, but because precision degrades. Including
        irrelevant tables increases the probability of the model constructing joins that
        don&rsquo;t exist, referencing columns from the wrong table, or conflating similarly named
        fields. The solution is retrieval-augmented generation applied to schema metadata.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        The indexing step embeds each table and column as a natural-language description — not the
        DDL. &ldquo;Table: fills. Tracks each completed prescription dispense event at Amazon
        Pharmacy. Grain: one row per fill. Key business use: fill rate, copay analysis, channel mix
        reporting. Joins to orders via fill_id.&rdquo; That is a retrievable document. Raw DDL is
        not. Research on the Spider benchmark has shown that including rich foreign-key and
        description metadata in prompts improves execution accuracy by over 50 percentage points
        compared to DDL-only injection.
      </p>

      <div
        style={{
          background: "var(--accent-soft)",
          borderLeft: "3px solid var(--accent)",
          borderRadius: "0 12px 12px 0",
          padding: "1rem 1.25rem",
          margin: "1.75rem 0",
          fontSize: "0.92rem",
          lineHeight: 1.7,
          color: "var(--text)",
        }}
      >
        <strong>Schema quality is the retrieval ceiling.</strong> A vector index built on rich,
        accurate, current descriptions will retrieve the right tables even for paraphrased or
        domain-shifted queries. A vector index built on raw column names will retrieve the wrong
        tables reliably and precisely. The embedding model is not the bottleneck. The schema
        documentation is.
      </div>

      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        Graph traversal handles multi-hop joins. When the retrieved tables are{" "}
        <code
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.85em",
            background: "var(--surface-muted)",
            padding: "1px 5px",
            borderRadius: "4px",
          }}
        >
          fills
        </code>{" "}
        and{" "}
        <code
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.85em",
            background: "var(--surface-muted)",
            padding: "1px 5px",
            borderRadius: "4px",
          }}
        >
          customers
        </code>
        , the system needs to know whether they join directly or through an intermediate table. A
        pre-computed join graph — derived from foreign key constraints and manually curated where FK
        constraints are absent — enables the system to automatically include bridge tables when
        needed. Uber&rsquo;s QueryGPT addresses this with a dedicated Table Agent that validates
        retrieved tables and resolves join paths before the final generation call.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        Column pruning is the final retrieval step. Even after semantic search returns the right
        tables, a wide table with 80 columns will dilute the signal in the prompt. A Column Prune
        Agent — another of Uber&rsquo;s explicit pipeline stages — scores each column for relevance
        to the query and injects only the top-N into the generation prompt. This reduces token
        usage, improves generation precision, and eliminates the risk of the model using a
        similarly-named but semantically different column from the same table.
      </p>

      {/* ── Section 5 ── */}
      <h2
        style={{
          fontSize: "clamp(1.15rem, 2vw, 1.45rem)",
          fontWeight: 700,
          color: "var(--text)",
          letterSpacing: "-0.02em",
          margin: "3rem 0 1rem 0",
          paddingTop: "3rem",
          borderTop: "1px solid var(--border)",
        }}
      >
        Privacy First
      </h2>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        Deploying an LLM-powered query interface on a warehouse that contains protected health
        information — which Amazon Pharmacy&rsquo;s data does — requires a privacy architecture that
        goes well beyond standard access controls. The threat model has two distinct surfaces: the
        schema injection (what the LLM sees) and the result set (what the user sees).
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        The controls we implemented, in priority order:
      </p>
      <ol
        style={{
          paddingLeft: "1.5rem",
          margin: "0 0 1.5rem 0",
          display: "flex",
          flexDirection: "column",
          gap: "0.85rem",
        }}
      >
        <li style={{ fontSize: "0.97rem", lineHeight: 1.8, color: "var(--muted)" }}>
          <strong style={{ color: "var(--text)" }}>PII column masking in schema metadata.</strong>{" "}
          Columns containing direct or quasi-identifiers — patient_id, member_id, address,
          date-of-birth — are tagged in the schema registry. When that column&rsquo;s description is
          retrieved and injected into the prompt, it is replaced with a masked description that
          communicates join semantics (&ldquo;foreign key for linking fill records to the patient
          record&rdquo;) without describing the PII. The LLM knows the column exists and how to join
          through it; it cannot be prompted to surface its contents.
        </li>
        <li style={{ fontSize: "0.97rem", lineHeight: 1.8, color: "var(--muted)" }}>
          <strong style={{ color: "var(--text)" }}>Permission-scoped schema injection.</strong>{" "}
          The schema retrieval step is aware of the requesting user&rsquo;s IAM role and
          data-access entitlements. A finance analyst sees cost columns. A pharmacist sees
          dispensing columns. Neither sees the other&rsquo;s domain unless their role explicitly
          grants it. The injected schema is the intersection of (semantically relevant) and
          (user-authorized) — not the full schema subset.
        </li>
        <li style={{ fontSize: "0.97rem", lineHeight: 1.8, color: "var(--muted)" }}>
          <strong style={{ color: "var(--text)" }}>LLM never sees actual data.</strong>{" "}
          The LLM receives schema descriptions and generates a query. It never receives query
          results, sample rows, or any data values. The MaskSQL framework formalizes this
          principle — replacing sensitive schema elements with abstract symbols before they reach a
          remote LLM. In our system, the LLM is purely a query translator; execution and result
          handling are entirely outside its context.
        </li>
        <li style={{ fontSize: "0.97rem", lineHeight: 1.8, color: "var(--muted)" }}>
          <strong style={{ color: "var(--text)" }}>Result set sanitization.</strong>{" "}
          Generated queries that reference PII columns directly (a rare but possible outcome of
          ambiguous prompting) are blocked at the result layer. A whitelist of allowed output
          columns — derived from the user&rsquo;s access scope — filters the query before
          execution.
        </li>
        <li style={{ fontSize: "0.97rem", lineHeight: 1.8, color: "var(--muted)" }}>
          <strong style={{ color: "var(--text)" }}>Audit logging.</strong>{" "}
          Every generation event — user ID, timestamp, natural language query, generated SQL,
          execution status, row count returned — is written to an immutable audit log. This is the
          compliance surface for any downstream data-access review.
        </li>
      </ol>

      {/* ── Section 6 ── */}
      <h2
        style={{
          fontSize: "clamp(1.15rem, 2vw, 1.45rem)",
          fontWeight: 700,
          color: "var(--text)",
          letterSpacing: "-0.02em",
          margin: "3rem 0 1rem 0",
          paddingTop: "3rem",
          borderTop: "1px solid var(--border)",
        }}
      >
        Execution-Guided Self-Correction
      </h2>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        The first generated query fails more often than you want. In early testing on the pharmacy
        schema, first-pass execution success was roughly 70% — meaning three in ten queries required
        either a retry or a human correction. That number is unacceptable for a tool that&rsquo;s
        supposed to replace analyst bandwidth.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        Self-correction is the practice of feeding the execution error back to the model as part of
        a follow-up generation call. The retry prompt includes the original question, the failed
        SQL, and the full error message from the warehouse. Models are remarkably good at fixing
        their own errors when given the error text — a type mismatch, a missing alias, a
        non-existent column reference. In practice, one retry pass raises first-pass-or-retry
        success from 70% to 88-92%. Two retry passes recover most of the remaining failures.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        The failure categories that don&rsquo;t recover through self-correction are almost always
        schema gaps — the user is asking about data that doesn&rsquo;t exist in the authorized
        schema, or using business terminology that maps to nothing in the column descriptions. These
        failures are the most valuable signal in the system, because they directly indicate where
        the schema documentation needs to be improved.
      </p>

      {/* ── Section 7 ── */}
      <h2
        style={{
          fontSize: "clamp(1.15rem, 2vw, 1.45rem)",
          fontWeight: 700,
          color: "var(--text)",
          letterSpacing: "-0.02em",
          margin: "3rem 0 1rem 0",
          paddingTop: "3rem",
          borderTop: "1px solid var(--border)",
        }}
      >
        Closing the Loop: Refinement and RL
      </h2>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        A system that doesn&rsquo;t learn from usage will plateau at its initial quality level.
        Reinforcement learning from human feedback closes the gap between a system that sometimes
        works and one that continuously improves.
      </p>

      <div style={{ margin: "2rem 0" }}>
        <div
          className="panel"
          style={{ padding: "2rem" }}
        >
          <ArchDiagram nodes={feedbackNodes} />
          <p
            style={{
              fontSize: "0.78rem",
              color: "var(--soft)",
              marginTop: "1.25rem",
              textAlign: "center",
              fontStyle: "italic",
            }}
          >
            The feedback loop. Execution success is the implicit reward signal; explicit ratings
            refine it. High-quality pairs are promoted into the few-shot pool.
          </p>
        </div>
      </div>

      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        The reward signal has two components. The first is implicit: execution success. A query
        that runs without error and returns a non-empty result is a positive signal. A query that
        fails, times out, or returns zero rows on a question that should have data is a negative
        signal. This signal is cheap — it requires no human annotation and is available for 100% of
        queries. It is also noisy: a query can execute successfully and still be semantically wrong.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        The second is explicit: user ratings. A thumbs-up/thumbs-down on the result, with an
        optional correction field where the user can provide the query they intended. Explicit
        signals are sparse — most users don&rsquo;t rate — but they are high-precision. A
        user-provided correction is a preference pair: (generated query, corrected query) for the
        same input. That is exactly the data format required for Direct Preference Optimization.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        DPO is the right algorithm here over PPO-style RLHF for a practical reason: it doesn&rsquo;t
        require training a separate reward model. DPO directly optimizes the generation model&rsquo;s
        policy against the preference pairs using a contrastive loss. For a team without dedicated
        ML infrastructure, DPO can be applied as a fine-tuning pass on an open-source base model —
        LLaMA 3.3 in our case — using the accumulated preference pairs as training data. The result
        is a model that&rsquo;s specialized to our schema, our query patterns, and our users&rsquo;
        implicit definition of a good answer.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        The few-shot example pool is the faster-cycling feedback mechanism. High-rated
        (question, SQL) pairs — those with explicit positive feedback or a consistent execution
        success history — are automatically promoted into the few-shot pool. Low-rated pairs are
        demoted. The pool is re-ranked weekly. This doesn&rsquo;t require model retraining; it
        improves generation quality on the next request by changing what examples are in context.
        For teams without the compute budget for DPO cycles, this alone will recover a significant
        fraction of the quality gains.
      </p>

      {/* ── Section 8 ── */}
      <h2
        style={{
          fontSize: "clamp(1.15rem, 2vw, 1.45rem)",
          fontWeight: 700,
          color: "var(--text)",
          letterSpacing: "-0.02em",
          margin: "3rem 0 1rem 0",
          paddingTop: "3rem",
          borderTop: "1px solid var(--border)",
        }}
      >
        What I&rsquo;d Build Next
      </h2>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        The system as described brings first-pass-or-retry success above 90% on the bounded
        pharmacy analytics domain. The remaining failure surface points to three things worth
        building.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        <strong style={{ color: "var(--text)" }}>Ambiguity resolution as a first-class step.</strong>{" "}
        Instead of silently choosing a definition when the user says &ldquo;active customers,&rdquo;
        the system should detect the ambiguity and ask a targeted clarifying question before
        generation. This requires a lightweight pre-generation classifier that identifies
        under-specified terms and maps them to the business definitions that exist in the schema
        documentation.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        <strong style={{ color: "var(--text)" }}>Semantic result validation.</strong> Execution
        success is a weak correctness signal. A stronger signal comes from checking whether the
        result is plausible given the question — a fill rate of 340% should trigger a validation
        flag, not silently appear in the output. Statistical bounds on expected result ranges,
        derived from historical query results, would catch this class of error before it reaches
        the user.
      </p>
      <p
        style={{
          fontSize: "0.97rem",
          lineHeight: 1.85,
          color: "var(--muted)",
          margin: "0 0 1.25rem 0",
        }}
      >
        <strong style={{ color: "var(--text)" }}>Schema-aware fine-tuning on a local model.</strong>{" "}
        The privacy architecture currently relies on prompt-level controls to prevent PII exposure
        to remote APIs. A locally-hosted fine-tuned model would eliminate the remote API surface
        entirely — at the cost of requiring ML infrastructure to maintain. As DPO fine-tuning on
        LLaMA-class models becomes faster and cheaper, this tradeoff will flip for most
        organizations with PHI or PII data within the next eighteen months.
      </p>

      {/* Bottom spacer */}
      <div style={{ height: "4rem" }} />
    </div>
  );
}
