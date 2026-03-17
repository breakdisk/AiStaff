/**
 * GET /api/og?name=…&price=…&desc=…
 *
 * Generates a 1200×630 text-only OG card image for marketplace listings.
 * No product photo — only styled text on the AiStaff dark background.
 * Used as og:image so Facebook / LinkedIn / Twitter show a rich preview
 * that includes the listing name, price, and short description.
 */

import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const name  = (searchParams.get("name")  ?? "AI Agent").slice(0, 80);
  const price = (searchParams.get("price") ?? "$0");
  const desc  = (searchParams.get("desc")  ?? "").slice(0, 130);

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
          background:     "#09090b",   // zinc-950
          position:       "relative",
        }}
      >
        {/* Platform label */}
        <div
          style={{
            display:       "flex",
            fontSize:       13,
            color:          "#71717a",   // zinc-500
            textTransform:  "uppercase",
            letterSpacing:  "0.12em",
            marginBottom:   32,
            fontFamily:     "monospace",
          }}
        >
          AiStaff · Marketplace
        </div>

        {/* Price — amber, prominent */}
        <div
          style={{
            display:      "flex",
            fontSize:      34,
            fontWeight:    700,
            color:         "#fbbf24",   // amber-400
            marginBottom:  20,
            fontFamily:    "monospace",
          }}
        >
          {price} escrow
        </div>

        {/* Listing name */}
        <div
          style={{
            display:      "flex",
            fontSize:      52,
            fontWeight:    700,
            color:         "#fafafa",   // zinc-50
            marginBottom:  28,
            lineHeight:    1.15,
            fontFamily:    "monospace",
          }}
        >
          {name}
        </div>

        {/* Short description */}
        {desc && (
          <div
            style={{
              display:    "flex",
              fontSize:    20,
              color:       "#a1a1aa",   // zinc-400
              lineHeight:  1.6,
              maxWidth:    960,
              fontFamily:  "monospace",
            }}
          >
            {desc}
          </div>
        )}

        {/* Domain watermark — bottom right */}
        <div
          style={{
            position:  "absolute",
            bottom:    44,
            right:     64,
            fontSize:  14,
            color:     "#3f3f46",   // zinc-700
            fontFamily: "monospace",
          }}
        >
          aistaffglobal.com
        </div>

        {/* Amber left accent bar */}
        <div
          style={{
            position:     "absolute",
            left:          0,
            top:           60,
            bottom:        60,
            width:          4,
            background:    "#fbbf24",  // amber-400
            borderRadius:  "0 2px 2px 0",
          }}
        />
      </div>
    ),
    {
      width:  1200,
      height: 630,
    },
  );
}
