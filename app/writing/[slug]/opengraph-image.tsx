import { ogSize, renderOgImage } from "@/lib/og";
import { getAllArticles, getArticleBySlug } from "@/lib/writing";

export const alt = "Article by Priyank Patil";
export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return getAllArticles().map((article) => ({ slug: article.slug }));
}

export default async function ArticleOgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  return renderOgImage({
    eyebrow: `${article.tag || "Writing"} · ${article.readingTime}`,
    title: article.title,
    subtitle: article.excerpt,
  });
}
