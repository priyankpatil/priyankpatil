// Knowledge base for the NL → SQL demo. Each entry becomes a row in
// nlsql_rag.documents (see scripts/nl-sql-ingest.ts). Retrieval picks the
// relevant tables, business definitions, rules and verified examples for each
// question, instead of stuffing everything into the prompt.
//
// Keep this file free of imports: the ingest script loads it directly with Node.

export type KnowledgeKind = "table" | "glossary" | "rule" | "example";

export interface KnowledgeDoc {
  id: string;
  kind: KnowledgeKind;
  title: string;
  content: string;
  /** Text to embed when it should differ from title + content (e.g. only an example's question). */
  embedText?: string;
  /** Tables this document relates to; retrieval always pulls their schema in. */
  tables?: string[];
  /** Example documents only. */
  sql?: string;
}

export const DEMO_TABLES = ["orders", "customers", "products", "pharmacy_fills", "inventory"] as const;
export type DemoTable = (typeof DEMO_TABLES)[number];

const tables: KnowledgeDoc[] = [
  {
    id: "table:orders",
    kind: "table",
    title: "orders — retail and pharmacy orders",
    tables: ["orders"],
    content: `orders (one row per order line; ~25k rows covering the last 24 months)
  order_id      text PK         e.g. 'ord_000123'
  customer_id   text FK → customers.customer_id
  product_id    text FK → products.product_id
  order_date    date            date the order was placed
  status        text            'completed' | 'pending' | 'refunded' | 'cancelled'
  total_amount  numeric(10,2)   order value in USD (price × quantity)
  channel       text            channel the order was placed through: 'web' | 'mobile' | 'pharmacy' | 'phone'
Use for revenue, order counts, average order value, sales trends, channel mix.`,
  },
  {
    id: "table:customers",
    kind: "table",
    title: "customers — customer profiles and segments",
    tables: ["customers"],
    content: `customers (one row per customer; 2,000 rows)
  customer_id       text PK      e.g. 'cust_0042'
  segment           text         'Champions' | 'Promising' | 'At-Risk' | 'Inactive'
  lifetime_value    numeric(12,2) modeled lifetime value (LTV) in USD
  acquisition_date  date         date the customer was acquired
  region            text         'Northeast' | 'Southeast' | 'Midwest' | 'Southwest' | 'West'
  prime_member      boolean      true for Prime members
Join to orders and pharmacy_fills on customer_id. Use for segmentation, LTV, regional and Prime vs non-Prime comparisons.`,
  },
  {
    id: "table:products",
    kind: "table",
    title: "products — product catalog with pricing and margin",
    tables: ["products"],
    content: `products (one row per product; 120 rows)
  product_id    text PK        e.g. 'prod_0007'
  product_name  text           e.g. 'Metformin 500mg'
  category      text           'Diabetes' | 'Blood Pressure' | 'Cholesterol' | 'Supplements' | 'GI' | 'Thyroid' | 'Mental Health' | 'Respiratory' | 'Pain Relief' | 'Allergy'
  brand         text           brand name, or 'Generic'
  price         numeric(10,2)  unit list price in USD
  margin_pct    numeric(5,2)   gross margin as a percentage, e.g. 42.50 means 42.5%
Join to orders and inventory on product_id.`,
  },
  {
    id: "table:pharmacy_fills",
    kind: "table",
    title: "pharmacy_fills — prescription fill events",
    tables: ["pharmacy_fills"],
    content: `pharmacy_fills (one row per prescription fill attempt; ~15k rows covering the last 24 months)
  fill_id      text PK        e.g. 'fill_000311'
  customer_id  text FK → customers.customer_id
  drug_id      text           e.g. 'drug_0031' (no drug dimension table)
  fill_date    date           date of the fill attempt
  days_supply  integer        30 or 90
  copay        numeric(8,2)   patient copay in USD
  fill_status  text           'dispensed' | 'abandoned' | 'rejected' | 'pending'
Use for fill rate, abandonment, copay and 30- vs 90-day supply analysis. Join to customers for region or Prime membership.`,
  },
  {
    id: "table:inventory",
    kind: "table",
    title: "inventory — stock levels by product and warehouse",
    tables: ["inventory"],
    content: `inventory (one row per product per warehouse; 360 rows)
  product_id        text FK → products.product_id
  warehouse_id      text      'wh-east-01' | 'wh-west-02' | 'wh-central'
  quantity_on_hand  integer   current units in stock
  reorder_point     integer   restock threshold in units
  last_restocked    date      date of the last restock
Primary key (product_id, warehouse_id). Use for stock-outs, low stock and restocking questions.`,
  },
];

