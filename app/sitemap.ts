import type { MetadataRoute } from "next";
import { projectItems } from "@/lib/portfolio-data";
import { siteUrl } from "@/lib/site";
import { getAllArticles } from "@/lib/writing";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["", "/projects", "/experience", "/writing", "/contact", "/projects/nl-sql", "/projects/customer-segments"];

  return [
    ...staticRoutes.map((route) => ({
      url: `${siteUrl}${route}`,
      changeFrequency: "monthly" as const,
      priority: route === "" ? 1 : 0.7,
    })),
    ...projectItems.map((project) => ({
      url: `${siteUrl}/projects/${project.id}`,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
    ...getAllArticles().map((article) => ({
      url: `${siteUrl}/writing/${article.slug}`,
      lastModified: article.date || undefined,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
