# Portfolio Plan

This document describes the site as it is built today. It replaces the original
"editorial serif" plan; the design moved to a cleaner, product-style system with
interactive data visualizations, and this file was updated to match.

## Brand Intent
**Positioning:** Senior product & analytics leader — at the intersection of data infrastructure, AI, and business strategy.
**Feel:** Confident, modern, product-grade. Clear hierarchy, generous whitespace, data shown rather than described.

---

## Design System

Tokens live as CSS custom properties in `app/globals.css` and are exposed to
Tailwind as colors in `tailwind.config.ts` (`bg-surface`, `text-muted`,
`border-border`, …). Prefer those Tailwind classes over inline `style={{}}`;
keep inline styles only for values computed from data (per-series colors,
widths from percentages).

### Colors
Light and dark themes via `next-themes` (class strategy, follows the OS by default).

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--bg` | `#f5f7fb` | `#05080f` | Page background |
| `--surface` | `#ffffff` | `#0d1522` | Cards, panels |
| `--surface-muted` | `#edf2f9` | `#141f30` | Tags, inset areas |
| `--text` | `#0c1628` | `#f3f7ff` | Headings, primary text |
| `--muted` | `#42516b` | `#cfdaec` | Body copy |
| `--soft` | `#6d7b93` | `#9eabc2` | Labels, metadata, captions |
| `--accent` | `#0071e3` | `#4ea0ff` | Links, primary actions, highlights |
| `--accent-soft` | accent @ 14% | accent @ 22% | Accent backgrounds |
| `--border` / `--border-strong` | navy @ 12% / 20% | white-blue @ 15% / 24% | Dividers, card edges |

The SQL demo panel and code blocks are intentionally always dark (VS Code-style palette).

### Typography
| Role | Font | Usage |
|---|---|---|
| Sans / Display | Geist (`next/font/google`, `--font-sans`) | Everything: hero name, headings, body, nav |
| Mono | Geist Mono (`--font-mono`) | SQL, schema names, code |

Shared type classes in `globals.css`: `heading-xl`, `heading-lg`, `body-lg`, `kicker` (small uppercase label).

### Principles
- Present product management and analytics as equal strengths: product framing first, data depth second.
- Show impact with data: headline metrics and interactive charts are welcome, but every number should be tied to a specific project or role.
- Motion is subtle and purposeful (scroll reveals, small hover lifts) and always respects `prefers-reduced-motion`.
- Calls to action are allowed but restrained: "View projects", "View articles", "Contact".
- One accent color; per-series chart colors only inside visualizations.
- Every page works in both light and dark themes.

---

## Site Structure

### Home (`/`) — single scrolling page with section nav
1. **Intro** — large "PRIYANK PATIL" display name, one positioning line, three pill CTAs, a snapshot strip (13+ years, 3 industries, 20+ major programs, India/US flags), and the portrait.
2. **Skills** — Learn / Build / Scale cards plus the interactive Skills Pulse bar chart (lens switcher: product, engineering, analytics, AI; opens on product).
3. **Experience** — short summary, the latest roles, and the Experience Signal chart (Amazon / Clarke / Mercedes outcomes).
4. **Projects** — project cards plus the Project Impact chart.
5. **Capabilities** — four capability areas written as short prose.
6. **Writing** — the two most recent published articles.
7. **Contact / footer** — email, LinkedIn, GitHub icons and footer link columns.

### Other routes
| Route | Purpose |
|---|---|
| `/projects` | Project archive |
| `/projects/[id]` | Case study: problem, reflection, approach, architecture diagram, impact tiles. The GenAI project uses a long-form article instead (`components/project-articles/GenAIArticle.tsx`). |
| `/projects/nl-sql` | Live NL → SQL demo: RAG over a Supabase pgvector knowledge base, Groq open-weight models with fallback, validated read-only execution with self-correction, rate limited |
| `/projects/customer-segments` | Client-side customer segmentation demo (nearest-centroid) |
| `/experience` | Full career timeline |
| `/writing`, `/writing/[slug]` | Article list and article pages (MDX) |
| `/contact` | Email, LinkedIn, GitHub cards |

### Projects
| Project | Org | Year |
|---|---|---|
| GenAI Analytics Agent | Amazon Pharmacy | 2025 |
| Snowflake to Redshift Migration | Amazon Pharmacy | 2024 |
| Digital Inspection App | Clarke Power | 2020 |
| Customer Stratification Model | Clarke Power | 2019 |

Project data lives in `lib/portfolio-data.ts` (cards) and `lib/project-writeups.ts` (case studies).

### Experience
| Company | Role | Period |
|---|---|---|
| Amazon | Senior Analyst | Sep 2025 – Present |
| Amazon | Senior Business Analyst | Apr 2023 – Aug 2025 |
| Amazon | Business Analyst II | Jul 2021 – Mar 2023 |
| Clarke Power Services | Product Manager | May 2018 – Jul 2021 |
| Mercedes Benz R&D India | Product Analyst | Aug 2012 – Jul 2016 |

---

## Writing / Articles Architecture

**Approach:** MDX files in `content/writing/`. No CMS — write, commit, and the deploy picks it up.

**Frontmatter:**
```
---
title: "Why Most Dashboards Fail"
date: "2025-04-15"
excerpt: "One sentence that describes the article."
tag: "Analytics Strategy"
published: true
---
```
Only `published: true` articles are listed, routed, and included in the sitemap.

**Libraries:** `next-mdx-remote` (RSC rendering), `gray-matter` (frontmatter), `reading-time`.

---

## Platform

- Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 3, framer-motion, Recharts.
- SEO: `metadataBase`, generated Open Graph images (site, each article, each project), canonical URLs, `sitemap.xml`, `robots.txt`, RSS at `/feed.xml`, and schema.org JSON-LD (Person + WebSite on every page, BlogPosting on articles) in `lib/structured-data.ts`.
- Analytics: Vercel Web Analytics.
- CI: GitHub Actions runs lint, typecheck, and build on every push and PR.

## Backlog
- [ ] More articles (only one published so far)
- [ ] Responsive layout for the two demos on small screens
