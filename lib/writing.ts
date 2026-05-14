import fs from "fs";
import path from "path";
import matter from "gray-matter";
import readingTime from "reading-time";

const contentDir = path.join(process.cwd(), "content/writing");

export interface Article {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  tag: string;
  readingTime: string;
  published: boolean;
}

export interface ArticleWithContent extends Article {
  content: string;
}

function parseArticleDate(dateStr: string): number | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split("-").map(Number);
    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      Number.isFinite(day) &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    ) {
      return Date.UTC(year, month - 1, day);
    }
  }

  const parsed = Date.parse(dateStr);
  return Number.isNaN(parsed) ? null : parsed;
}

export function getAllArticles(): Article[] {
  if (!fs.existsSync(contentDir)) return [];

  const files = fs.readdirSync(contentDir).filter((file) => file.endsWith(".mdx"));

  return files
    .map((filename) => {
      const slug = filename.replace(/\.mdx$/, "");
      const raw = fs.readFileSync(path.join(contentDir, filename), "utf-8");
      const { data, content } = matter(raw);
      const stats = readingTime(content);

      return {
        slug,
        title: data.title ?? "",
        date: data.date ?? "",
        excerpt: data.excerpt ?? "",
        tag: data.tag ?? "",
        readingTime: stats.text,
        published: data.published ?? false,
      };
    })
    .filter((article) => article.published)
    .sort((a, b) => {
      const aDate = parseArticleDate(a.date) ?? 0;
      const bDate = parseArticleDate(b.date) ?? 0;
      return bDate - aDate;
    });
}

export function getArticleBySlug(slug: string): ArticleWithContent {
  const filepath = path.join(contentDir, `${slug}.mdx`);
  const raw = fs.readFileSync(filepath, "utf-8");
  const { data, content } = matter(raw);
  const stats = readingTime(content);

  return {
    slug,
    title: data.title ?? "",
    date: data.date ?? "",
    excerpt: data.excerpt ?? "",
    tag: data.tag ?? "",
    readingTime: stats.text,
    content,
    published: data.published ?? false,
  };
}

export function formatDate(dateStr: string): string {
  const parsed = parseArticleDate(dateStr);

  if (parsed === null) {
    return dateStr;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}
