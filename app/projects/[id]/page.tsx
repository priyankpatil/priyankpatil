import Link from "next/link";
import { notFound } from "next/navigation";
import Navigation from "@/components/Navigation";
import ArchDiagram from "@/components/ArchDiagram";
import GenAIArticle from "@/components/project-articles/GenAIArticle";
import { projectItems } from "@/lib/portfolio-data";
import { projectWriteups } from "@/lib/project-writeups";

export function generateStaticParams() {
  return projectItems.map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = projectItems.find((p) => p.id === id);
  const writeup = projectWriteups.find((w) => w.id === id);

  if (!project || !writeup) {
    return { title: "Not Found" };
  }

  return {
    title: `${project.title} — Priyank Patil`,
    description: writeup.tagline,
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
          <Link
            href="/projects"
            style={{
              color: "var(--soft)",
              fontSize: "0.85rem",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            ← All projects
          </Link>
        </div>

        {/* Hero */}
        <div className="shell mb-16">
          <p className="kicker mb-3">
            {project.org} · {project.year}
          </p>
          <h1
            style={{
              fontSize: "clamp(2rem, 5vw, 3.5rem)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: "var(--text)",
              margin: "0 0 1rem 0",
              lineHeight: 1.05,
            }}
          >
            {project.title}
          </h1>
          <p className="body-lg" style={{ maxWidth: "640px", marginBottom: "1.5rem" }}>
            {writeup.tagline}
          </p>

          {/* Tags */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: project.demoUrl ? "1.5rem" : "0",
            }}
          >
            {project.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  borderRadius: "999px",
                  border: "1px solid var(--border)",
                  padding: "4px 12px",
                  fontSize: "0.75rem",
                  color: "var(--muted)",
                  background: "var(--surface-muted)",
                }}
              >
                {tag}
              </span>
            ))}
          </div>

          {project.demoUrl && (
            <Link href={project.demoUrl} className="pill-link primary" style={{ marginTop: "0.75rem" }}>
              Try the live demo →
            </Link>
          )}
        </div>

        {/* Divider */}
        <div className="shell mb-16">
          <div style={{ height: "1px", background: "var(--border)" }} />
        </div>

        {id === "genai-analytics-agent" ? (
          /* ── Long-form article for the GenAI project ── */
          <div className="shell">
            <GenAIArticle />
          </div>
        ) : (
          <>
            {/* Content grid — two column on desktop */}
            <div
              className="shell"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 560px), 1fr))",
                gap: "4rem 6rem",
              }}
            >
              {/* Problem */}
              <div>
                <p className="kicker mb-4">The Problem</p>
                <p style={{ fontSize: "1rem", lineHeight: 1.8, color: "var(--muted)" }}>{writeup.problem}</p>
              </div>

              {/* Reflection */}
              <div>
                <p className="kicker mb-4">Reflection</p>
                <p
                  style={{
                    fontSize: "1rem",
                    lineHeight: 1.8,
                    color: "var(--muted)",
                    fontStyle: "italic",
                  }}
                >
                  &ldquo;{writeup.reflection}&rdquo;
                </p>
              </div>
            </div>

            {/* Approach — full width */}
            <div className="shell mt-16">
              <p className="kicker mb-8">Approach</p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "1.5rem",
                }}
              >
                {writeup.approach.map((section, i) => (
                  <div key={i} className="panel" style={{ padding: "1.75rem" }}>
                    <span className="kicker" style={{ marginBottom: "0.75rem", display: "block" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3
                      style={{
                        fontSize: "1.05rem",
                        fontWeight: 700,
                        color: "var(--text)",
                        margin: "0 0 0.75rem 0",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {section.title}
                    </h3>
                    <p
                      style={{
                        fontSize: "0.9rem",
                        lineHeight: 1.75,
                        color: "var(--muted)",
                        margin: 0,
                      }}
                    >
                      {section.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Architecture */}
            <div className="shell mt-16">
              <p className="kicker mb-6">Architecture</p>
              <div className="panel" style={{ padding: "2rem" }}>
                <ArchDiagram nodes={writeup.architectureNodes} />
                <p
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--soft)",
                    marginTop: "1.25rem",
                    textAlign: "center",
                    fontStyle: "italic",
                  }}
                >
                  {writeup.architectureCaption}
                </p>
              </div>
            </div>

            {/* Outcomes */}
            <div className="shell mt-16">
              <p className="kicker mb-6">Impact</p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: "1rem",
                }}
              >
                {writeup.outcomes.map((outcome, i) => (
                  <div key={i} className="panel" style={{ padding: "1.5rem", textAlign: "center" }}>
                    <div
                      style={{
                        fontSize: "clamp(1.5rem, 3vw, 2rem)",
                        fontWeight: 800,
                        color: "var(--accent)",
                        letterSpacing: "-0.03em",
                        lineHeight: 1,
                      }}
                    >
                      {outcome.value}
                    </div>
                    <div
                      style={{
                        fontSize: "0.78rem",
                        color: "var(--soft)",
                        marginTop: "0.5rem",
                        lineHeight: 1.4,
                      }}
                    >
                      {outcome.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Footer nav */}
        <div
          className="shell mt-16 pt-8"
          style={{
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
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
