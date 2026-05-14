import Link from "next/link";
import Navigation from "@/components/Navigation";
import { formatDate, getAllArticles } from "@/lib/writing";

export const metadata = {
  title: "Writing",
  description: "Thoughts on analytics strategy, decision systems, and data product execution.",
};

export default function WritingPage() {
  const articles = getAllArticles();

  return (
    <>
      <Navigation />
      <main className="page-pad">
        <div className="shell section-stack">
          <section className="max-w-3xl">
            <p className="kicker mb-4">Writing</p>
            <h1 className="heading-lg font-semibold">Notes on analytics strategy, systems, and execution.</h1>
            <p className="body-lg mt-5">
              Essays from real delivery contexts: what worked, what failed, and what changed behavior.
            </p>
          </section>

          <section>
            {articles.length === 0 ? (
              <div className="panel p-6">
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  No published essays yet.
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {articles.map((article) => (
                  <Link key={article.slug} href={`/writing/${article.slug}`} className="panel block p-6 md:p-7">
                    <p className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--soft)" }}>
                      {article.tag} · {article.readingTime}
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
                      {article.title}
                    </h2>
                    <p className="mt-3 text-sm leading-7" style={{ color: "var(--muted)" }}>
                      {article.excerpt}
                    </p>
                    <p className="mt-4 text-xs" style={{ color: "var(--soft)" }}>
                      {formatDate(article.date)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
