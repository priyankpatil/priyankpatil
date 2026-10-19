# Priyank Patil — Portfolio

Personal portfolio site: project case studies, a career timeline, MDX articles, and two live demos (natural language → SQL, and customer segmentation).

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

CI (`.github/workflows/ci.yml`) runs lint, typecheck and build on every push to `master` and on pull requests.

## Project structure

```
app/                    Routes (App Router)
  api/nl-sql/           Streaming NL → SQL endpoint (Groq), rate limited
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
  rate-limit.ts         Rate limiter for public API routes
  site.ts               Site URL, name and description
  og.tsx                Shared layout for generated social preview images
public/images/          Static images
plan.md                 Design system and site structure
```

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
