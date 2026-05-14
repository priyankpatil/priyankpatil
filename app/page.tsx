import Navigation from "@/components/Navigation";
import HeroJourney from "@/components/HeroJourney";
import { formatDate, getAllArticles } from "@/lib/writing";

export default function Home() {
  const latestArticles = getAllArticles().slice(0, 2);

  return (
    <>
      <Navigation />
      <HeroJourney
        articles={latestArticles.map((article) => ({
          slug: article.slug,
          title: article.title,
          excerpt: article.excerpt,
          tag: article.tag,
          readingTime: article.readingTime,
          dateLabel: formatDate(article.date),
        }))}
      />
    </>
  );
}
