// Server-side PDF generation — pdfkit with built-in fonts (no embedding) + zlib
// compression. Typical output: 10–30 KB for a full legal document.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
// pdfkit ships as CJS; dynamic require avoids Next.js ESM conflict
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit") as new (opts: Record<string, unknown>) => PDFKit.PDFDocument;

interface GenerateBody {
  text:          string;
  hash:          string;
  contract_type: string;
  contract_id:   string;
}

// ── Colour palette (matches brand) ────────────────────────────────────────────
const C = {
  bg:       "#09090b",   // zinc-950
  surface:  "#18181b",   // zinc-900
  border:   "#27272a",   // zinc-800
  amber:    "#fbbf24",   // amber-400
  amberDim: "#92400e",   // amber-800
  white:    "#fafafa",   // zinc-50
  muted:    "#a1a1aa",   // zinc-400
  body:     "#1c1c1e",   // near-black body text
  heading:  "#09090b",   // section headings
  rule:     "#e4e4e7",   // zinc-200 horizontal rules
};

// Detect whether a line should be rendered as a section heading
function isHeading(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  // Fully uppercase line (e.g. "TERMS AND CONDITIONS")
  if (t === t.toUpperCase() && t.length > 3 && /[A-Z]/.test(t)) return true;
  // Numbered section (e.g. "1. PARTIES" or "1.1 Definitions")
  if (/^\d+(\.\d+)?\s+[A-Z]/.test(t)) return true;
  // ARTICLE / SECTION keyword
  if (/^(ARTICLE|SECTION|CLAUSE|SCHEDULE|EXHIBIT)\s+/i.test(t)) return true;
  return false;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: GenerateBody;
  try {
    body = await req.json() as GenerateBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const contractTitle = body.contract_type.replace(/_/g, " ").toUpperCase();
  const shortId       = body.contract_id.slice(0, 8).toUpperCase();
  const dateStr       = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return new Promise<NextResponse>((resolve, reject) => {
    const doc = new PDFDocument({
      compress:    true,
      size:        "A4",
      margins:     { top: 100, bottom: 60, left: 60, right: 60 },
      bufferPages: true,
      info: {
        Title:   contractTitle,
        Author:  "AiStaff Legal Toolkit",
        Creator: "AiStaff",
        Subject: `Contract ${body.contract_id}`,
      },
    });

    const W = doc.page.width;   // 595.28

    // ────────────────────────────────────────────────────────────────────────────
    // HEADER  (drawn on every page via a helper we'll call at page-add events)
    // ────────────────────────────────────────────────────────────────────────────
    function drawHeader() {
      const H = 72;

      // Dark background band
      doc.rect(0, 0, W, H).fill(C.bg);

      // Amber accent bar on the left edge
      doc.rect(0, 0, 4, H).fill(C.amber);

      // ── Logo mark — stylised "A" in an amber rounded square ─────────────────
      const lx = 20;
      const ly = 14;
      const lw = 44;
      const lh = 44;

      // Outer amber square
      doc.roundedRect(lx, ly, lw, lh, 4).fill(C.amber);

      // Inner dark "AS" monogram
      doc.font("Helvetica-Bold")
         .fontSize(18)
         .fillColor(C.bg)
         .text("AS", lx, ly + 12, {
           width:  lw,
           align:  "center",
           lineBreak: false,
         });

      // ── Brand name ────────────────────────────────────────────────────────────
      const tx = lx + lw + 12;
      doc.font("Helvetica-Bold")
         .fontSize(18)
         .fillColor(C.white)
         .text("AiStaff", tx, ly + 4, { lineBreak: false });

      doc.font("Helvetica")
         .fontSize(8.5)
         .fillColor(C.amber)
         .text("Legal Toolkit", tx, ly + 27, { lineBreak: false });

      // ── Right-side contract meta ───────────────────────────────────────────
      doc.font("Helvetica")
         .fontSize(7.5)
         .fillColor(C.muted)
         .text(`ID: ${shortId}`, 0, ly + 4, {
           width:     W - 20,
           align:     "right",
           lineBreak: false,
         });

      doc.font("Helvetica")
         .fontSize(7.5)
         .fillColor(C.muted)
         .text(dateStr, 0, ly + 17, {
           width:     W - 20,
           align:     "right",
           lineBreak: false,
         });

      // Amber bottom rule of header
      doc.rect(0, H, W, 1.5).fill(C.amber);
    }

    // Draw header on first page
    drawHeader();

    // Re-draw header on every subsequent page
    doc.on("pageAdded", drawHeader);

    // ── Contract title block ──────────────────────────────────────────────────
    doc.moveDown(1.2);

    doc.font("Helvetica-Bold")
       .fontSize(15)
       .fillColor(C.heading)
       .text(contractTitle, { align: "center" });

    doc.moveDown(0.4);

    // Thin amber underline under title
    const titleY = doc.y;
    const lineW  = 60;
    doc.rect((W - lineW) / 2, titleY, lineW, 2).fill(C.amber);

    doc.moveDown(1.2);

    // ── Body — section-aware rendering ────────────────────────────────────────
    const lines = body.text.split("\n");

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();

      if (!line.trim()) {
        // Blank line → small vertical gap
        doc.moveDown(0.4);
        continue;
      }

      if (isHeading(line)) {
        // Extra space before a new section
        doc.moveDown(0.6);

        // Light grey rule above each heading
        doc.rect(60, doc.y, W - 120, 0.5).fill(C.rule);
        doc.moveDown(0.35);

        doc.font("Helvetica-Bold")
           .fontSize(9.5)
           .fillColor(C.heading)
           .text(line.trim(), { lineGap: 1.5 });

        doc.moveDown(0.25);
      } else {
        doc.font("Helvetica")
           .fontSize(9)
           .fillColor(C.body)
           .text(line.trim(), {
             lineGap:   2,
             align:     "left",
             continued: false,
           });
      }
    }

    // ── Footer on every page ──────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    const total = range.count;

    for (let i = 0; i < total; i++) {
      doc.switchToPage(i);
      const pageH = doc.page.height;

      // Separator rule
      doc.rect(60, pageH - 46, W - 120, 0.5).fill(C.rule);

      // Hash (truncated to fit)
      const hashDisplay = `SHA-256: ${body.hash.slice(0, 40)}…`;
      doc.font("Helvetica")
         .fontSize(6)
         .fillColor(C.muted)
         .text(hashDisplay, 60, pageH - 38, { lineBreak: false });

      // Page number (right-aligned)
      doc.font("Helvetica")
         .fontSize(7)
         .fillColor(C.muted)
         .text(`${i + 1} / ${total}`, 0, pageH - 38, {
           width:     W - 20,
           align:     "right",
           lineBreak: false,
         });

      // "AiStaff Legal Toolkit" branding in footer
      doc.font("Helvetica")
         .fontSize(6)
         .fillColor(C.amberDim)
         .text("AiStaff Legal Toolkit — aistaff.app", 60, pageH - 26, {
           lineBreak: false,
         });
    }

    // ── Stream → buffer → response ────────────────────────────────────────────
    const chunks: Buffer[] = [];
    doc.on("data",  (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end",   () => {
      const pdf  = Buffer.concat(chunks);
      const name = `${body.contract_type}-${body.contract_id.slice(0, 8)}.pdf`;
      resolve(
        new NextResponse(pdf, {
          headers: {
            "Content-Type":        "application/pdf",
            "Content-Disposition": `attachment; filename="${name}"`,
            "Content-Length":      String(pdf.length),
            "Cache-Control":       "no-store",
          },
        }),
      );
    });

    doc.flushPages();
    doc.end();
  });
}
