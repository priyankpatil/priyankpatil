import { siteDescription, siteName, siteUrl } from "@/lib/site";
import { getAllArticles } from "@/lib/writing";

export const dynamic = "force-static";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822(date: string): string | null {
  const parsed = Date.parse(date);
  return Number.isNaN(parsed) ? null : new Date(parsed).toUTCString();
}

export function GET() {
  const articles = getAllArticles();

  const items = articles
    .map((article) => {
      const url = `${siteUrl}/writing/${article.slug}`;
      const pubDate = toRfc822(article.date);
      return [
        "    <item>",
        `      <title>${escapeXml(article.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        `      <description>${escapeXml(article.excerpt)}</description>`,
        article.tag ? `      <category>${escapeXml(article.tag)}</category>` : null,
        pubDate ? `      <pubDate>${pubDate}</pubDate>` : null,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`${siteName} — Writing`)}</title>
    <link>${siteUrl}/writing</link>
    <description>${escapeXml(siteDescription)}</description>
    <language>en-us</language>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
