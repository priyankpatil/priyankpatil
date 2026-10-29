-- Customer segment classifier (pipelines/customer-segments/PLAN.md).
--
-- ELT: the loader only lands the Online Retail II workbook in raw_transactions.
-- Cleaning and features are SQL in this schema, so each rule can be read and
-- run by hand in the SQL editor:
--
--   select customer_segments.clean_transactions();          -- raw → clean, logs each rule
--   select customer_segments.build_features('2010-12-01');  -- one row per customer
--
-- The model script (model/model.py: k-means with scikit-learn) reads customer_features and writes
-- model_runs, centroids and assignments. The page reads a JSON export of the marts.

create schema if not exists customer_segments;
revoke all on schema customer_segments from public;

-- ── Landing ──────────────────────────────────────────────────────────────────

create table if not exists customer_segments.load_runs (
  run_id      bigserial primary key,
  source      text not null,
  sheets      text[] not null,
  rows_loaded integer not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

-- The workbook as delivered, typed but unfiltered. Emptied after cleaning
-- (loader --keep-raw keeps it) to stay well inside the free-tier database.
create table if not exists customer_segments.raw_transactions (
  row_no       integer primary key,
  sheet        text not null,
  invoice      text not null,
  stock_code   text not null,
  description  text,
  quantity     integer not null,
  invoice_date timestamp not null,
  price        numeric(12, 3) not null,
  customer_id  integer,
  country      text
);

-- ── Clean ────────────────────────────────────────────────────────────────────

create table if not exists customer_segments.cleaning_log (
  step         smallint primary key,
  rule         text not null,
  reason       text not null,
  rows_removed integer not null,
  rows_left    integer not null
);

-- Purchases: product lines with a customer, positive quantity and price.
create table if not exists customer_segments.transactions (
  customer_id  integer not null,
  invoice      text not null,
  stock_code   text not null,
  invoice_date timestamp not null,
  quantity     integer not null,
  price        numeric(12, 3) not null,
  revenue      numeric(12, 2) not null
);
create index if not exists transactions_customer_date on customer_segments.transactions (customer_id, invoice_date);

-- Cancellations: feed the return rate, never revenue.
create table if not exists customer_segments.returns (
  customer_id  integer not null,
  invoice      text not null,
  stock_code   text not null,
  invoice_date timestamp not null,
  value        numeric(12, 2) not null
);
create index if not exists returns_customer_date on customer_segments.returns (customer_id, invoice_date);

create table if not exists customer_segments.products (
  stock_code  text primary key,
  description text
);

create table if not exists customer_segments.customers (
  customer_id    integer primary key,
  country        text,
  first_purchase timestamp not null
);

create or replace function customer_segments.clean_transactions() returns void
language plpgsql as $$
declare
  v_left integer;
  v_prev integer;
begin
  truncate customer_segments.cleaning_log, customer_segments.transactions,
           customer_segments.returns, customer_segments.products, customer_segments.customers;

  -- Work table: shrinks one rule at a time so each rule's effect is counted.
  create temp table w on commit drop as select * from customer_segments.raw_transactions;
  select count(*) into v_left from w;
  insert into customer_segments.cleaning_log values (0, 'Rows delivered', 'Both sheets of the workbook', 0, v_left);

  -- 1. Exact duplicates (includes rows repeated across the two sheets).
  v_prev := v_left;
  delete from w where row_no in (
    select row_no from (
      select row_no, row_number() over (
        partition by invoice, stock_code, description, quantity, invoice_date, price, customer_id, country
        order by row_no) as n
      from w) d
    where n > 1);
  select count(*) into v_left from w;
  insert into customer_segments.cleaning_log values (1, 'Exact duplicates', 'Counted twice otherwise', v_prev - v_left, v_left);

  -- 2. No customer id.
  v_prev := v_left;
  delete from w where customer_id is null;
  select count(*) into v_left from w;
  insert into customer_segments.cleaning_log values (2, 'No customer id', 'Can''t be attributed to a customer', v_prev - v_left, v_left);

  -- 3. Not a product: postage, carriage, fees, discounts, manual lines, vouchers.
  v_prev := v_left;
  delete from w where stock_code !~ '^[0-9]{5}[A-Za-z]*$';
  select count(*) into v_left from w;
  insert into customer_segments.cleaning_log values (3, 'Not a product', 'Postage, fees, discounts and manual lines aren''t purchases', v_prev - v_left, v_left);

  -- 4. Cancellations move to returns.
  insert into customer_segments.returns
  select customer_id, invoice, stock_code, invoice_date, round(abs(quantity) * price, 2)
  from w where invoice like 'C%';
  v_prev := v_left;
  delete from w where invoice like 'C%';
  select count(*) into v_left from w;
  insert into customer_segments.cleaning_log values (4, 'Cancellations', 'Kept separately for the return rate, not counted as sales', v_prev - v_left, v_left);

  -- 5. Stock adjustments and write-offs.
  v_prev := v_left;
  delete from w where quantity <= 0 or price <= 0;
  select count(*) into v_left from w;
  insert into customer_segments.cleaning_log values (5, 'Zero or negative quantity or price', 'Stock adjustments and write-offs', v_prev - v_left, v_left);

  insert into customer_segments.transactions
  select customer_id, invoice, stock_code, invoice_date, quantity, price, round(quantity * price, 2) from w;

  -- Most common description per product; most common country per customer.
  insert into customer_segments.products
  select distinct on (stock_code) stock_code, description
  from (select stock_code, description, count(*) n from customer_segments.raw_transactions
        where description is not null group by 1, 2) d
  order by stock_code, n desc, description;

  insert into customer_segments.customers
  select t.customer_id, c.country, t.first_purchase
  from (select customer_id, min(invoice_date) first_purchase from customer_segments.transactions group by 1) t
  join (select distinct on (customer_id) customer_id, country
        from (select customer_id, country, count(*) n from w group by 1, 2) x
        order by customer_id, n desc, country) c using (customer_id);

  analyze customer_segments.transactions;
  analyze customer_segments.returns;
end $$;

-- ── Features ─────────────────────────────────────────────────────────────────
-- One row per customer per snapshot. Only transactions before as_of are used,
-- and behaviour features look at the 12 months before it (see FEATURES.md).

create table if not exists customer_segments.customer_features (
  as_of            date not null,
  customer_id      integer not null,
  recency_days     real not null,
  orders           integer not null,
  revenue          numeric(12, 2) not null,
  avg_order_value  numeric(12, 2) not null,
  tenure_days      real not null,
  avg_days_between real,
  active_months    smallint not null,
  product_breadth  integer not null,
  return_rate      real not null,
  trend            real not null,
  country_uk       boolean not null,
  primary key (as_of, customer_id)
);

create or replace function customer_segments.build_features(p_as_of date) returns integer
language plpgsql as $$
declare
  v_rows integer;
  v_from timestamp := p_as_of - interval '365 days';
  v_mid  timestamp := p_as_of - interval '182 days';
begin
  delete from customer_segments.customer_features where as_of = p_as_of;

  with w as (
    select * from customer_segments.transactions
    where invoice_date >= v_from and invoice_date < p_as_of
  ), orders as (
    select customer_id, invoice, min(invoice_date) as ordered_at, sum(revenue) as revenue
    from w group by 1, 2
  ), per_customer as (
    select customer_id,
           count(*)                                         as orders,
           sum(revenue)                                     as revenue,
           max(ordered_at)                                  as last_order,
           min(ordered_at)                                  as first_order,
           count(distinct date_trunc('month', ordered_at))  as active_months,
           sum(revenue) filter (where ordered_at >= v_mid)  as recent,
           sum(revenue) filter (where ordered_at <  v_mid)  as earlier
    from orders group by 1
  ), breadth as (
    select customer_id, count(distinct stock_code) as product_breadth from w group by 1
  ), returned as (
    select customer_id, sum(value) as value from customer_segments.returns
    where invoice_date >= v_from and invoice_date < p_as_of group by 1
  ), first_ever as (
    select customer_id, min(invoice_date) as first_purchase
    from customer_segments.transactions where invoice_date < p_as_of group by 1
  )
  insert into customer_segments.customer_features
  select p_as_of, p.customer_id,
         extract(epoch from (p_as_of - p.last_order)) / 86400,
         p.orders,
         p.revenue,
         round(p.revenue / p.orders, 2),
         extract(epoch from (p_as_of - f.first_purchase)) / 86400,
         case when p.orders > 1 then extract(epoch from (p.last_order - p.first_order)) / 86400 / (p.orders - 1) end,
         p.active_months,
         b.product_breadth,
         least(coalesce(r.value, 0) / p.revenue, 1),
         -- Share of the year's revenue that moved to the second half, in [-1, 1].
         (coalesce(p.recent, 0) - coalesce(p.earlier, 0)) / p.revenue,
         coalesce(c.country = 'United Kingdom', false)
  from per_customer p
  join breadth b using (customer_id)
  join first_ever f using (customer_id)
  left join returned r using (customer_id)
  left join customer_segments.customers c using (customer_id);

  get diagnostics v_rows = row_count;
  return v_rows;
end $$;

-- What each customer did in the 12 months after a snapshot (validation only).
create or replace function customer_segments.next_year(p_as_of date)
returns table (customer_id integer, revenue numeric, bought boolean)
language sql stable as $$
  select f.customer_id, coalesce(sum(t.revenue), 0), count(t.*) > 0
  from customer_segments.customer_features f
  left join customer_segments.transactions t
    on t.customer_id = f.customer_id
   and t.invoice_date >= p_as_of and t.invoice_date < p_as_of + interval '365 days'
  where f.as_of = p_as_of
  group by f.customer_id
$$;

-- ── Model ────────────────────────────────────────────────────────────────────

create table if not exists customer_segments.model_runs (
  model_id    bigserial primary key,
  created_at  timestamptz not null default now(),
  trained_on  date not null,
  features    text[] not null,
  k           smallint not null,
  seed        integer not null,
  scaler      jsonb not null,     -- per feature: transform, caps, mean, sd
  selection   jsonb not null,     -- candidate feature sets × k: silhouette, sizes, next-year R²
  stability   jsonb not null,     -- bootstrap adjusted Rand index
  baseline    jsonb not null,     -- RFM score groups on the same checks
  is_current  boolean not null default false
);
create unique index if not exists model_runs_one_current on customer_segments.model_runs (is_current) where is_current;

create table if not exists customer_segments.centroids (
  model_id  bigint not null references customer_segments.model_runs on delete cascade,
  segment   smallint not null,
  scaled    real[] not null,
  primary key (model_id, segment)
);

create table if not exists customer_segments.assignments (
  model_id     bigint not null references customer_segments.model_runs on delete cascade,
  as_of        date not null,
  customer_id  integer not null,
  segment      smallint not null,
  distance     real not null,
  runner_up    smallint not null,
  runner_up_distance real not null,
  primary key (model_id, as_of, customer_id)
);

-- ── Marts (current model) ────────────────────────────────────────────────────

create or replace view customer_segments.mart_segment_profile as
select a.as_of, a.segment,
       count(*)                                              as customers,
       sum(f.revenue)                                        as revenue,
       percentile_cont(0.5) within group (order by f.recency_days)    as recency_days,
       percentile_cont(0.5) within group (order by f.orders)          as orders,
       percentile_cont(0.5) within group (order by f.avg_order_value) as avg_order_value,
       percentile_cont(0.5) within group (order by f.tenure_days)     as tenure_days,
       percentile_cont(0.5) within group (order by f.active_months)   as active_months,
       percentile_cont(0.5) within group (order by f.product_breadth) as product_breadth,
       avg(f.return_rate)                                    as return_rate,
       avg(f.trend)                                          as trend,
       avg(f.country_uk::int)                                as share_uk
from customer_segments.assignments a
join customer_segments.model_runs m on m.model_id = a.model_id and m.is_current
join customer_segments.customer_features f on f.as_of = a.as_of and f.customer_id = a.customer_id
group by 1, 2;

-- Did the segment predict the next 12 months? (next_year runs once, materialised.)
create or replace view customer_segments.mart_segment_value as
with m as (select model_id, trained_on from customer_segments.model_runs where is_current),
n as materialized (select * from customer_segments.next_year((select trained_on from m)))
select a.as_of, a.segment,
       count(*)                          as customers,
       sum(f.revenue)                    as revenue,
       avg(n.revenue)                    as next_year_revenue,
       avg((not n.bought)::int)          as churn_rate
from m
join customer_segments.assignments a on a.model_id = m.model_id and a.as_of = m.trained_on
join n on n.customer_id = a.customer_id
join customer_segments.customer_features f on f.as_of = a.as_of and f.customer_id = a.customer_id
group by 1, 2;

-- Segment at training vs. a year later; 'lapsed' = no purchase in the later window.
create or replace view customer_segments.mart_migration as
select a.segment as from_segment,
       coalesce(b.segment::text, 'lapsed') as to_segment,
       count(*) as customers,
       sum(f.revenue) as revenue_before,
       coalesce(sum(g.revenue), 0) as revenue_after
from customer_segments.assignments a
join customer_segments.model_runs m on m.model_id = a.model_id and m.is_current and a.as_of = m.trained_on
join customer_segments.customer_features f on f.as_of = a.as_of and f.customer_id = a.customer_id
left join customer_segments.assignments b
  on b.model_id = a.model_id and b.customer_id = a.customer_id and b.as_of = (a.as_of + interval '1 year')::date
left join customer_segments.customer_features g on g.as_of = b.as_of and g.customer_id = b.customer_id
group by 1, 2;
