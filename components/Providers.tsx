"use client";

import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "@/components/ThemeProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      {/* "user" follows the OS prefers-reduced-motion setting: transform animations
          are skipped while opacity fades are kept. */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </ThemeProvider>
  );
}
