"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="h-9 w-9 rounded-full border" style={{ borderColor: "var(--border)" }} />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
      className="h-9 w-9 rounded-full border text-sm"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
        color: "var(--text)",
      }}
    >
      {isDark ? "☀" : "◐"}
    </button>
  );
}
