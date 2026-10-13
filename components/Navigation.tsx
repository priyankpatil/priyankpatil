"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

const homeSections = [
  { id: "intro", label: "Intro" },
  { id: "skills", label: "Skills" },
  { id: "experience", label: "Experience" },
  { id: "projects", label: "Projects" },
  { id: "capabilities", label: "Capabilities" },
  { id: "writing", label: "Writing" },
  { id: "contact", label: "Contact" },
];

function scrollToSection(id: string) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

export default function Navigation() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [activeSection, setActiveSection] = useState(homeSections[0].id);

  useEffect(() => {
    if (!isHome) return;

    const root = document.querySelector("main.page-scroll");
    const targets = homeSections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => element !== null);

    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let next: string | null = null;
        let bestRatio = 0;

        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= bestRatio) {
            bestRatio = entry.intersectionRatio;
            next = (entry.target as HTMLElement).id;
          }
        }

        if (next) {
          setActiveSection(next);
        }
      },
      {
        root: root instanceof Element ? root : null,
        threshold: [0.2, 0.45, 0.65, 0.85],
        rootMargin: "-18% 0px -36% 0px",
      },
    );

    for (const target of targets) observer.observe(target);

    return () => observer.disconnect();
  }, [isHome]);

  const activeLabel = useMemo(() => {
    if (!isHome) {
      if (pathname.startsWith("/projects")) return "Projects";
      if (pathname.startsWith("/experience")) return "Experience";
      if (pathname.startsWith("/writing")) return "Writing";
      if (pathname.startsWith("/contact")) return "Contact";
      return "Portfolio";
    }

    return homeSections.find((section) => section.id === activeSection)?.label ?? "Intro";
  }, [activeSection, isHome, pathname]);

  return (
    <header className="site-header">
      <div className="shell flex h-16 items-center justify-between gap-4">
        <Link href="/" className="text-sm font-semibold tracking-[0.14em] uppercase text-text">
          Priyank Patil
        </Link>

        {isHome ? (
          <nav className="hidden items-center gap-2 lg:flex" aria-label="Journey sections">
            {homeSections.map((section) => {
              const active = section.id === activeSection;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => scrollToSection(section.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${active ? "border-accent bg-accent-soft text-text" : "border-border bg-transparent text-muted"}`}
                >
                  {section.label}
                </button>
              );
            })}
          </nav>
        ) : (
          <Link
            href="/"
            className="hidden rounded-full border px-3 py-1.5 text-xs font-medium md:inline-flex border-border bg-surface text-muted"
          >
            Back to hero
          </Link>
        )}

        <div className="flex items-center gap-2">
          <span className="hidden text-xs tracking-[0.16em] uppercase md:inline text-soft">
            {activeLabel}
          </span>
          <ThemeToggle />
        </div>
      </div>

      {isHome && (
        <nav className="shell flex gap-2 overflow-x-auto pb-3 lg:hidden" aria-label="Journey sections mobile">
          {homeSections.map((section) => {
            const active = section.id === activeSection;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => scrollToSection(section.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${active ? "border-accent bg-accent-soft text-text" : "border-border bg-surface text-muted"}`}
              >
                {section.label}
              </button>
            );
          })}
        </nav>
      )}
    </header>
  );
}
