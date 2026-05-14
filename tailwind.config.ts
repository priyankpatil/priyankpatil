import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        display: [
          "var(--font-sans)",
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "monospace"],
      },
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-muted": "var(--surface-muted)",
        text: "var(--text)",
        muted: "var(--muted)",
        soft: "var(--soft)",
        accent: "var(--accent)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
      },
      typography: {
        DEFAULT: {
          css: {
            color: "var(--muted)",
            maxWidth: "none",
            "--tw-prose-headings": "var(--text)",
            "--tw-prose-links": "var(--accent)",
            "--tw-prose-bold": "var(--text)",
            "--tw-prose-bullets": "var(--soft)",
            "--tw-prose-hr": "var(--border)",
            a: {
              textDecoration: "underline",
              textUnderlineOffset: "4px",
            },
            "h1,h2,h3,h4": {
              fontFamily: "var(--font-sans)",
              fontWeight: "680",
              letterSpacing: "-0.02em",
            },
            code: { color: "var(--accent)", fontWeight: "560" },
            "code::before": { content: '""' },
            "code::after": { content: '""' },
            blockquote: {
              color: "var(--muted)",
              borderLeftColor: "var(--accent)",
            },
          },
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
