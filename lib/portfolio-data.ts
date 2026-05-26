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
    id: "genai-analytics-agent",
    title: "GenAI Analytics Agent",
    summary:
      "LLM-powered query assistant that translates natural language into SQL — built to explore how analytics teams can reduce stakeholder dependency on manual reporting.",
    outcome:
      "Prototyped against a pharmacy operations schema; demonstrated days-to-minutes insight turnaround for recurring business questions.",
    year: "2025",
    org: "Personal Project",
    tags: ["Python", "AWS", "NLP", "Analytics UX"],
    demoUrl: "/projects/nl-sql",
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
  {
    title: "Cross-Functional Delivery",
    detail:
      "Translating between product, engineering, and business teams to ship outcomes with clear ownership.",
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
  { label: "Years in Analytics", value: "13+" },
  { label: "Industries", value: "3" },
  { label: "Major Programs", value: "20+" },
];
