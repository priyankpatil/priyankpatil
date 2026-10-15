import { ogSize, renderOgImage } from "@/lib/og";
import { siteDescription, siteName } from "@/lib/site";

export const alt = siteName;
export const size = ogSize;
export const contentType = "image/png";

export default function OpengraphImage() {
  return renderOgImage({ eyebrow: "Product · Analytics · AI", title: siteName, subtitle: siteDescription });
}
