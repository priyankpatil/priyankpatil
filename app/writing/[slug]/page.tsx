import { notFound } from "next/navigation";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import Navigation from "@/components/Navigation";
import { formatDate, getAllArticles, getArticleBySlug } from "@/lib/writing";

export async function generateStaticParams() {
  return getAllArticles().map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const article = getArticleBySlug(slug);

    if (!article.published) {
      return { title: "Not Found" };
    }

    return {
      title: article.title,
      description: article.excerpt,
    };
  } catch {
    return { title: "Not Found" };
  }
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let article;

  try {
    article = getArticleBySlug(slug);
  } catch {
    notFound();
  }

  if (!article.published) notFound();

  return (
    <>
      <Navigation />
      <main className="page-pad">
        <div className="shell section-stack">
          <section className="max-w-3xl">
            <Link href="/writing" className="pill-link">
              Back to writing
            </Link>

            <p className="kicker mt-8 mb-3">{article.tag}</p>
            <h1 className="heading-lg font-semibold">{article.title}</h1>

            <p className="mt-4 text-xs uppercase tracking-[0.16em]" style={{ color: "var(--soft)" }}>
              {formatDate(article.date)} · {article.readingTime}
            </p>
          </section>

          <article className="prose prose-surface prose-sm md:prose-base lg:prose-lg max-w-none">
            <MDXRemote source={article.content} />
          </article>
        </div>
      </main>
    </>
  );
}
