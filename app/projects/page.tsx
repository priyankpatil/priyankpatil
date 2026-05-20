import Link from "next/link";
import Navigation from "@/components/Navigation";
import ProjectImpactChart from "@/components/ProjectImpactChart";
import { projectItems } from "@/lib/portfolio-data";

export const metadata = {
  title: "Projects",
  description: "Selected analytics and platform programs delivered by Priyank Patil.",
};

export default function ProjectsPage() {
  return (
    <>
      <Navigation />
      <main className="page-scroll">
        <section className="scroll-chapter">
          <div className="shell grid gap-8 lg:grid-cols-[1fr_1.25fr] lg:items-end">
            <div>
              <p className="kicker mb-4">Project Archive</p>
              <h1 className="heading-lg font-semibold">High-impact analytics programs, end-to-end.</h1>
              <p className="body-lg mt-5">
                Each initiative below combines product framing, data modeling, and technical execution. The chart reflects
                directional performance signals from repeated delivery patterns.
              </p>
              <p className="mt-8 text-xs uppercase tracking-[0.2em]" style={{ color: "var(--soft)" }}>
                Click any project to read the full case study
              </p>
            </div>
            <ProjectImpactChart />
          </div>
        </section>

        <section className="shell grid gap-4 pb-16">
          {projectItems.map((project, index) => (
            <Link key={project.id} href={`/projects/${project.id}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
              <article className="panel p-6 md:p-7" style={{ cursor: "pointer" }}>
                <div className="grid gap-4 md:grid-cols-[auto_1fr_auto] md:items-start">
                  <span className="kicker">{String(index + 1).padStart(2, "0")}</span>

                  <div>
                    <p className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--soft)" }}>
                      {project.org} · {project.year}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
                      {project.title}
                    </h2>
                    <p className="mt-4 text-sm leading-7" style={{ color: "var(--muted)" }}>
                      {project.summary}
                    </p>
                    <p className="mt-4 text-sm leading-7 font-medium" style={{ color: "var(--text)" }}>
                      {project.outcome}
                    </p>
                  </div>

                  <div className="flex flex-col items-start gap-3 md:items-end">
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      {project.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border px-3 py-1 text-xs"
                          style={{ borderColor: "var(--border)", color: "var(--muted)", background: "var(--surface-muted)" }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    {project.demoUrl && (
                      <span className="pill-link primary text-xs">
                        Try it
                      </span>
                    )}
                  </div>
                </div>
              </article>
            </Link>
          ))}

          <div className="panel p-6 md:p-8">
            <p className="kicker mb-3">Next</p>
            <h3 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              Want to see how these programs map to role progression?
            </h3>
            <div className="mt-6">
              <Link href="/experience" className="pill-link primary">
                Explore experience timeline
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
