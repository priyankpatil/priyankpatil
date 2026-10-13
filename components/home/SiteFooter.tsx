"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const contactLinks = [
  {
    label: "Email",
    href: "mailto:priyank.patil3@gmail.com",
    icon: "email",
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/priyank-patil",
    icon: "linkedin",
  },
  {
    label: "GitHub",
    href: "https://github.com/priyankpatil",
    icon: "github",
  },
] as const;

const footerColumns = [
  {
    title: "Portfolio",
    links: [
      { label: "Projects", href: "/projects" },
      { label: "Experience", href: "/experience" },
      { label: "Writing", href: "/writing" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Focus Areas",
    links: [
      { label: "Analytics Strategy", href: "/experience" },
      { label: "Data Platforms", href: "/projects" },
      { label: "AI Decision Systems", href: "/projects" },
      { label: "Thought Pieces", href: "/writing" },
    ],
  },
  {
    title: "Direct",
    links: [
      { label: "Email", href: "mailto:priyank.patil3@gmail.com" },
      { label: "LinkedIn", href: "https://www.linkedin.com/in/priyank-patil" },
      { label: "GitHub", href: "https://github.com/priyankpatil" },
    ],
  },
] as const;

function ContactIcon({ type }: { type: (typeof contactLinks)[number]["icon"] }) {
  if (type === "email") {
    return (
      <svg viewBox="0 0 64 64" className="h-20 w-20" aria-hidden>
        <rect x="8" y="14" width="48" height="36" rx="8" fill="#ffffff" />
        <path d="M12 20 32 35 52 20" fill="none" stroke="#EA4335" strokeWidth="4" strokeLinecap="round" />
        <path d="M12 44V20l20 15 20-15v24" fill="none" stroke="#4285F4" strokeWidth="4" strokeLinejoin="round" />
        <path d="M12 44h40" stroke="#34A853" strokeWidth="4" strokeLinecap="round" />
        <path d="M12 20 24 29" stroke="#FBBC05" strokeWidth="4" strokeLinecap="round" />
        <path d="M52 20 40 29" stroke="#FBBC05" strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "linkedin") {
    return (
      <svg viewBox="0 0 64 64" className="h-20 w-20" aria-hidden>
        <rect x="8" y="8" width="48" height="48" rx="10" fill="#0A66C2" />
        <rect x="18" y="26" width="6" height="20" rx="2" fill="#ffffff" />
        <circle cx="21" cy="20" r="3.5" fill="#ffffff" />
        <path d="M30 46V26h6v3.1c1.4-2.1 3.9-3.7 7.9-3.7 7.1 0 8.1 5 8.1 11.4V46h-6v-8.4c0-4-.9-6.2-3.9-6.2-3.6 0-6.1 2.4-6.1 6.8V46h-6z" fill="#ffffff" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" className="h-20 w-20" aria-hidden>
      <circle cx="32" cy="32" r="24" fill="#181717" />
      <path
        d="M32 14.2c-9.9 0-18 8-18 17.9 0 7.9 5.1 14.6 12.2 17 0.9 0.2 1.2-0.4 1.2-0.9 0-0.5 0-2.1 0-4-5 1.1-6-2.1-6-2.1-0.8-2.1-2-2.6-2-2.6-1.7-1.1 0.1-1.1 0.1-1.1 1.8 0.1 2.8 1.9 2.8 1.9 1.6 2.8 4.3 2 5.3 1.5 0.2-1.2 0.6-2 1.1-2.5-4-0.5-8.2-2-8.2-8.9 0-2 0.7-3.6 1.9-4.9-0.2-0.5-0.8-2.3 0.2-4.8 0 0 1.6-0.5 5.2 1.9 1.5-0.4 3.1-0.6 4.7-0.6 1.6 0 3.2 0.2 4.7 0.6 3.6-2.4 5.2-1.9 5.2-1.9 1 2.5 0.4 4.3 0.2 4.8 1.2 1.3 1.9 2.9 1.9 4.9 0 6.9-4.2 8.4-8.2 8.9 0.6 0.5 1.2 1.6 1.2 3.2 0 2.3 0 4.2 0 4.8 0 0.5 0.3 1.1 1.2 0.9C44.9 46.7 50 40 50 32.1 50 22.2 41.9 14.2 32 14.2z"
        fill="#ffffff"
      />
    </svg>
  );
}

export default function SiteFooter() {
  return (
    <section
      id="contact"
      className="overflow-hidden bg-[var(--bg)] pt-8 pb-4 md:pt-10 md:pb-6 [scroll-snap-align:start] [scroll-snap-stop:always]"
    >
      <div className="shell w-full">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.45 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="grid gap-10 lg:grid-cols-[1.2fr_2fr]">
            <div>
              <h3 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">Contact</h3>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-[rgba(188,205,236,0.84)]">
                Reach out for product and analytics leadership, platform strategy, and AI-enabled decision systems.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                {contactLinks.map((item, index) => (
                  <motion.a
                    key={item.label}
                    href={item.href}
                    target={item.href.startsWith("http") ? "_blank" : undefined}
                    rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
                    aria-label={item.label}
                    className="group inline-flex h-14 w-14 items-center justify-center rounded-xl border bg-[rgba(3,18,44,0.86)] dark:bg-[rgba(9,15,28,0.92)] border-[rgba(136,169,220,0.26)]"
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.5 }}
                    transition={{ duration: 0.45, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="scale-[0.52] transition-transform duration-200 group-hover:scale-[0.57]">
                      <ContactIcon type={item.icon} />
                    </span>
                  </motion.a>
                ))}
              </div>
            </div>

            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {footerColumns.map((column) => (
                <div key={column.title}>
                  <h4 className="text-2xl font-semibold tracking-tight text-white">{column.title}</h4>
                  <ul className="mt-4 space-y-3">
                    {column.links.map((item) => (
                      <li key={item.label}>
                        <Link
                          href={item.href}
                          className="text-[1.05rem] text-[rgba(167,185,216,0.86)] transition-colors hover:text-white"
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 border-t border-[rgba(122,154,205,0.22)] pt-6 text-sm text-[rgba(151,172,206,0.8)] dark:border-[rgba(120,130,150,0.24)] dark:text-[rgba(150,160,178,0.82)]">
            © {new Date().getFullYear()} Priyank Patil · Designed for thoughtful, high-leverage analytics work.
          </div>
        </motion.div>
      </div>
    </section>
  );
}
