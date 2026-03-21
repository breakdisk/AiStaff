/**
 * Root opengraph-image.tsx
 * Next.js auto-serves this at /opengraph-image with Content-Type: image/png.
 * Automatically registered as og:image in all pages that don't override it.
 */
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt     = "AiStaff — AI Agent, Talent & Robotics Marketplace";
export const size    = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width:          "100%",
          height:         "100%",
          display:        "flex",
          flexDirection:  "column",
          justifyContent: "center",
          padding:        "52px 64px",
          background:     "#09090b",
          position:       "relative",
        }}
      >
        {/* Amber left accent bar */}
        <div
          style={{
            position:     "absolute",
            left:          0,
            top:           60,
            bottom:        60,
            width:          4,
            background:    "#fbbf24",
            borderRadius:  "0 2px 2px 0",
          }}
        />

        {/* Platform label */}
        <div
          style={{
            display:      "flex",
            fontSize:      13,
            color:         "#71717a",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            marginBottom:  32,
            fontFamily:    "monospace",
          }}
        >
          AiStaff · AI-Native Marketplace
        </div>

        {/* Main headline */}
        <div
          style={{
            display:      "flex",
            fontSize:      56,
            fontWeight:    700,
            color:         "#fafafa",
            marginBottom:  24,
            lineHeight:    1.15,
            fontFamily:    "monospace",
          }}
        >
          AI Agent, Talent &amp; Robotics
        </div>

        {/* Subheading */}
        <div
          style={{
            display:     "flex",
            fontSize:     22,
            color:        "#a1a1aa",
            lineHeight:   1.6,
            maxWidth:     900,
            fontFamily:   "monospace",
          }}
        >
          Deploy AI agents · Hire vetted engineers · Rent AI robotics — all escrow-backed with ZK biometric identity.
        </div>

        {/* Domain watermark */}
        <div
          style={{
            position:   "absolute",
            bottom:     44,
            right:      64,
            fontSize:   14,
            color:      "#fbbf24",
            fontFamily: "monospace",
          }}
        >
          aistaffglobal.com
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
