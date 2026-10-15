"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import ExperienceSignalChart from "@/components/ExperienceSignalChart";
import ProjectImpactChart from "@/components/ProjectImpactChart";
import SkillsPulseChart from "@/components/SkillsPulseChart";
import { CountryFlag, countryFlags } from "@/components/home/CountryFlag";
import SiteFooter from "@/components/home/SiteFooter";
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
              className="font-display font-black leading-[0.84] tracking-[-0.05em] text-[clamp(3.6rem,12vw,10.2rem)] text-text"
            >
              PRIYANK
              <br />
              PATIL
            </motion.h1>
            <p className="body-lg mt-7 max-w-2xl">
              Senior product &amp; analytics leader turning complex data into clear business direction, durable
              operating decisions, and measurable impact.
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
              className="relative mt-7 w-full max-w-[620px] rounded-2xl border px-4 py-3 shadow-none backdrop-blur-sm md:px-5 md:py-4 border-border-strong bg-[color-mix(in_srgb,var(--surface)_86%,transparent)]"
            >
              <p className="kicker mb-2">Snapshot</p>
              <div className="grid grid-cols-4">
                {heroStats.map((stat, index) => (
                  <motion.div
                    key={stat.label}
                    className={`px-3 py-1 ${index === 0 ? "" : "border-l border-l-border-strong"}`}
                    whileHover={{ y: -2 }}
                  >
                    <p className="text-[2rem] leading-none font-semibold tracking-tight text-text">
                      {stat.value}
                    </p>
                    <p className="mt-1 text-[0.62rem] uppercase tracking-[0.14em] leading-tight text-soft">
                      {stat.label}
                    </p>
                  </motion.div>
                ))}
                <motion.div
                  className="flex items-center justify-center px-3 py-1 border-l border-l-border-strong"
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
                  <h3 className="text-xl font-semibold tracking-tight text-text">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted">
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
              I lead data teams that drive product strategy and connect analytics to business outcomes. Across Amazon, Clarke, and Mercedes, I&apos;ve shipped AI analytics tools, modernized data platforms, and built self-serve systems used by stakeholders across the business.
            </p>

            <div className="mt-6 grid gap-3">
              {experienceItems.slice(0, 4).map((item) => (
                <motion.div
                  key={`${item.company}-${item.role}`}
                  className="rounded-2xl border p-4 border-border bg-surface"
                  initial={{ opacity: 0, x: -14 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.35 }}
                  transition={{ duration: 0.5 }}
                >
                  <p className="text-xs uppercase tracking-[0.16em] text-soft">
                    {item.period}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-text">
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
                  className="rounded-2xl border p-4 border-border bg-surface"
                >
                  <p className="text-xs uppercase tracking-[0.16em] text-soft">
                    {project.org} · {project.year}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold tracking-tight text-text">
                    {project.title}
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-muted">
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
                <h3 className="text-xl font-semibold tracking-tight text-text">
                  {area.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-muted">
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
                <p className="text-sm text-muted">
                  New essays coming soon.
                </p>
              </div>
            ) : (
              articles.map((article) => (
                <Link key={article.slug} href={`/writing/${article.slug}`} className="card-link">
                  <p className="text-xs uppercase tracking-[0.16em] text-soft">
                    {article.tag} · {article.readingTime}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight text-text">
                    {article.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-muted">
                    {article.excerpt}
                  </p>
                  <p className="mt-4 text-xs text-soft">
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

      <SiteFooter />
    </main>
  );
}
