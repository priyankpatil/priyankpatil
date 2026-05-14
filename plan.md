# Portfolio Plan

## Brand Intent
**Positioning:** At the intersection of data infrastructure and business strategy.
**Feel:** Confident, editorial, never busy. The work speaks — the site doesn't shout.

---

## Design System

### Colors
| Token | Value | Usage |
|---|---|---|
| Background | `#0d0d0d` | Page background |
| Surface | `#141414` | Card / section backgrounds |
| Text primary | `#f0ede8` | Headings, body |
| Text secondary | `#888` | Labels, dates, metadata |
| Accent | `#c8a97e` | Copper/gold — used sparingly |
| Border | `rgba(255,255,255,0.06)` | Dividers, card edges |

### Typography
| Role | Font | Usage |
|---|---|---|
| Display | Cormorant Garamond | Hero name, section titles |
| Body / UI | Inter | Body copy, nav, labels |
| Mono | DM Mono | Tags, metadata, dates |

### Principles
- No glassmorphism, no glowing orbs, no grid patterns
- No typewriter effects, no animated number counters
- No "Hire me", "Open to opportunities", "Download resume"
- Scroll feels intentional — reveal animations are subtle, not performative
- Impact lives inside project stories, never as decontextualized metrics

---

## Site Structure

### 1. Hero
- Full viewport
- Large serif display: "Priyank Patil"
- One positioning line: *"Working at the intersection of data infrastructure and business strategy."*
- No buttons, no badges, no status

### 2. POV / Brief
- 2–3 sentences, first person, opinionated
- Not a bio summary — a point of view
- Draft: *"I build systems that help organizations see clearly — then help them decide what to do next. Thirteen years across Amazon, Clarke Power, and Mercedes Benz, always at the table where data becomes direction."*

### 3. Selected Projects (4 cards)
Each card: **what it was** · **what changed** · **what it took**
Impact is woven into the narrative, not extracted as a number

| # | Project | Context |
|---|---|---|
| 1 | **GenAI Analytics Agent** | Natural language → SQL system for non-technical stakeholders at Amazon Pharmacy |
| 2 | **Digital Inspection App** | Mobile-first tool replacing paper-based vehicle inspections at Clarke Power |
| 3 | **Customer Stratification Model** | Stratification model that reoriented Clarke Power's go-to-market strategy |
| 4 | **Snowflake to Redshift Migration** | End-to-end data platform migration at Amazon Pharmacy — ETL workflows, reporting transition, infrastructure cost reduction |

### 4. Expertise
3–4 areas written as craft, not a tag cloud:
- Data Architecture & Infrastructure
- Analytics Strategy
- AI/ML Integration
- Product Analytics
- Product Management

### 5. Where I've Worked
Company · Role · Dates. No bullet points. Projects do the talking.

| Company | Role | Period |
|---|---|---|
| Amazon | Senior Analyst | Sep 2025 – Present |
| Amazon | Senior Business Analyst | Apr 2023 – Aug 2025 |
| Amazon | Business Analyst II | Jul 2021 – Mar 2023 |
| Clarke Power Services | Product Manager | May 2018 – Jul 2021 |
| Mercedes Benz R&D India | Product Analyst | Aug 2012 – Jul 2016 |

### 6. Writing (teaser on homepage)
- Homepage shows 2–3 most recent article cards — title, date, one-line description
- "View all" links to `/writing`
- No full articles on the homepage

### 7. Contact
Email + LinkedIn + GitHub. Three clean cards, no clutter.

---

## Writing / Articles Architecture

**Approach:** MDX files stored in the repo under `content/writing/`. No CMS — write in your editor, commit, Vercel auto-deploys.

**Routes:**
- `/writing` — list of all articles (title, date, tag, excerpt)
- `/writing/[slug]` — individual article, full prose layout

**File format:** Each article is a `.mdx` file with frontmatter:
```
---
title: "Why Most Dashboards Fail"
date: "2025-06-01"
excerpt: "One sentence that describes the article."
tag: "Analytics Strategy"
published: true
---
```

**Content folder structure:**
```
content/
  writing/
    why-most-dashboards-fail.mdx
    building-a-genai-analytics-agent.mdx
```

**Libraries needed:**
- `next-mdx-remote` — renders MDX server-side in App Router
- `gray-matter` — parses frontmatter
- `reading-time` — auto reading time estimate

**Article page design:**
- Max-width prose column (~65ch), generous line height
- Display serif for article title, Inter for body
- Date + reading time in mono up top
- No sidebar, no related posts clutter
- Back link to `/writing`

**Nav update:** Add "Writing" link alongside the homepage sections.

---

## Build Tasks

- [ ] **Wipe existing components** — remove the slop, start fresh
- [ ] **Set up fonts** — Cormorant Garamond + Inter + DM Mono via next/font
- [ ] **Update globals.css** — new color tokens, typography scale, no utility classes from old design
- [ ] **Navigation** — minimal, appears on scroll, no CTA, includes Writing link
- [ ] **Hero section** — large serif name, single positioning line
- [ ] **POV section** — short editorial paragraph
- [ ] **Projects section** — 4 cards, narrative-driven
- [ ] **Expertise section** — 3–4 areas with short prose
- [ ] **Where I've Worked** — minimal timeline, no bullets
- [ ] **Writing teaser** — 2–3 latest articles on homepage
- [ ] **Contact section** — email + LinkedIn + GitHub
- [ ] **`/writing` page** — article list
- [ ] **`/writing/[slug]` page** — individual article layout
- [ ] **`content/writing/` folder** — sample article to validate the pipeline
- [ ] **Polish pass** — spacing, responsive, scroll animations (subtle)
- [ ] **Vercel deploy**