const glossary: KnowledgeDoc[] = [
  {
    id: "glossary:revenue",
    kind: "glossary",
    title: "Revenue / sales",
    tables: ["orders"],
    content:
      "Revenue means SUM(orders.total_amount) for orders with status = 'completed' only. Refunded, cancelled and pending orders are excluded.",
  },
  {
    id: "glossary:aov",
    kind: "glossary",
    title: "Average order value (AOV)",
    tables: ["orders"],
    content: "Average order value = AVG(orders.total_amount) over completed orders (status = 'completed').",
  },
  {
    id: "glossary:gross-profit",
    kind: "glossary",
    title: "Gross profit / margin dollars",
    tables: ["orders", "products"],
    content:
      "Gross profit for an order = orders.total_amount * products.margin_pct / 100, joining products on product_id. Only completed orders count.",
  },
  {
    id: "glossary:fill-rate",
    kind: "glossary",
    title: "Fill rate",
    tables: ["pharmacy_fills"],
    content:
      "Fill rate = dispensed fills / resolved fills, where resolved means fill_status IN ('dispensed', 'abandoned', 'rejected'). Pending fills are excluded from both numerator and denominator. Express as a percentage rounded to 1 decimal.",
  },
  {
    id: "glossary:abandonment",
    kind: "glossary",
    title: "Abandonment rate",
    tables: ["pharmacy_fills"],
    content:
      "Abandonment rate = abandoned fills / resolved fills (fill_status IN ('dispensed', 'abandoned', 'rejected')), as a percentage.",
  },
  {
    id: "glossary:active-customer",
    kind: "glossary",
    title: "Active customer",
    tables: ["orders", "customers"],
    content:
      "An active customer has at least one completed order in the last 90 days (order_date >= CURRENT_DATE - INTERVAL '90 days'). This is behavioral and differs from the segment column.",
  },
  {
    id: "glossary:acquisition-channel",
    kind: "glossary",
    title: "Acquisition channel",
    tables: ["orders", "customers"],
    content:
      "There is no acquisition channel column. A customer's acquisition channel is the channel of their first order (earliest order_date in orders). Derive it with ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id) = 1.",
  },
  {
    id: "glossary:prime",
    kind: "glossary",
    title: "Prime vs non-Prime",
    tables: ["customers"],
    content:
      "Prime membership is customers.prime_member (boolean). Label it with CASE WHEN prime_member THEN 'Prime' ELSE 'Non-Prime' END.",
  },
  {
    id: "glossary:low-stock",
    kind: "glossary",
    title: "Low stock / below reorder point",
    tables: ["inventory", "products"],
    content:
      "A product is low on stock in a warehouse when inventory.quantity_on_hand < inventory.reorder_point. Units short = reorder_point - quantity_on_hand.",
  },
  {
    id: "glossary:ltv",
    kind: "glossary",
    title: "Lifetime value (LTV) and top customers",
    tables: ["customers"],
    content:
      "Lifetime value is customers.lifetime_value (already modeled). 'Top customers' means highest lifetime_value unless the question says otherwise.",
  },
  {
    id: "glossary:at-risk",
    kind: "glossary",
    title: "At-risk / churn-risk customers",
    tables: ["customers"],
    content:
      "At-risk customers are customers.segment = 'At-Risk'. Inactive customers are segment = 'Inactive'. Champions are the highest-value segment.",
  },
  {
    id: "glossary:growth",
    kind: "glossary",
    title: "Month-over-month growth",
    tables: ["orders"],
    content:
      "Month-over-month growth = (this month - previous month) / previous month * 100, computed with LAG() over months bucketed by DATE_TRUNC('month', order_date).",
  },
];

const rules: KnowledgeDoc[] = [
  {
    id: "rule:dialect",
    kind: "rule",
    title: "SQL dialect and safety",
    content:
      "Write a single PostgreSQL SELECT statement (a WITH ... SELECT is fine). Never write INSERT, UPDATE, DELETE, DDL or more than one statement. Use only the five demo tables.",
  },
  {
    id: "rule:dates",
    kind: "rule",
    title: "Dates and time windows",
    content:
      "Bucket dates with DATE_TRUNC('month', col)::date (or week, quarter). Relative windows use CURRENT_DATE, e.g. order_date >= CURRENT_DATE - INTERVAL '12 months'. Data covers the last 24 months.",
  },
  {
    id: "rule:output",
    kind: "rule",
    title: "Output conventions",
    content:
      "Use readable snake_case column aliases. ROUND money to 2 decimals and percentages to 1. Add ORDER BY for ranked or time-series results. LIMIT 20 rows unless the question asks for more or for every group.",
  },
];

