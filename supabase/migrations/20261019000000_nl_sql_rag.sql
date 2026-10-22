-- NL → SQL demo: synthetic pharmacy retail data, a RAG knowledge store with
-- hybrid (vector + full-text) search, a query log, and a dedicated login role
-- the website uses. Run once per Supabase project (SQL editor or `supabase db push`).
--
-- After running, set a password for the app role (never commit it):
--   alter role nlsql_app with password '<strong random password>';

create extension if not exists vector with schema extensions;

create schema if not exists nlsql_demo;
create schema if not exists nlsql_rag;

-- ── Demo data ───────────────────────────────────────────────────────────────

create table if not exists nlsql_demo.customers (
  customer_id      text primary key,
  segment          text not null,
  lifetime_value   numeric(12, 2) not null,
  acquisition_date date not null,
  region           text not null,
  prime_member     boolean not null
);

create table if not exists nlsql_demo.products (
  product_id   text primary key,
  product_name text not null,
  category     text not null,
  brand        text not null,
  price        numeric(10, 2) not null,
  margin_pct   numeric(5, 2) not null
);

create table if not exists nlsql_demo.orders (
  order_id     text primary key,
  customer_id  text not null references nlsql_demo.customers,
  product_id   text not null references nlsql_demo.products,
  order_date   date not null,
  status       text not null,
  total_amount numeric(10, 2) not null,
  channel      text not null
);

create table if not exists nlsql_demo.pharmacy_fills (
  fill_id     text primary key,
  customer_id text not null references nlsql_demo.customers,
  drug_id     text not null,
  fill_date   date not null,
  days_supply integer not null,
  copay       numeric(8, 2) not null,
  fill_status text not null
);

create table if not exists nlsql_demo.inventory (
  product_id       text not null references nlsql_demo.products,
  warehouse_id     text not null,
  quantity_on_hand integer not null,
  reorder_point    integer not null,
  last_restocked   date not null,
  primary key (product_id, warehouse_id)
);

create index if not exists orders_customer_idx on nlsql_demo.orders (customer_id);
create index if not exists orders_date_idx on nlsql_demo.orders (order_date);
create index if not exists fills_customer_idx on nlsql_demo.pharmacy_fills (customer_id);
create index if not exists fills_date_idx on nlsql_demo.pharmacy_fills (fill_date);

-- Deterministic synthetic data, anchored to the date the migration runs.
-- Re-running is a no-op once data exists.
do $$
declare
  anchor date := current_date;
