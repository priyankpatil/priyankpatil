import { ogSize, renderOgImage } from "@/lib/og";
import { projectItems } from "@/lib/portfolio-data";
import { projectWriteups } from "@/lib/project-writeups";

export const alt = "Project case study by Priyank Patil";
export const size = ogSize;
export const contentType = "image/png";

export function generateStaticParams() {
  return projectItems.map((p) => ({ id: p.id }));
}

export default async function ProjectOgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = projectItems.find((p) => p.id === id);
  const writeup = projectWriteups.find((w) => w.id === id);
  return renderOgImage({
    eyebrow: project ? `Case study · ${project.org} · ${project.year}` : "Case study",
    title: project?.title ?? "Project",
    subtitle: writeup?.tagline,
  });
}
