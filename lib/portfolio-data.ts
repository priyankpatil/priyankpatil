export interface ProjectItem {
  id: string;
  title: string;
  summary: string;
  outcome: string;
  year: string;
  org: string;
  tags: string[];
  demoUrl?: string;
}

export const projectItems: ProjectItem[] = [
  {
    id: "wiki-stream",
    title: "Wikipedia Data Streaming using Apache Kafka",
    summary:
      "A real-time data pipeline that captures Wikipedia edits with Apache Kafka, enriches and aggregates the events, and displays the results in a live dashboard with activity and processing metrics.",
    outcome:
      "Explore the edit stream, language activity and processing path. A labelled recorded Kafka replay is available while the live pipeline is offline.",
    year: "2026",
    org: "Personal project",
    tags: ["Apache Kafka", "Streaming", "TypeScript", "Supabase"],
    demoUrl: "/projects/wiki-stream",
  },
  {
    id: "genai-analytics-agent",
    title: "GenAI Analytics Agent",
    summary:
      "LLM-powered query assistant that translates natural language into SQL — built to explore how analytics teams can reduce stakeholder dependency on manual reporting.",
    outcome:
      "Prototyped against a synthetic online-retail operations schema; demonstrated days-to-minutes insight turnaround for recurring business questions.",
    year: "2025",
    org: "Amazon Pharmacy",
    tags: ["Python", "AWS", "NLP", "Analytics UX"],
    demoUrl: "/projects/nl-sql",
  },
  {
    id: "cx-eval",
    title: "Customer Support Evaluation using an LLM",
    summary:
      "End-to-end data pipeline that prepares 10,000 support chats for an LLM judge, validates what it returns, and turns the scores into CX metrics, drift monitoring and root cause analysis.",
    outcome:
      "Judge accuracy measured against ground truth, not assumed; three planted incidents (data, model and customer-driven) detected and explained before they reached a report.",
    year: "2026",
    org: "Personal project",
    tags: ["LLM Evaluation", "ELT", "Postgres", "Monitoring"],
    demoUrl: "/projects/cx-eval",
  },
  {
    id: "digital-inspection-app",
    title: "Digital Inspection App",
    summary:
      "Replaced paper-based vehicle inspection workflows with a mobile-first product used by field technicians.",
    outcome:
      "Improved technician completion velocity by 60% while creating high-quality maintenance telemetry.",
    year: "2020",
    org: "Clarke Power",
    tags: ["Product", "Operations", "Mobile", "Data Capture"],
  },
  {
    id: "customer-stratification-model",
    title: "Customer Stratification Model",
    summary:
      "Built a segmentation model connecting customer patterns to revenue potential and service risk.",
    outcome:
      "Refocused commercial motion on the highest-value customer cohort and simplified account prioritization.",
    year: "2019",
    org: "Clarke Power",
    tags: ["SQL", "Modeling", "Go-to-Market", "Decision Science"],
    demoUrl: "/projects/customer-segments",
  },
  {
    id: "snowflake-redshift-migration",
    title: "Snowflake to Redshift Migration",
    summary:
      "Led an end-to-end migration of storage, ETL orchestration, and reporting dependencies for analytics workloads.",
    outcome:
      "Reduced annual infrastructure spend by $1.4M while improving operational reliability and ownership.",
    year: "2024",
    org: "Amazon Pharmacy",
    tags: ["Redshift", "ETL", "Cost Engineering", "Platform"],
  },
];

export const capabilityAreas = [
  {
    title: "Product Management",
    detail:
      "Taking products from user research to launch: clear problem framing, prioritized roadmaps, and close work with engineering, design, and business teams.",
  },
  {
    title: "Data Platform Architecture",
    detail:
      "Modeling resilient pipelines and data contracts that make downstream analytics faster and safer.",
  },
  {
    title: "Analytics Product Strategy",
    detail:
      "Designing reporting systems around decisions, not dashboards, so metrics drive concrete action.",
  },
  {
    title: "AI-Enabled Decisioning",
    detail:
      "Pairing model capability with governance, observability, and stakeholder trust to move from pilot to adoption.",
  },
];

export interface ExperienceItem {
  company: string;
  role: string;
  period: string;
  focus: string;
}

export const experienceItems: ExperienceItem[] = [
  {
    company: "Amazon",
    role: "Senior Analyst",
    period: "Sep 2025 - Present",
    focus: "AI-powered analytics products for operational decision support.",
  },
  {
    company: "Amazon",
    role: "Senior Business Analyst",
    period: "Apr 2023 - Aug 2025",
    focus: "Platform migration and KPI governance across pharmacy analytics surfaces.",
  },
  {
    company: "Amazon",
    role: "Business Analyst II",
    period: "Jul 2021 - Mar 2023",
    focus: "Scalable reporting models for performance and cost instrumentation.",
  },
  {
    company: "Clarke Power Services",
    role: "Product Manager",
    period: "May 2018 - Jul 2021",
    focus: "Field operations digitization and product-led process transformation.",
  },
  {
    company: "Mercedes Benz R&D India",
    role: "Product Analyst",
    period: "Aug 2012 - Jul 2016",
    focus: "Analytics support for product and reliability research programs.",
  },
];

export const heroStats = [
  { label: "Years in Product & Analytics", value: "13+" },
  { label: "Industries", value: "3" },
  { label: "Major Programs", value: "20+" },
];
