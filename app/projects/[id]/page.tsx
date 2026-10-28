import Link from "next/link";
import { notFound } from "next/navigation";
import Navigation from "@/components/Navigation";
import { ArchFigure } from "@/components/ArchDiagram";
import GenAIArticle from "@/components/project-articles/GenAIArticle";
import { projectItems } from "@/lib/portfolio-data";
import { projectWriteups } from "@/lib/project-writeups";

export function generateStaticParams() {
  // Dedicated project routes generate their own HTML/RSC. Generating the same
  // paths here can overwrite those pages with a generic case study at build time.
  const dedicatedRoutes = new Set(["wiki-stream", "cx-eval"]);
  return projectItems.filter((p) => !dedicatedRoutes.has(p.id)).map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = projectItems.find((p) => p.id === id);
  const writeup = projectWriteups.find((w) => w.id === id);

  if (!project || !writeup) {
    return { title: "Not Found" };
  }

  const url = `/projects/${id}`;
  return {
    title: project.title,
    description: writeup.tagline,
    alternates: { canonical: url },
    openGraph: { type: "article", title: project.title, description: writeup.tagline, url },
    twitter: { card: "summary_large_image", title: project.title, description: writeup.tagline },
  };
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const project = projectItems.find((p) => p.id === id);
  const writeup = projectWriteups.find((w) => w.id === id);

  if (!project || !writeup) notFound();

  return (
    <>
      <Navigation />
      <main className="page-pad">
        {/* Back link */}
        <div className="shell mb-8">
          <Link href="/projects" className="inline-flex items-center gap-1.5 text-[0.85rem] text-soft no-underline">
            ← All projects
          </Link>
        </div>

        {/* Hero */}
        <div className="shell mb-16">
          <p className="kicker mb-3">
            {project.org} · {project.year}
          </p>
          <h1 className="mb-4 text-[clamp(2rem,5vw,3.5rem)] font-bold leading-[1.05] tracking-[-0.03em] text-text">
            {project.title}
          </h1>
          <p className="body-lg mb-6 max-w-[640px]">{writeup.tagline}</p>

          {/* Tags */}
          <div className={`flex flex-wrap gap-2 ${project.demoUrl ? "mb-6" : ""}`}>
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border bg-surface-muted px-3 py-1 text-[0.75rem] text-muted"
              >
                {tag}
              </span>
            ))}
          </div>

          {project.demoUrl && (
            <Link href={project.demoUrl} className="pill-link primary mt-3">
              Try the live demo →
            </Link>
          )}
        </div>

        {/* Divider */}
        <div className="shell mb-16">
          <div className="h-px bg-border" />
        </div>

        {id === "genai-analytics-agent" ? (
          /* ── Long-form article for the GenAI project ── */
          <div className="shell">
            <GenAIArticle />
          </div>
        ) : (
          <>
            {/* Content grid — two column on desktop */}
            <div className="shell grid grid-cols-[repeat(auto-fit,minmax(min(100%,560px),1fr))] gap-x-24 gap-y-16">
              {/* Problem */}
              <div>
                <p className="kicker mb-4">The Problem</p>
                <p className="text-base leading-[1.8] text-muted">{writeup.problem}</p>
              </div>

              {/* Reflection */}
              <div>
                <p className="kicker mb-4">Reflection</p>
                <p className="text-base italic leading-[1.8] text-muted">&ldquo;{writeup.reflection}&rdquo;</p>
              </div>
            </div>

            {/* Approach — full width */}
            <div className="shell mt-16">
              <p className="kicker mb-8">Approach</p>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6">
                {writeup.approach.map((section, i) => (
                  <div key={i} className="panel p-7">
                    <span className="kicker mb-3 block">{String(i + 1).padStart(2, "0")}</span>
                    <h3 className="mb-3 text-[1.05rem] font-bold tracking-[-0.01em] text-text">{section.title}</h3>
                    <p className="text-[0.9rem] leading-[1.75] text-muted">{section.body}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Architecture */}
            <div className="shell mt-16">
              <p className="kicker mb-6">Architecture</p>
              <ArchFigure nodes={writeup.architectureNodes}>{writeup.architectureCaption}</ArchFigure>
            </div>

            {/* Outcomes */}
            <div className="shell mt-16">
              <p className="kicker mb-6">Impact</p>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
                {writeup.outcomes.map((outcome, i) => (
                  <div key={i} className="panel p-6 text-center">
                    <div className="text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-none tracking-[-0.03em] text-accent">
                      {outcome.value}
                    </div>
                    <div className="mt-2 text-[0.78rem] leading-[1.4] text-soft">{outcome.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Footer nav */}
        <div className="shell mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-8">
          <Link href="/projects" className="pill-link">
            ← Back to projects
          </Link>
          <Link href="/experience" className="pill-link primary">
            Explore experience →
          </Link>
        </div>
      </main>
    </>
  );
}