begin
  if exists (select 1 from nlsql_demo.customers) then
    return;
  end if;

  perform setseed(0.42);

  insert into nlsql_demo.customers
  select
    'cust_' || lpad(i::text, 4, '0'),
    case
      when r < 0.18 then 'Champions'
      when r < 0.45 then 'Promising'
      when r < 0.70 then 'At-Risk'
      else 'Inactive'
    end,
    round((case
      when r < 0.18 then 3000 + random() * 5000
      when r < 0.45 then 400 + random() * 1600
      when r < 0.70 then 1500 + random() * 3000
      else 50 + random() * 600
    end)::numeric, 2),
    anchor - (30 + floor(random() * 2400))::int,
    (array['Northeast', 'Southeast', 'Midwest', 'Southwest', 'West'])[1 + floor(random() * 5)::int],
    random() < 0.55
  from (select i, random() as r from generate_series(1, 2000) as i) s;

  insert into nlsql_demo.products
  select
    'prod_' || lpad(i::text, 4, '0'),
    d.name || ' ' || d.strength,
    d.category,
    case when random() < 0.7 then 'Generic' else d.brand end,
    round((d.base_price * (0.8 + random() * 0.6))::numeric, 2),
    round((25 + random() * 50)::numeric, 2)
  from generate_series(1, 120) as i
  cross join lateral (
    select * from (values
      ('Metformin', '500mg', 'Diabetes', 'Glucophage', 12.99),
      ('Lisinopril', '10mg', 'Blood Pressure', 'Zestril', 8.50),
      ('Atorvastatin', '20mg', 'Cholesterol', 'Lipitor', 45.00),
      ('Vitamin D3', '2000IU', 'Supplements', 'Nature Made', 18.75),
      ('Omeprazole', '20mg', 'GI', 'Prilosec', 14.25),
      ('Amlodipine', '5mg', 'Blood Pressure', 'Norvasc', 9.80),
      ('Levothyroxine', '50mcg', 'Thyroid', 'Synthroid', 16.40),
      ('Sertraline', '50mg', 'Mental Health', 'Zoloft', 22.10),
      ('Albuterol', '90mcg', 'Respiratory', 'ProAir', 38.60),
      ('Ibuprofen', '200mg', 'Pain Relief', 'Advil', 7.25),
      ('Cetirizine', '10mg', 'Allergy', 'Zyrtec', 11.90),
      ('Insulin Glargine', '100u/mL', 'Diabetes', 'Lantus', 89.00)
    ) as v(name, strength, category, brand, base_price)
    offset (i % 12) limit 1
  ) d;

  insert into nlsql_demo.orders
  select
    'ord_' || lpad(i::text, 6, '0'),
    'cust_' || lpad((1 + floor(random() * 2000))::int::text, 4, '0'),
    p.product_id,
    anchor - floor(random() * 730)::int,
    case
      when s < 0.85 then 'completed'
      when s < 0.90 then 'pending'
      when s < 0.96 then 'refunded'
      else 'cancelled'
    end,
    round(p.price * (1 + floor(random() * 3))::numeric, 2),
    (array['web', 'web', 'mobile', 'mobile', 'pharmacy', 'phone'])[1 + floor(random() * 6)::int]
  from (select i, random() as s, 1 + floor(random() * 120)::int as pick from generate_series(1, 25000) as i) o
  join nlsql_demo.products p on p.product_id = 'prod_' || lpad(o.pick::text, 4, '0');

  insert into nlsql_demo.pharmacy_fills
  select
    'fill_' || lpad(i::text, 6, '0'),
    'cust_' || lpad((1 + floor(random() * 2000))::int::text, 4, '0'),
    'drug_' || lpad((1 + floor(random() * 80))::int::text, 4, '0'),
    anchor - floor(random() * 730)::int,
    case when random() < 0.6 then 30 else 90 end,
    (array[0, 5, 10, 10, 20, 40])[1 + floor(random() * 6)::int],
    case
      when s < 0.82 then 'dispensed'
      when s < 0.90 then 'abandoned'
      when s < 0.96 then 'rejected'
      else 'pending'
    end
  from (select i, random() as s from generate_series(1, 15000) as i) f;

  insert into nlsql_demo.inventory
  select
    p.product_id,
    w.warehouse_id,
    case when random() < 0.15 then floor(random() * 300)::int else 300 + floor(random() * 4700)::int end,
    (array[200, 300, 400, 500, 600])[1 + floor(random() * 5)::int],
    anchor - floor(random() * 60)::int
  from nlsql_demo.products p
  cross join (values ('wh-east-01'), ('wh-west-02'), ('wh-central')) as w(warehouse_id);
end
$$;

-- Keeps "last 12 months"-style questions meaningful as time passes: shifts
-- every demo date forward so the newest order lands on today. Run it manually
-- or monthly with pg_cron:
--   select cron.schedule('nlsql-shift-dates', '0 3 1 * *', 'select nlsql_demo.shift_dates()');
create or replace function nlsql_demo.shift_dates()
returns integer
language plpgsql
set search_path = nlsql_demo, pg_catalog
as $$
declare
  gap integer;
begin
  select current_date - max(order_date) into gap from orders;
  if gap is null or gap <= 0 then
    return 0;
  end if;
  update orders set order_date = order_date + gap;
  update pharmacy_fills set fill_date = fill_date + gap;
  update customers set acquisition_date = acquisition_date + gap;
  update inventory set last_restocked = last_restocked + gap;
  return gap;
