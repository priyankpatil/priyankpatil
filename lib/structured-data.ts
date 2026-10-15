import { profileLinks, siteDescription, siteJobTitle, siteName, siteUrl } from "@/lib/site";

// schema.org JSON-LD helpers. Search engines use these to connect the site,
// LinkedIn and GitHub to the same person and to understand articles.

export const personId = `${siteUrl}/#person`;

export function siteStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": personId,
        name: siteName,
        url: siteUrl,
        image: `${siteUrl}/images/priyankpatil.jpg`,
        jobTitle: siteJobTitle,
        description: siteDescription,
        worksFor: { "@type": "Organization", name: "Amazon", url: "https://www.amazon.com" },
        knowsAbout: [
          "Product Management",
          "Product Strategy",
          "Analytics Strategy",
          "Data Platforms",
          "Data Engineering",
          "Business Intelligence",
          "Generative AI",
          "Natural Language to SQL",
        ],
        sameAs: [profileLinks.linkedin, profileLinks.github],
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: siteName,
        description: siteDescription,
        publisher: { "@id": personId },
      },
    ],
  };
}

export function articleStructuredData(article: { slug: string; title: string; excerpt: string; date: string; tag: string }) {
  const url = `${siteUrl}/writing/${article.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline: article.title,
    description: article.excerpt,
    url,
    mainEntityOfPage: url,
    image: `${url}/opengraph-image`,
    datePublished: article.date || undefined,
    keywords: article.tag || undefined,
    author: { "@type": "Person", "@id": personId, name: siteName, url: siteUrl },
    publisher: { "@id": personId },
  };
}

// Serialize for a <script type="application/ld+json"> tag; escaping "<" keeps
// content from closing the script element early.
export function toJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
