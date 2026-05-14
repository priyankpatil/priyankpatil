"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import ExperienceSignalChart from "@/components/ExperienceSignalChart";
import ProjectImpactChart from "@/components/ProjectImpactChart";
import SkillsPulseChart from "@/components/SkillsPulseChart";
import { capabilityAreas, experienceItems, heroStats, projectItems } from "@/lib/portfolio-data";

interface ArticleTeaser {
  slug: string;
  title: string;
  excerpt: string;
  tag: string;
  readingTime: string;
  dateLabel: string;
}

const riseIn = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] },
  },
};

const contactLinks = [
  {
    label: "Email",
    href: "mailto:priyank.patil3@gmail.com",
    icon: "email",
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/priyank-patil",
    icon: "linkedin",
  },
  {
    label: "GitHub",
    href: "https://github.com/priyankpatil",
    icon: "github",
  },
] as const;

const footerColumns = [
  {
    title: "Portfolio",
    links: [
      { label: "Projects", href: "/projects" },
      { label: "Experience", href: "/experience" },
      { label: "Writing", href: "/writing" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Focus Areas",
    links: [
      { label: "Analytics Strategy", href: "/experience" },
      { label: "Data Platforms", href: "/projects" },
      { label: "AI Decision Systems", href: "/projects" },
      { label: "Thought Pieces", href: "/writing" },
    ],
  },
  {
    title: "Direct",
    links: [
      { label: "Email", href: "mailto:priyank.patil3@gmail.com" },
      { label: "LinkedIn", href: "https://www.linkedin.com/in/priyank-patil" },
      { label: "GitHub", href: "https://github.com/priyankpatil" },
    ],
  },
] as const;

const countryFlags = [
  { code: "in", label: "India" },
  { code: "us", label: "United States" },
] as const;

function CountryFlag({ code }: { code: (typeof countryFlags)[number]["code"] }) {
  if (code === "in") {
    return (
      <svg viewBox="0 0 24 16" className="h-4 w-6 overflow-hidden rounded-[2px]" aria-hidden>
        <rect width="24" height="16" fill="#fff" />
        <rect width="24" height="5.33" y="0" fill="#FF9933" />
        <rect width="24" height="5.33" y="10.67" fill="#138808" />
        <circle cx="12" cy="8" r="1.75" fill="none" stroke="#000080" strokeWidth="0.8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 16" className="h-4 w-6 overflow-hidden rounded-[2px]" aria-hidden>
      <rect width="24" height="16" fill="#fff" />
      <g fill="#B22234">
        <rect width="24" height="1.23" y="0" />
        <rect width="24" height="1.23" y="2.46" />
        <rect width="24" height="1.23" y="4.92" />
        <rect width="24" height="1.23" y="7.38" />
        <rect width="24" height="1.23" y="9.84" />
        <rect width="24" height="1.23" y="12.3" />
        <rect width="24" height="1.23" y="14.76" />
      </g>
      <rect width="10.2" height="8.6" fill="#3C3B6E" />
    </svg>
  );
}

function ContactIcon({ type }: { type: (typeof contactLinks)[number]["icon"] }) {
  if (type === "email") {
    return (
      <svg viewBox="0 0 64 64" className="h-20 w-20" aria-hidden>
        <rect x="8" y="14" width="48" height="36" rx="8" fill="#ffffff" />
        <path d="M12 20 32 35 52 20" fill="none" stroke="#EA4335" strokeWidth="4" strokeLinecap="round" />
        <path d="M12 44V20l20 15 20-15v24" fill="none" stroke="#4285F4" strokeWidth="4" strokeLinejoin="round" />
        <path d="M12 44h40" stroke="#34A853" strokeWidth="4" strokeLinecap="round" />
        <path d="M12 20 24 29" stroke="#FBBC05" strokeWidth="4" strokeLinecap="round" />
        <path d="M52 20 40 29" stroke="#FBBC05" strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "linkedin") {
    return (
      <svg viewBox="0 0 64 64" className="h-20 w-20" aria-hidden>
        <rect x="8" y="8" width="48" height="48" rx="10" fill="#0A66C2" />
        <rect x="18" y="26" width="6" height="20" rx="2" fill="#ffffff" />
        <circle cx="21" cy="20" r="3.5" fill="#ffffff" />
        <path d="M30 46V26h6v3.1c1.4-2.1 3.9-3.7 7.9-3.7 7.1 0 8.1 5 8.1 11.4V46h-6v-8.4c0-4-.9-6.2-3.9-6.2-3.6 0-6.1 2.4-6.1 6.8V46h-6z" fill="#ffffff" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" className="h-20 w-20" aria-hidden>
      <circle cx="32" cy="32" r="24" fill="#181717" />
      <path
        d="M32 14.2c-9.9 0-18 8-18 17.9 0 7.9 5.1 14.6 12.2 17 0.9 0.2 1.2-0.4 1.2-0.9 0-0.5 0-2.1 0-4-5 1.1-6-2.1-6-2.1-0.8-2.1-2-2.6-2-2.6-1.7-1.1 0.1-1.1 0.1-1.1 1.8 0.1 2.8 1.9 2.8 1.9 1.6 2.8 4.3 2 5.3 1.5 0.2-1.2 0.6-2 1.1-2.5-4-0.5-8.2-2-8.2-8.9 0-2 0.7-3.6 1.9-4.9-0.2-0.5-0.8-2.3 0.2-4.8 0 0 1.6-0.5 5.2 1.9 1.5-0.4 3.1-0.6 4.7-0.6 1.6 0 3.2 0.2 4.7 0.6 3.6-2.4 5.2-1.9 5.2-1.9 1 2.5 0.4 4.3 0.2 4.8 1.2 1.3 1.9 2.9 1.9 4.9 0 6.9-4.2 8.4-8.2 8.9 0.6 0.5 1.2 1.6 1.2 3.2 0 2.3 0 4.2 0 4.8 0 0.5 0.3 1.1 1.2 0.9C44.9 46.7 50 40 50 32.1 50 22.2 41.9 14.2 32 14.2z"
        fill="#ffffff"
      />
    </svg>
  );
}

export default function HeroJourney({ articles }: { articles: ArticleTeaser[] }) {
  return (
    <main className="page-scroll">
      <section id="intro" className="scroll-chapter lg:!items-stretch lg:!py-0">
        <div className="mx-auto grid w-full gap-10 px-4 md:px-8 lg:min-h-[calc(100vh-var(--snap-offset))] lg:grid-cols-[1.06fr_0.94fr] lg:items-stretch lg:pr-0 lg:pl-[max(2rem,calc((100vw-1140px)/2))]">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.45 }} variants={riseIn}>
            <motion.h1
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
              className="font-display font-black leading-[0.84] tracking-[-0.05em] text-[clamp(3.6rem,12vw,10.2rem)]"
              style={{ color: "var(--text)" }}
            >
              PRIYANK
              <br />
              PATIL
            </motion.h1>
            <p className="body-lg mt-7 max-w-2xl">
              Senior analytics and strategy leader translating complex data ecosystems into clear business direction,
              durable operating decisions, and measurable enterprise impact.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/projects" className="pill-link primary">
                View projects
              </Link>
              <Link href="/writing" className="pill-link">
                View articles
              </Link>
              <Link href="/contact" className="pill-link">
                Contact
              </Link>
            </div>

            <div
              className="relative mt-7 w-full max-w-[620px] rounded-2xl border px-4 py-3 shadow-none backdrop-blur-sm md:px-5 md:py-4"
              style={{
                borderColor: "var(--border-strong)",
                background: "color-mix(in srgb, var(--surface) 86%, transparent)",
              }}
            >
              <p className="kicker mb-2">Snapshot</p>
              <div className="grid grid-cols-4">
                {heroStats.map((stat, index) => (
                  <motion.div
                    key={stat.label}
                    className="px-3 py-1"
                    style={{
                      borderLeft: index === 0 ? "none" : "1px solid var(--border-strong)",
                    }}
                    whileHover={{ y: -2 }}
                  >
                    <p className="text-[2rem] leading-none font-semibold tracking-tight" style={{ color: "var(--text)" }}>
                      {stat.value}
                    </p>
                    <p className="mt-1 text-[0.62rem] uppercase tracking-[0.14em] leading-tight" style={{ color: "var(--soft)" }}>
                      {stat.label}
                    </p>
                  </motion.div>
                ))}
                <motion.div
                  className="flex items-center justify-center px-3 py-1"
                  style={{ borderLeft: "1px solid var(--border-strong)" }}
                  whileHover={{ y: -2 }}
                >
                  <div className="flex items-center gap-1.5">
                    {countryFlags.map((country) => (
                      <span key={country.code} aria-label={country.label} title={country.label}>
                        <CountryFlag code={country.code} />
                      </span>
                    ))}
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.45 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex min-h-[540px] items-end overflow-hidden lg:h-full lg:min-h-0"
          >
            <div className="absolute inset-0">
              <Image
                src="/images/priyankpatil.jpg"
                alt="Portrait of Priyank Patil"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover object-[58%_20%]"
              />
            </div>

            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(165deg,rgba(2,8,18,0.05)_0%,rgba(2,8,18,0.46)_100%)]" />
          </motion.div>
        </div>
      </section>

      <section id="skills" className="scroll-chapter top lg:!py-4">
        <div className="shell chapter-stack lg:gap-8">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.4 }} variants={riseIn}>
            <h2 className="heading-lg font-semibold">Skills</h2>
            <p className="body-lg mt-4 max-w-3xl">
              I turn messy business questions into shipped products by blending strategy, product judgment, and deep
              data execution from SQL and Python to AI-enabled decision systems.
            </p>
          </motion.div>

          <div className="grid gap-6 lg:grid-cols-[1.02fr_1fr] lg:items-start">
            <div className="grid gap-3">
              {[
                {
                  title: "Frame",
                  body: "Translate ambiguous business problems into measurable KPI frameworks and clear ownership.",
                },
                {
                  title: "Build",
                  body: "Ship resilient data products and pipelines across SQL, Python, PySpark, and AWS architectures.",
                },
                {
                  title: "Scale",
                  body: "Drive adoption through governance, self-serve analytics, and cross-functional operating rhythms.",
                },
              ].map((item, index) => (
                <motion.article
                  key={item.title}
                  className="panel p-4"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.55, delay: index * 0.08, ease: [0.16, 1, 0.3, 1] }}
                  whileHover={{ y: -6 }}
                >
                  <p className="kicker mb-3">0{index + 1}</p>
                  <h3 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6" style={{ color: "var(--muted)" }}>
                    {item.body}
                  </p>
                </motion.article>
              ))}
            </div>
            <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.35 }}>
              <SkillsPulseChart />
            </motion.div>
          </div>
        </div>
      </section>

      <section id="experience" className="scroll-chapter top">
        <div className="shell grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.35 }} variants={riseIn}>
            <h2 className="heading-lg font-semibold">Experience</h2>
            <p className="body-lg mt-5">
              Across Amazon, Clarke, and Mercedes, I evolved from analytics execution to product and platform leadership,
              consistently turning data systems into measurable business outcomes.
            </p>

            <div className="mt-6 grid gap-3">
              {experienceItems.slice(0, 4).map((item) => (
                <motion.div
                  key={`${item.company}-${item.role}`}
                  className="rounded-2xl border p-4"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                  initial={{ opacity: 0, x: -14 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.35 }}
                  transition={{ duration: 0.5 }}
                >
                  <p className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--soft)" }}>
                    {item.period}
                  </p>
                  <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>
                    {item.company} · {item.role}
                  </p>
                </motion.div>
              ))}
            </div>
            <div className="mt-6">
              <Link href="/experience" className="pill-link">
                Full experience timeline
              </Link>
            </div>
          </motion.div>

          <ExperienceSignalChart />
        </div>
      </section>

      <section id="projects" className="scroll-chapter top">
        <div className="shell grid gap-8 lg:grid-cols-[1fr_1.15fr]">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.35 }} variants={riseIn}>
            <h2 className="heading-lg font-semibold">Projects</h2>
            <p className="body-lg mt-5">
              Each project started with a concrete operational bottleneck and ended with a measurable business shift in
              speed, cost, reliability, or decision quality.
            </p>

            <div className="mt-6 grid gap-3">
              {projectItems.slice(0, 2).map((project) => (
                <article
                  key={project.id}
                  className="rounded-2xl border p-4"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  <p className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--soft)" }}>
                    {project.org} · {project.year}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold tracking-tight" style={{ color: "var(--text)" }}>
                    {project.title}
                  </h3>
                  <p className="mt-2 text-sm leading-7" style={{ color: "var(--muted)" }}>
                    {project.outcome}
                  </p>
                </article>
              ))}
            </div>

            <div className="mt-6">
              <Link href="/projects" className="pill-link primary">
                View all projects
              </Link>
            </div>
          </motion.div>

          <ProjectImpactChart />
        </div>
      </section>

      <section id="capabilities" className="scroll-chapter top">
        <div className="shell chapter-stack">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.35 }} variants={riseIn}>
            <h2 className="heading-lg font-semibold">Capabilities behind the outcomes</h2>
          </motion.div>

          <div className="grid gap-4 md:grid-cols-2">
            {capabilityAreas.map((area, index) => (
              <motion.article
                key={area.title}
                className="panel p-6"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.55, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ y: -4 }}
              >
                <p className="kicker mb-2">Capability</p>
                <h3 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
                  {area.title}
                </h3>
                <p className="mt-3 text-sm leading-7" style={{ color: "var(--muted)" }}>
                  {area.detail}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section id="writing" className="scroll-chapter top">
        <div className="shell chapter-stack">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.35 }} variants={riseIn}>
            <h2 className="heading-lg font-semibold">Writing snippets</h2>
            <p className="body-lg mt-5 max-w-2xl">
              Short essays on analytics strategy and execution frameworks from real delivery contexts.
            </p>
          </motion.div>

          <div className="grid gap-4 md:grid-cols-2">
            {articles.length === 0 ? (
              <div className="panel p-6">
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  New essays coming soon.
                </p>
              </div>
            ) : (
              articles.map((article) => (
                <Link key={article.slug} href={`/writing/${article.slug}`} className="card-link">
                  <p className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--soft)" }}>
                    {article.tag} · {article.readingTime}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
                    {article.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7" style={{ color: "var(--muted)" }}>
                    {article.excerpt}
                  </p>
                  <p className="mt-4 text-xs" style={{ color: "var(--soft)" }}>
                    {article.dateLabel}
                  </p>
                </Link>
              ))
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/writing" className="pill-link primary">
              View all articles
            </Link>
            <Link href="/contact" className="pill-link">
              Start a conversation
            </Link>
          </div>
        </div>
      </section>

      <section
        id="contact"
        className="overflow-hidden bg-[var(--bg)] pt-8 pb-4 md:pt-10 md:pb-6 [scroll-snap-align:start] [scroll-snap-stop:always]"
      >
        <div className="shell w-full">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.45 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="grid gap-10 lg:grid-cols-[1.2fr_2fr]">
              <div>
                <h3 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">Contact</h3>
                <p className="mt-5 max-w-md text-lg leading-relaxed text-[rgba(188,205,236,0.84)]">
                  Reach out for analytics leadership, platform strategy, and AI-enabled decision systems.
                </p>

                <div className="mt-7 flex flex-wrap gap-3">
                  {contactLinks.map((item, index) => (
                    <motion.a
                      key={item.label}
                      href={item.href}
                      target={item.href.startsWith("http") ? "_blank" : undefined}
                      rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
                      aria-label={item.label}
                      className="group inline-flex h-14 w-14 items-center justify-center rounded-xl border bg-[rgba(3,18,44,0.86)] dark:bg-[rgba(9,15,28,0.92)]"
                      style={{ borderColor: "rgba(136,169,220,0.26)" }}
                      initial={{ opacity: 0, y: 14 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.5 }}
                      transition={{ duration: 0.45, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}
                      whileHover={{ scale: 1.06 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span className="scale-[0.52] transition-transform duration-200 group-hover:scale-[0.57]">
                        <ContactIcon type={item.icon} />
                      </span>
                    </motion.a>
                  ))}
                </div>
              </div>

              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {footerColumns.map((column) => (
                  <div key={column.title}>
                    <h4 className="text-2xl font-semibold tracking-tight text-white">{column.title}</h4>
                    <ul className="mt-4 space-y-3">
                      {column.links.map((item) => (
                        <li key={item.label}>
                          <Link
                            href={item.href}
                            className="text-[1.05rem] text-[rgba(167,185,216,0.86)] transition-colors hover:text-white"
                          >
                            {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-10 border-t border-[rgba(122,154,205,0.22)] pt-6 text-sm text-[rgba(151,172,206,0.8)] dark:border-[rgba(120,130,150,0.24)] dark:text-[rgba(150,160,178,0.82)]">
              © {new Date().getFullYear()} Priyank Patil · Designed for thoughtful, high-leverage analytics work.
            </div>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
