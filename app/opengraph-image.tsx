import { ImageResponse } from "next/og";
import { siteDescription, siteName } from "@/lib/site";

export const alt = siteName;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
        <div style={{ fontSize: 24, letterSpacing: "0.3em", textTransform: "uppercase", color: "#9eabc2" }}>
          Analytics · Data Platforms · AI
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 112, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1 }}>{siteName}</div>
          <div style={{ marginTop: 28, fontSize: 34, lineHeight: 1.35, color: "#cfdaec", maxWidth: 940 }}>
            {siteDescription}
          </div>
        </div>
        <div style={{ width: 120, height: 6, borderRadius: 3, background: "#4ea0ff" }} />
      </div>
    ),
    size
  );
}
