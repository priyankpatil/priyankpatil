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

export const DEMO_TABLES = ["orders", "customers", "products", "deliveries", "inventory"] as const;
export type DemoTable = (typeof DEMO_TABLES)[number];

const tables: KnowledgeDoc[] = [
  {
    id: "table:orders",
    kind: "table",
    title: "orders — online and in-store retail orders",
    tables: ["orders"],
    content: `orders (one row per order line; ~25k rows covering the last 24 months)
  order_id      text PK         e.g. 'ord_000123'
  customer_id   text FK → customers.customer_id
  product_id    text FK → products.product_id
  order_date    date            date the order was placed
  status        text            'completed' | 'pending' | 'refunded' | 'cancelled'
  total_amount  numeric(10,2)   order value in USD (price × quantity)
  channel       text            channel the order was placed through: 'web' | 'app' | 'store' | 'phone'
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
  loyalty_tier      text         loyalty program tier: 'none' | 'silver' | 'gold'
Join to orders and deliveries on customer_id. Use for segmentation, LTV, regional and loyalty tier comparisons.`,
  },
  {
    id: "table:products",
    kind: "table",
    title: "products — product catalog with pricing and margin",
    tables: ["products"],
    content: `products (one row per product; 120 rows)
  product_id    text PK        e.g. 'prod_0007'
  product_name  text           e.g. 'Linen Duvet Cover — Queen'
  category      text           'Apparel' | 'Footwear' | 'Bedding' | 'Kitchen' | 'Home Decor' | 'Bath' | 'Accessories'
  brand         text           'Northfield' | 'Trailmark' | 'Harbor & Pine' | 'Lumen Home', or 'House Label' for own-brand
  price         numeric(10,2)  unit list price in USD
  margin_pct    numeric(5,2)   gross margin as a percentage, e.g. 42.50 means 42.5%
Join to orders and inventory on product_id.`,
  },
  {
    id: "table:deliveries",
    kind: "table",
    title: "deliveries — shipments from warehouse to customer",
    tables: ["deliveries"],
    content: `deliveries (one row per shipment; ~15k rows covering the last 24 months; most non-cancelled orders have one)
  delivery_id      text PK        e.g. 'dlv_000311'
  order_id         text FK → orders.order_id
  customer_id      text FK → customers.customer_id
  carrier          text           'Northline' | 'Bluebird Post' | 'Metro Courier'
  shipping_speed   text           'standard' (promised in 5 days) | 'express' (promised in 2 days)
  shipping_fee     numeric(8,2)   shipping fee charged to the customer in USD (0 = free shipping)
  ship_date        date           date the shipment left the warehouse
  promised_date    date           delivery date promised to the customer
  delivered_date   date           actual delivery date; NULL unless delivery_status = 'delivered'
  delivery_status  text           'delivered' | 'failed' | 'returned' | 'in_transit'
Use for on-time rate, delivery success, failed deliveries, carrier and shipping-speed comparisons and shipping fees. Join to customers for region, segment or loyalty tier.`,
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
    id: "glossary:on-time-rate",
    kind: "glossary",
    title: "On-time delivery rate",
    tables: ["deliveries"],
    content:
      "On-time delivery rate = deliveries with delivered_date <= promised_date / deliveries with delivery_status = 'delivered'. Failed, returned and in-transit shipments are excluded from both numerator and denominator. Express as a percentage rounded to 1 decimal. Late deliveries are delivered ones with delivered_date > promised_date.",
  },
  {
    id: "glossary:delivery-success",
    kind: "glossary",
    title: "Delivery success rate and failed delivery rate",
    tables: ["deliveries"],
    content:
      "Resolved deliveries are delivery_status IN ('delivered', 'failed', 'returned'); in-transit shipments are excluded. Delivery success rate = delivered / resolved. Failed delivery rate = failed / resolved. Both as percentages.",
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
    id: "glossary:loyalty",
    kind: "glossary",
    title: "Loyalty members and loyalty tier",
    tables: ["customers"],
    content:
      "Loyalty tier is customers.loyalty_tier ('none' | 'silver' | 'gold'). Loyalty members are customers with loyalty_tier <> 'none'; non-members have loyalty_tier = 'none'.",
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
    slug: "on-time-rate-region-loyalty",
    question: "On-time delivery rate by region and loyalty tier",
    tables: ["deliveries", "customers"],
    sql: `SELECT
  c.region,
  c.loyalty_tier,
  ROUND(100.0 * COUNT(*) FILTER (WHERE d.delivered_date <= d.promised_date)
        / NULLIF(COUNT(*), 0), 1) AS on_time_rate_pct,
  COUNT(*) AS delivered
FROM deliveries d
JOIN customers c ON c.customer_id = d.customer_id
WHERE d.delivery_status = 'delivered'
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
    slug: "failed-rate-carrier-speed",
    question: "Failed delivery rate by carrier for standard vs express shipping",
    tables: ["deliveries"],
    sql: `SELECT
  carrier,
  shipping_speed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE delivery_status = 'failed')
        / NULLIF(COUNT(*), 0), 1) AS failed_rate_pct,
  COUNT(*) AS resolved_deliveries
FROM deliveries
WHERE delivery_status IN ('delivered', 'failed', 'returned')
GROUP BY 1, 2
ORDER BY failed_rate_pct DESC`,
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
    slug: "shipping-fee-by-segment",
    question: "Average shipping fee and free-shipping share by customer segment",
    tables: ["deliveries", "customers"],
    sql: `SELECT
  c.segment,
  ROUND(AVG(d.shipping_fee), 2) AS avg_shipping_fee,
  ROUND(100.0 * COUNT(*) FILTER (WHERE d.shipping_fee = 0) / NULLIF(COUNT(*), 0), 1) AS free_shipping_pct,
  COUNT(*) AS deliveries
FROM deliveries d
JOIN customers c ON c.customer_id = d.customer_id
GROUP BY 1
ORDER BY avg_shipping_fee DESC`,
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