interface Example {
  slug: string;
  question: string;
  sql: string;
  tables: DemoTable[];
}

const exampleList: Example[] = [
  {
    slug: "monthly-revenue",
    question: "Monthly revenue for the past 12 months",
    tables: ["orders"],
    sql: `SELECT
  DATE_TRUNC('month', order_date)::date AS month,
  ROUND(SUM(total_amount), 2) AS revenue
FROM orders
WHERE status = 'completed'
  AND order_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
GROUP BY 1
ORDER BY 1`,
  },
  {
    slug: "fill-rate-region-prime",
    question: "Fill rate by region — Prime vs non-Prime",
    tables: ["pharmacy_fills", "customers"],
    sql: `SELECT
  c.region,
  CASE WHEN c.prime_member THEN 'Prime' ELSE 'Non-Prime' END AS membership,
  ROUND(100.0 * COUNT(*) FILTER (WHERE f.fill_status = 'dispensed')
        / NULLIF(COUNT(*), 0), 1) AS fill_rate_pct,
  COUNT(*) AS resolved_fills
FROM pharmacy_fills f
JOIN customers c ON c.customer_id = f.customer_id
WHERE f.fill_status IN ('dispensed', 'abandoned', 'rejected')
GROUP BY 1, 2
ORDER BY 1, 2`,
  },
  {
    slug: "aov-acquisition-channel",
    question: "Average order value by acquisition channel",
    tables: ["orders"],
    sql: `WITH first_orders AS (
  SELECT customer_id, channel AS acquisition_channel,
         ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS rn
  FROM orders
)
SELECT
  fo.acquisition_channel,
  COUNT(DISTINCT o.customer_id) AS customers,
  ROUND(AVG(o.total_amount), 2) AS avg_order_value
FROM orders o
JOIN first_orders fo ON fo.customer_id = o.customer_id AND fo.rn = 1
WHERE o.status = 'completed'
GROUP BY 1
ORDER BY avg_order_value DESC`,
  },
  {
    slug: "top-customers-ltv",
    question: "Top 10 customers by lifetime value with order count",
    tables: ["customers", "orders"],
    sql: `SELECT
  c.customer_id,
  c.segment,
  c.region,
  c.lifetime_value,
  COUNT(o.order_id) AS order_count
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id AND o.status = 'completed'
GROUP BY c.customer_id, c.segment, c.region, c.lifetime_value
ORDER BY c.lifetime_value DESC
LIMIT 10`,
  },
  {
    slug: "low-stock",
    question: "Products with inventory below reorder point",
    tables: ["inventory", "products"],
    sql: `SELECT
  p.product_name,
  i.warehouse_id,
  i.quantity_on_hand,
  i.reorder_point,
  i.reorder_point - i.quantity_on_hand AS units_short
FROM inventory i
JOIN products p ON p.product_id = i.product_id
WHERE i.quantity_on_hand < i.reorder_point
ORDER BY units_short DESC
LIMIT 20`,
  },
  {
    slug: "revenue-by-category",
    question: "Revenue and gross profit by product category this year",
    tables: ["orders", "products"],
    sql: `SELECT
  p.category,
  ROUND(SUM(o.total_amount), 2) AS revenue,
  ROUND(SUM(o.total_amount * p.margin_pct / 100), 2) AS gross_profit
FROM orders o
JOIN products p ON p.product_id = o.product_id
WHERE o.status = 'completed'
  AND o.order_date >= DATE_TRUNC('year', CURRENT_DATE)
GROUP BY 1
ORDER BY revenue DESC`,
  },
  {
    slug: "active-customers-segment",
    question: "How many active customers do we have in each segment?",
    tables: ["customers", "orders"],
    sql: `SELECT
  c.segment,
  COUNT(DISTINCT c.customer_id) AS active_customers
FROM customers c
JOIN orders o ON o.customer_id = c.customer_id
WHERE o.status = 'completed'
  AND o.order_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY 1
ORDER BY active_customers DESC`,
  },
  {
    slug: "abandonment-days-supply",
    question: "Abandonment rate for 30-day vs 90-day prescriptions",
    tables: ["pharmacy_fills"],
    sql: `SELECT
  days_supply,
  ROUND(100.0 * COUNT(*) FILTER (WHERE fill_status = 'abandoned')
        / NULLIF(COUNT(*), 0), 1) AS abandonment_rate_pct,
  COUNT(*) AS resolved_fills
FROM pharmacy_fills
WHERE fill_status IN ('dispensed', 'abandoned', 'rejected')
GROUP BY 1
ORDER BY 1`,
  },
  {
    slug: "mom-growth",
    question: "Month-over-month revenue growth for the last 6 months",
    tables: ["orders"],
    sql: `WITH monthly AS (
  SELECT DATE_TRUNC('month', order_date)::date AS month, SUM(total_amount) AS revenue
  FROM orders
  WHERE status = 'completed'
    AND order_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '6 months'
  GROUP BY 1
)
SELECT
  month,
  ROUND(revenue, 2) AS revenue,
  ROUND(100.0 * (revenue - LAG(revenue) OVER (ORDER BY month))
        / NULLIF(LAG(revenue) OVER (ORDER BY month), 0), 1) AS mom_growth_pct
FROM monthly
ORDER BY month`,
  },
  {
    slug: "channel-mix",
    question: "Share of orders and revenue by channel in the last 90 days",
    tables: ["orders"],
    sql: `SELECT
  channel,
  COUNT(*) AS orders,
  ROUND(SUM(total_amount), 2) AS revenue,
  ROUND(100.0 * SUM(total_amount) / SUM(SUM(total_amount)) OVER (), 1) AS revenue_share_pct
FROM orders
WHERE status = 'completed'
  AND order_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY 1
ORDER BY revenue DESC`,
  },
  {
    slug: "refund-rate-category",
    question: "Which product categories have the highest refund rate?",
    tables: ["orders", "products"],
    sql: `SELECT
  p.category,
  ROUND(100.0 * COUNT(*) FILTER (WHERE o.status = 'refunded') / NULLIF(COUNT(*), 0), 1) AS refund_rate_pct,
  COUNT(*) AS orders
FROM orders o
JOIN products p ON p.product_id = o.product_id
GROUP BY 1
ORDER BY refund_rate_pct DESC`,
  },
  {
    slug: "copay-by-segment",
    question: "Average copay by customer segment",
    tables: ["pharmacy_fills", "customers"],
    sql: `SELECT
  c.segment,
  ROUND(AVG(f.copay), 2) AS avg_copay,
  COUNT(*) AS dispensed_fills
FROM pharmacy_fills f
JOIN customers c ON c.customer_id = f.customer_id
WHERE f.fill_status = 'dispensed'
GROUP BY 1
ORDER BY avg_copay DESC`,
  },
  {
    slug: "new-customers-by-quarter",
    question: "New customers acquired per quarter by region",
    tables: ["customers"],
    sql: `SELECT
  DATE_TRUNC('quarter', acquisition_date)::date AS quarter,
  region,
  COUNT(*) AS new_customers
FROM customers
WHERE acquisition_date >= DATE_TRUNC('quarter', CURRENT_DATE) - INTERVAL '2 years'
GROUP BY 1, 2
ORDER BY 1, 2`,
  },
  {
    slug: "stale-restock",
    question: "Warehouses with the most products not restocked in 30 days",
    tables: ["inventory"],
    sql: `SELECT
  warehouse_id,
  COUNT(*) FILTER (WHERE last_restocked < CURRENT_DATE - INTERVAL '30 days') AS stale_products,
  COUNT(*) AS products
FROM inventory
GROUP BY 1
ORDER BY stale_products DESC`,
  },
];

const examples: KnowledgeDoc[] = exampleList.map((e) => ({
  id: `example:${e.slug}`,
  kind: "example",
  title: e.question,
  embedText: e.question,
  tables: e.tables,
  sql: e.sql,
  content: `Question: ${e.question}\nSQL:\n${e.sql}`,
}));

export const knowledge: KnowledgeDoc[] = [...tables, ...glossary, ...rules, ...examples];

/** Full schema text, used when retrieval is unavailable (lite mode) and to expand retrieved tables. */
export const tableDocs: Record<DemoTable, KnowledgeDoc> = Object.fromEntries(
  tables.map((t) => [t.tables![0], t])
) as Record<DemoTable, KnowledgeDoc>;