end
$$;
revoke all on function nlsql_demo.shift_dates() from public;

-- ── RAG knowledge store ─────────────────────────────────────────────────────

create table if not exists nlsql_rag.documents (
  id         text primary key,
  kind       text not null check (kind in ('table', 'glossary', 'rule', 'example')),
  title      text not null,
  content    text not null,
  metadata   jsonb not null default '{}'::jsonb,
  fts        tsvector generated always as (to_tsvector('english', title || ' ' || content)) stored,
  embedding  extensions.vector(384),
  updated_at timestamptz not null default now()
);

create index if not exists documents_fts_idx on nlsql_rag.documents using gin (fts);
create index if not exists documents_embedding_idx on nlsql_rag.documents
  using hnsw (embedding extensions.vector_cosine_ops);

-- Hybrid search: full-text and vector rankings fused with Reciprocal Rank
-- Fusion. Full-text uses OR semantics so natural-language questions still
-- match; a null embedding degrades to full-text only.
create or replace function nlsql_rag.hybrid_search(
  query_text text,
  query_embedding extensions.vector(384) default null,
  match_count int default 12,
  full_text_weight float default 1,
  semantic_weight float default 1,
  rrf_k int default 50
)
returns table (id text, kind text, title text, content text, metadata jsonb, score float)
language sql
stable
set search_path = nlsql_rag, extensions, pg_catalog
as $$
  with q as (
    select nullif(replace(plainto_tsquery('english', query_text)::text, '&', '|'), '')::tsquery as tsq
  ),
  full_text as (
    select d.id, row_number() over (order by ts_rank_cd(d.fts, q.tsq) desc) as rank_ix
    from documents d, q
    where q.tsq is not null and d.fts @@ q.tsq
    order by ts_rank_cd(d.fts, q.tsq) desc
    limit least(match_count, 30) * 2
  ),
  semantic as (
    select d.id, row_number() over (order by d.embedding <=> query_embedding) as rank_ix
    from documents d
    where query_embedding is not null and d.embedding is not null
    order by d.embedding <=> query_embedding
    limit least(match_count, 30) * 2
  )
  select d.id, d.kind, d.title, d.content, d.metadata,
    coalesce(1.0 / (rrf_k + ft.rank_ix), 0.0) * full_text_weight
      + coalesce(1.0 / (rrf_k + s.rank_ix), 0.0) * semantic_weight as score
  from full_text ft
  full outer join semantic s on ft.id = s.id
  join documents d on d.id = coalesce(ft.id, s.id)
  order by score desc
  limit least(match_count, 30)
$$;

create table if not exists nlsql_rag.query_log (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  question       text not null,
  generated_sql  text,
  status         text not null,
  error          text,
  model          text,
  attempts       int,
  retrieved_ids  text[],
  row_count      int,
  latency_ms     int
);

-- ── App role ────────────────────────────────────────────────────────────────
-- The website logs in as nlsql_app. It cannot switch to other roles, so a
-- crafted query cannot escalate (e.g. via set_config('role', ...)).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'nlsql_app') then
    create role nlsql_app login noinherit connection limit 20;
  end if;
end
$$;

alter role nlsql_app set statement_timeout = '5s';
alter role nlsql_app set idle_in_transaction_session_timeout = '10s';

revoke all on schema nlsql_demo, nlsql_rag from public;
grant usage on schema nlsql_demo, nlsql_rag, extensions to nlsql_app;
grant select on all tables in schema nlsql_demo to nlsql_app;
grant select on nlsql_rag.documents to nlsql_app;
grant insert on nlsql_rag.query_log to nlsql_app;
revoke all on function nlsql_rag.hybrid_search from public;
grant execute on function nlsql_rag.hybrid_search to nlsql_app;
