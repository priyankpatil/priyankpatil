# Priyank Patil — Portfolio

Personal portfolio site: project case studies, a career timeline, MDX articles, and interactive demos (natural language → SQL, customer segmentation, CX evaluation, and Wikipedia streaming).

Built with Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, framer-motion and Recharts.

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local   # then add your GROQ_API_KEY
npm run dev                  # http://localhost:3000
```

Everything except the NL → SQL demo works without any environment variables.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GROQ_API_KEY` | For the NL → SQL demo | Groq API key used by `/api/nl-sql` |
| `GROQ_MODELS` | Optional | Comma-separated Groq model chain, tried in order with retries and fallback. Defaults to `openai/gpt-oss-120b,openai/gpt-oss-20b,qwen/qwen3.8-27b` (see `lib/llm.ts`). Update it when Groq retires a model; no code change needed. |
| `NLSQL_DATABASE_URL` | For live NL → SQL (RAG + execution) | Supabase **transaction pooler** URL for the `nlsql_app` role (see [NL → SQL demo setup](#nl--sql-demo-setup-supabase)). Without it the demo still writes SQL from the full schema but does not retrieve or run anything. |
| `SUPABASE_URL`, `NLSQL_EMBED_SECRET` | For semantic retrieval | Project URL and the shared secret of the `nl-sql-embed` Edge Function. Without them retrieval falls back to full-text search. |
| `NLSQL_DATABASE_CA` | Optional | Supabase CA certificate (PEM) to verify the database TLS certificate. Without it the connection is encrypted but the certificate is not verified. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Recommended in production | Shared rate limiting for the demo API. Without them an in-memory limiter is used, which only limits per serverless instance. |
| `NEXT_PUBLIC_SITE_URL` | Optional | Canonical URL for metadata, sitemap and robots. Falls back to the Vercel production domain, then `http://localhost:3000`. |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint (flat config in `eslint.config.mjs`) |
| `npm run typecheck` | TypeScript check |
| `npm run nl-sql:ingest` | Verify the example queries and load the NL → SQL knowledge base into Supabase |

CI (`.github/workflows/ci.yml`) runs lint, typecheck and build on every push to `master` and on pull requests.

## Project structure

```
app/                    Routes (App Router)
  api/nl-sql/           NL → SQL pipeline endpoint (streams each step as NDJSON), rate limited
  api/nl-sql/preview/   Live sample rows for the demo's schema browser
  projects/[id]/        Project case study pages
  writing/[slug]/       Article pages rendered from MDX
  feed.xml/              RSS feed of published articles
  sitemap.ts, robots.ts, opengraph-image.tsx   (articles and projects have their own social images too)
components/             UI components, charts and demos
  home/                 Pieces of the home page (footer, flags)
  demos/                NL → SQL and customer segmentation demos
content/writing/        Articles (.mdx)
lib/
  portfolio-data.ts     Projects, experience, capabilities, hero stats
  project-writeups.ts   Case study content for /projects/[id]
  writing.ts            MDX loading and date formatting
  llm.ts                Groq model chain with failure-aware retries and fallback
  nl-sql/               NL → SQL RAG pipeline: knowledge base, retrieval, validation, execution
  rate-limit.ts         Rate limiter for public API routes
  site.ts               Site URL, name and description
  og.tsx                Shared layout for generated social preview images
pipelines/cx-eval/      CX auto-evaluation pipeline (ETL → LLM judge → scores → marts); see PLAN.md
pipelines/wiki-stream/  Wikipedia → Aiven Kafka → bounded Supabase → live feed; see README.md
public/images/          Static images
scripts/                nl-sql-ingest.mts (knowledge base loader)
supabase/               Migration (demo data, pgvector store, app role) and the embedding Edge Function
plan.md                 Design system and site structure
```

## NL → SQL demo setup (Supabase)

The demo at `/projects/nl-sql` is a small RAG system:

1. **Retrieve.** The question is embedded (gte-small, inside a Supabase Edge Function), and a hybrid search fuses pgvector similarity with Postgres full-text search to pick the relevant tables, business definitions and verified example queries.
2. **Generate.** An open-weight model on Groq writes PostgreSQL from that context, falling back across models on errors or rate limits (`lib/llm.ts`).
3. **Validate.** The SQL is parsed. It must be a single SELECT that uses only the five demo tables and allowlisted functions.
4. **Execute.** It runs in a read-only transaction as the `nlsql_app` role (SELECT-only, 4s timeout, 100-row cap). On a validation or database error the model gets one self-correction round with the exact error.
5. **Log.** Every request is written to `nlsql_rag.query_log`.

Each stage degrades instead of failing: no embeddings → full-text retrieval; database unreachable → full schema, SQL shown without running; no Supabase configured → SQL generation only.

**One-time setup** (free Supabase plan is enough):

1. Create a Supabase project.
2. In the SQL editor, run `supabase/migrations/20261019000000_nl_sql_rag.sql`, then set the app role's password:
   ```sql
   alter role nlsql_app with password '<long random password>';
   ```
3. Deploy the embedding function with the [Supabase CLI](https://supabase.com/docs/guides/cli):
   ```bash
   supabase login
   supabase link --project-ref <project-ref>
   supabase secrets set NLSQL_EMBED_SECRET=<another random string>
   supabase functions deploy nl-sql-embed --no-verify-jwt
   ```
4. Load the knowledge base from your machine. `SUPABASE_DB_URL` is the `postgres` user's connection string (Project Settings → Database). The script runs every example query first and refuses to load if any fail.
   ```bash
   SUPABASE_DB_URL='postgresql://postgres.<ref>:<db-password>@<pooler-host>:5432/postgres' \
   SUPABASE_URL=https://<ref>.supabase.co NLSQL_EMBED_SECRET=<secret> \
   npm run nl-sql:ingest
   ```
5. In Vercel, add these environment variables and redeploy:
   - `NLSQL_DATABASE_URL`: the transaction pooler string (port 6543) with the app role as the user, `postgresql://nlsql_app.<ref>:<nlsql_app password>@<pooler-host>:6543/postgres`
   - `SUPABASE_URL`: `https://<ref>.supabase.co`
   - `NLSQL_EMBED_SECRET`: the secret from step 3

**Maintenance**
- Edit `lib/nl-sql/knowledge.ts` (table docs, definitions, rules, examples) and re-run `npm run nl-sql:ingest`.
- The data is anchored to the day the migration ran. `select nlsql_demo.shift_dates();` moves it forward; schedule it monthly with pg_cron (see the migration).
- `select * from nlsql_rag.query_log order by id desc;` shows what visitors ask, which model answered, and what failed. Questions that keep failing are good candidates for new examples or definitions.

## Adding content

**An article:** create `content/writing/<slug>.mdx`:

```mdx
---
title: "Article title"
date: "2025-06-01"
excerpt: "One sentence that describes the article."
tag: "Analytics Strategy"
published: true
---

Article body in Markdown/MDX.
```

Set `published: false` to keep a draft out of the site and the sitemap.

**A project:** add an entry to `projectItems` in `lib/portfolio-data.ts` and a matching entry (same `id`) to `projectWriteups` in `lib/project-writeups.ts`. The detail page at `/projects/<id>` is generated automatically.

## Styling

Theme colors are CSS variables in `app/globals.css` (light and dark), exposed as Tailwind colors such as `bg-surface`, `text-muted` and `border-border`. Use those classes instead of inline styles; keep `style={{}}` for values computed from data. See `plan.md` for the full design system.

## Deployment

Designed for Vercel: import the repo, set `GROQ_API_KEY` (and ideally the Upstash variables), and deploy. Pages are statically generated; only `/api/nl-sql` runs per request. Visitor analytics use Vercel Web Analytics (`@vercel/analytics`); enable **Analytics** in the Vercel project dashboard for data to appear.

## Wikipedia Live (cloud Kafka)

The new project at `/projects/wiki-stream` includes a recording of real Kafka-processed Wikipedia events and a live mode backed by Aiven Kafka. See [setup, budgets, worker deployment and verification](pipelines/wiki-stream/README.md). Initialize storage with `npm run wiki:db:check` then `npm run wiki:db:apply`, add Aiven credentials to ignored `.env.local`, and run `npm run wiki:topics` and `npm run wiki:worker`. The site uses a separate restricted read connection. No local Kafka installation is required.
