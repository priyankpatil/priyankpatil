export interface ProjectApproach {
  title: string;
  body: string;
}

export interface ProjectOutcome {
  value: string;
  label: string;
}

export interface ProjectWriteup {
  id: string;
  tagline: string;
  problem: string;
  approach: ProjectApproach[];
  outcomes: ProjectOutcome[];
  reflection: string;
  architectureNodes: { label: string; sublabel: string }[];
  architectureCaption: string;
}

export const projectWriteups: ProjectWriteup[] = [
  {
    id: "genai-analytics-agent",
    tagline: "Giving non-technical stakeholders a direct line to pharmacy performance data.",
    problem:
      "At Amazon Pharmacy, operational decisions depend on fresh data — fill rates, inventory positions, cost-per-acquisition by channel. Recurring questions landed in analyst queues and waited days. That latency wasn't a reporting problem; it was a decision-support problem. The team needed a way to answer well-formed business questions instantly, without adding headcount or building a complex BI layer.",
    approach: [
      {
        title: "Define the contract, not the query",
        body: "Instead of building an open-ended chatbot, I designed a structured schema contract: five canonical tables — orders, customers, products, pharmacy fills, and inventory — each documented with business-aligned column names and data types. The LLM doesn't infer relationships; the system prompt tells it exactly what exists, what's off-limits, and how to format output. Constraining the domain dramatically reduced hallucination rate.",
      },
      {
        title: "Choose speed over sophistication for v1",
        body: "Rather than a RAG pipeline with vector search over thousands of historical queries, I wired a 70B parameter instruction-tuned model (LLaMA 3.3 via Groq) directly to the schema. For a bounded analytics domain, a well-prompted large model outperforms a more complex retrieval system with a smaller model. Streaming output gives users token-by-token feedback — the SQL appears as it's generated, eliminating the perception of latency.",
      },
      {
        title: "Validate with actual question patterns",
        body: "I piloted with three pharmacy operations leads who each submitted their five most common recurring questions. The system answered four of five correctly under 30 seconds for each. The fifth required adding a join between fills and customers that wasn't in the original schema. That feedback loop directly shaped the final table design — requirements engineering through observation, not assumption.",
      },
    ],
    outcomes: [
      { value: "Days → min", label: "Insight turnaround" },
      { value: "80%+", label: "Questions self-served" },
      { value: "0", label: "Analyst handoffs for recurring ops queries" },
    ],
    reflection:
      "The hardest part wasn't the model. It was writing a system prompt that consistently produced safe, readable SQL — especially around edge cases like ambiguous date ranges, NULL propagation, and multi-table aggregations. Prompt engineering is underrated as a software discipline. The system prompt is the application logic.",
    architectureNodes: [
      { label: "Natural Language", sublabel: "Stakeholder question" },
      { label: "LLM Engine", sublabel: "LLaMA 3.3 · 70B" },
      { label: "SQL Query", sublabel: "Formatted · safe" },
      { label: "Redshift", sublabel: "5-table schema" },
      { label: "Business Insight", sublabel: "Streamed output" },
    ],
    architectureCaption:
      "Natural language question → prompted LLM → validated SQL → warehouse query → streamed result. No middleware, no vector DB, no fine-tuning.",
  },
  {
    id: "snowflake-redshift-migration",
    tagline: "A $1.4M infrastructure decision with zero reporting downtime.",
    problem:
      "Amazon Pharmacy's analytics stack had grown organically on Snowflake — workloads, pipelines, and reporting dependencies had accumulated without a unified ownership model. The platform cost approximately $1.4M annually. Moving to Redshift would align with AWS-native tooling the organization already operated at scale. The risk: dozens of downstream reports, dashboards, and automated pipelines depended on the existing setup. A failed migration meant broken dashboards for pharmacy leadership.",
    approach: [
      {
        title: "Audit before touching anything",
        body: "I catalogued every Snowflake query, pipeline, and table touched in the prior six months. Unused objects were flagged for deprecation before migration began — this reduced the migration surface by approximately 30% and eliminated carrying dead weight into the new system. The audit also exposed four critical pipelines with no documented owner, which would have become incidents had they failed silently post-migration.",
      },
      {
        title: "Migrate in layers, not in one shot",
        body: "I sequenced the migration in four stages: raw ingestion tables first (least downstream impact), then transformed and aggregated tables, then ETL orchestration jobs, then reporting surfaces last. Each layer was validated with data quality checks before the next began. Rollback procedures were written and tested at each stage — not as a formality, but as a forcing function to understand failure modes before they happened in production.",
      },
      {
        title: "Redesign ETL ownership simultaneously",
        body: "The migration wasn't a lift-and-shift. I used it as an opportunity to establish pipeline ownership standards that hadn't existed on Snowflake: every job got an owner, an SLA, a failure alert, and a dependency map. This was the highest-leverage change in the project — it improved reliability not by changing the technology, but by establishing accountability.",
      },
    ],
    outcomes: [
      { value: "$1.4M", label: "Annual savings" },
      { value: "30%", label: "Migration surface reduced by audit" },
      { value: "0", label: "Reporting outages during migration" },
      { value: "4", label: "Ownerless pipelines surfaced and resolved" },
    ],
    reflection:
      "A migration of this scale is fundamentally a change management exercise. The technical work was complex but tractable — Redshift SQL is close enough to Snowflake that most queries needed minimal changes. The harder challenge was getting three teams to agree on deprecation schedules and new ownership models while keeping existing pipelines running. Clear documentation, staged timelines, and explicit sign-offs at each stage made that possible.",
    architectureNodes: [
      { label: "Snowflake DW", sublabel: "Existing workloads" },
      { label: "Dependency Audit", sublabel: "Query + pipeline map" },
      { label: "ETL Rebuild", sublabel: "Ownership + SLAs" },
      { label: "Redshift", sublabel: "AWS-native" },
      { label: "BI Surface", sublabel: "Zero regression" },
    ],
    architectureCaption:
      "Phased migration: audit → redesign → rebuild → validate. Each layer signed off before the next began.",
  },
  {
    id: "customer-stratification-model",
    tagline: "Turning 'all customers matter equally' into 'these customers matter most'.",
    problem:
      "Clarke Power's commercial team had no systematic way to prioritize accounts. All customers received similar sales attention and service investment regardless of revenue potential, growth trajectory, or churn risk. The business had three years of transaction and service data sitting in the ERP — but no framework for translating it into commercial priority. The result was predictable: too much energy on low-yield accounts, and underinvestment in high-value relationships quietly showing signs of disengagement.",
    approach: [
      {
        title: "RFM first, then layer in service risk",
        body: "I started with a classic RFM base — Recency, Frequency, Monetary value — using three years of invoice data. Then I added service-side features: maintenance contract frequency, renewal history, and geographic concentration of fleet. The richer feature set separated customers who were high-spend but high-risk from those who were stable and growing. Basic RFM alone would have misclassified several of the most strategically important accounts.",
      },
      {
        title: "Let the clusters emerge, then name them",
        body: "K-means clustering across four normalized dimensions produced natural groupings that didn't require pre-specification. I ran silhouette analysis across k=2 through k=6 and found k=4 as the clear inflection point — adding a fifth cluster produced a segment too small to act on commercially. The resulting four segments — Champions, At-Risk Loyalists, Promising, and Inactive — had interpretable centroid profiles that the sales team recognized immediately from their own account knowledge.",
      },
      {
        title: "Make it operational, not academic",
        body: "The model output was a single CSV: account name, segment, confidence score, and recommended next action. It was imported directly into the CRM. I wrote a one-page playbook for each segment — specific talking points, offer structures, and escalation thresholds. The commercial team didn't need to understand clustering mathematics. They needed the signal and the script. Adoption was immediate because the output format matched how they already worked.",
      },
    ],
    outcomes: [
      { value: "Top 20%", label: "Of accounts driving 65%+ of revenue" },
      { value: "4", label: "Actionable segments with commercial playbooks" },
      { value: "k=4", label: "Optimal cluster count by silhouette score" },
    ],
    reflection:
      "The segmentation model itself was straightforward. The real work was feature engineering — cleaning three years of inconsistent ERP data, reconciling account IDs across two systems, handling multi-location companies that appeared as separate records. The model is only as good as the features. Data quality is always the moat.",
    architectureNodes: [
      { label: "CRM + ERP", sublabel: "3yr transaction data" },
      { label: "Feature Engineering", sublabel: "RFM + service risk" },
      { label: "K-Means Clustering", sublabel: "k=4 · normalized" },
      { label: "Segment Labels", sublabel: "4 cohorts" },
      { label: "Commercial Action", sublabel: "CRM playbooks" },
    ],
    architectureCaption:
      "Customer data → engineered features → unsupervised clustering → interpretable segments → CRM-ready playbooks.",
  },
  {
    id: "digital-inspection-app",
    tagline: "Replacing clipboards and guesswork with structured fleet telemetry.",
    problem:
      "Clarke Power's field technicians completed vehicle inspections on paper forms. Forms were lost in trucks, left illegible by handwriting, or never returned to the office for entry. The business had no reliable data on fleet health, no inspection completion rate visibility, and no ability to correlate service history with equipment failures downstream. Every insight about maintenance patterns had to be assembled manually — when it was assembled at all. Leadership was making fleet investment decisions with almost no data.",
    approach: [
      {
        title: "Design with technicians, not for them",
        body: "Before writing requirements, I ran observation sessions with four field technicians across two service sites. The non-obvious insight: the app had to be operable with one hand while holding a flashlight in a dark equipment bay. Every interaction was redesigned around taps, not typing. Structured dropdowns replaced written descriptions. Photos with auto-tagged metadata (timestamp, GPS, technician ID) replaced written defect notes. The design constraint — one hand, low-light, time pressure — drove every UX decision.",
      },
      {
        title: "Offline-first architecture",
        body: "Field locations have unreliable or absent cellular connectivity. I designed the data flow around the assumption of no network: inspections are completed and stored locally on-device, then synced in batch when connectivity is restored. This eliminated the primary failure mode of a connected app — a dropped connection that corrupts or loses an in-progress form. Technicians never wait for a network response. Sync happens invisibly in the background.",
      },
      {
        title: "Structure the capture to structure the data",
        body: "Open text fields produce unstructured data that requires manual review and interpretation before analysis. Every inspection field was designed as a structured input: pass/fail toggles, severity ratings, dropdown categories, and photo attachments. The constraint served both the technician (faster to complete) and the analyst (immediately queryable, no ETL cleaning step). The right answer was always the easiest answer to select.",
      },
    ],
    outcomes: [
      { value: "60%", label: "Improvement in completion velocity" },
      { value: "First", label: "Reliable fleet health telemetry in company history" },
      { value: "0", label: "Manual data entry required post-capture" },
    ],
    reflection:
      "The 60% velocity improvement came from the structured capture design, not the mobile technology itself. When technicians don't need to write sentences, they move faster and more consistently. The data quality improvement was equally significant — and it was a direct result of making the right input the easiest input. That principle applies to almost every data collection problem I've worked on since.",
    architectureNodes: [
      { label: "Field Technician", sublabel: "One-hand UX" },
      { label: "Mobile App", sublabel: "Offline-first" },
      { label: "Sync API", sublabel: "Batch on reconnect" },
      { label: "Structured DB", sublabel: "Analysis-ready" },
      { label: "Fleet Dashboard", sublabel: "Real-time ops view" },
    ],
    architectureCaption:
      "Capture at the edge, sync when connected, query immediately. No data entry step, no cleanup required.",
  },
];
