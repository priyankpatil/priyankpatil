import Link from "next/link";
import Navigation from "@/components/Navigation";
import ExperienceSignalChart from "@/components/ExperienceSignalChart";
import { experienceItems } from "@/lib/portfolio-data";

export const metadata = {
  title: "Experience",
  description: "Career timeline and capability evolution across Amazon, Clarke Power, and Mercedes.",
};

export default function ExperiencePage() {
  return (
    <>
      <Navigation />
      <main className="page-scroll">
        <section className="scroll-chapter">
          <div className="shell grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-end">
            <div>
              <p className="kicker mb-4">Career Timeline</p>
              <h1 className="heading-lg font-semibold">Building durable decision systems across 13 years.</h1>
              <p className="body-lg mt-5">
                I have worked across product analytics, platform migrations, and operational transformation. The work has
                evolved, but the principle is constant: improve decision quality through better data foundations.
              </p>
              <p className="mt-8 text-xs uppercase tracking-[0.2em]" style={{ color: "var(--soft)" }}>
                Scroll for timeline chapters
              </p>
            </div>
            <ExperienceSignalChart />
          </div>
        </section>

        <section className="scroll-chapter top">
          <div className="shell grid gap-4">
            {experienceItems.slice(0, 3).map((item) => (
              <article key={`${item.company}-${item.role}`} className="panel p-6 md:p-7">
                <div className="grid gap-4 md:grid-cols-[1fr_1fr] md:items-start">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--soft)" }}>
                      {item.period}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
                      {item.company}
                    </h2>
                    <p className="mt-1 text-sm font-medium" style={{ color: "var(--muted)" }}>
                      {item.role}
                    </p>
                  </div>

                  <p className="text-sm leading-7" style={{ color: "var(--muted)" }}>
                    {item.focus}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="scroll-chapter top">
          <div className="shell chapter-stack">
            <div className="grid gap-4">
              {experienceItems.slice(3).map((item) => (
                <article key={`${item.company}-${item.role}`} className="panel p-6 md:p-7">
                  <div className="grid gap-4 md:grid-cols-[1fr_1fr] md:items-start">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--soft)" }}>
                        {item.period}
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
                        {item.company}
                      </h2>
                      <p className="mt-1 text-sm font-medium" style={{ color: "var(--muted)" }}>
                        {item.role}
                      </p>
                    </div>

                    <p className="text-sm leading-7" style={{ color: "var(--muted)" }}>
                      {item.focus}
                    </p>
                  </div>
                </article>
              ))}
            </div>

            <div className="panel p-6 md:p-8">
              <p className="kicker mb-3">Next</p>
              <h3 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
                Continue to writing for detailed reasoning behind these delivery decisions.
              </h3>
              <div className="mt-6 flex gap-3">
                <Link href="/writing" className="pill-link primary">
                  Read essays
                </Link>
                <Link href="/contact" className="pill-link">
                  Contact
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
