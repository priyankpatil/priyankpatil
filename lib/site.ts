// Canonical site URL used for metadata, sitemap and robots.
// Set NEXT_PUBLIC_SITE_URL to the custom domain; on Vercel the production
// domain is picked up automatically as a fallback.
function resolveSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export const siteUrl = resolveSiteUrl();

export const siteName = "Priyank Patil";

export const siteDescription =
  "Senior product & analytics leader building data products at the intersection of infrastructure, AI, and business strategy.";
