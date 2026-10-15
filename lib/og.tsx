import { ImageResponse } from "next/og";
import { siteName } from "@/lib/site";

export const ogSize = { width: 1200, height: 630 };

// Shared layout for generated Open Graph images (site, articles, projects).
export function renderOgImage({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  const titleSize = title.length > 48 ? 64 : title.length > 28 ? 80 : 112;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background: "linear-gradient(155deg, #05080f 0%, #0d1522 100%)",
          color: "#f3f7ff",
        }}
      >
        <div style={{ fontSize: 24, letterSpacing: "0.3em", textTransform: "uppercase", color: "#9eabc2" }}>{eyebrow}</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: titleSize, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.05 }}>{title}</div>
          {subtitle && (
            <div style={{ marginTop: 28, fontSize: 32, lineHeight: 1.35, color: "#cfdaec", maxWidth: 980 }}>{subtitle}</div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ width: 120, height: 6, borderRadius: 3, background: "#4ea0ff" }} />
          <div style={{ fontSize: 26, color: "#9eabc2" }}>{siteName}</div>
        </div>
      </div>
    ),
    ogSize
  );
}
