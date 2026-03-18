// Server-side PDF generation — pdfkit with built-in fonts (no embedding) + zlib
// compression. Typical output: 10–30 KB for a full legal document.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs   from "fs";
// pdfkit ships as CJS; dynamic require avoids Next.js ESM conflict
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit") as new (opts: Record<string, unknown>) => PDFKit.PDFDocument;

interface GenerateBody {
  text:          string;
  hash:          string;
  contract_type: string;
  contract_id:   string;
}

// 1.5 cm = 1.5 × (72 / 2.54) ≈ 42.5 pt
const MARGIN_H = 42.5;
// Accent green matching the AiStaff logo
const GREEN = "#16a34a";
const GREY  = "#6b7280";
const DARK  = "#111827";
const RULE  = "#e5e7eb";

function isHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length < 3) return false;
  if (t === t.toUpperCase() && /[A-Z]/.test(t) && t.length > 3) return true;
  if (/^\d+(\.\d+)?\s+[A-Z]/.test(t)) return true;
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

  // Load logo from public/ — process.cwd() is apps/web/ at runtime
  const logoPath = path.join(process.cwd(), "public", "logo.png");
  const logoData = fs.existsSync(logoPath) ? fs.readFileSync(logoPath) : null;

  const contractTitle = body.contract_type.replace(/_/g, " ");
  const shortId       = body.contract_id.slice(0, 8).toUpperCase();
  const dateStr       = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return new Promise<NextResponse>((resolve, reject) => {
    const doc = new PDFDocument({
      compress:    true,
      size:        "A4",
      margins:     { top: 110, bottom: 60, left: MARGIN_H, right: MARGIN_H },
      bufferPages: true,
      info: {
        Title:   contractTitle.toUpperCase(),
        Author:  "AiStaff Legal Toolkit",
        Creator: "AiStaff",
        Subject: `Contract ${body.contract_id}`,
      },
    });

    const W = doc.page.width; // 595.28 pt

    // ── Header (drawn on every page) ──────────────────────────────────────────
    function drawHeader() {
      const H = 90; // header height

      // White background (default) — just draw the logo + text

      // Logo — 64×64 pt, left-aligned at MARGIN_H
      if (logoData) {
        doc.image(logoData, MARGIN_H, 10, { height: 70 });
      }

      // Company name to the right of the logo (or fallback if no logo)
      const textX = logoData ? MARGIN_H + 80 : MARGIN_H;

      doc.font("Helvetica-Bold")
         .fontSize(20)
         .fillColor(DARK)
         .text("AiStaff", textX, 22, { lineBreak: false });

      doc.font("Helvetica")
         .fontSize(8)
         .fillColor(GREEN)
         .text("FUTURE WORKFORCE", textX, 47, { lineBreak: false });

      // Right-aligned meta block
      doc.font("Helvetica")
         .fontSize(7.5)
         .fillColor(GREY)
         .text(`Date: ${dateStr}`, 0, 22, {
           width:     W - MARGIN_H,
           align:     "right",
           lineBreak: false,
         });

      doc.font("Helvetica")
         .fontSize(7.5)
         .fillColor(GREY)
         .text(`Document ID: ${shortId}`, 0, 35, {
           width:     W - MARGIN_H,
           align:     "right",
           lineBreak: false,
         });

      // Bottom rule — green, full width between margins
      doc.rect(MARGIN_H, H - 4, W - MARGIN_H * 2, 1.5).fill(GREEN);
    }

    drawHeader();
    doc.on("pageAdded", drawHeader);

    // ── Subject block (formal letter style) ───────────────────────────────────
    doc.moveDown(0.8);

    doc.font("Helvetica")
       .fontSize(8)
       .fillColor(GREY)
       .text("SUBJECT", { characterSpacing: 1.5 });

    doc.moveDown(0.2);

    doc.font("Helvetica-Bold")
       .fontSize(13)
       .fillColor(DARK)
       .text(contractTitle.toUpperCase());

    doc.moveDown(0.5);

    // Thin green underline under subject
    doc.rect(MARGIN_H, doc.y, 48, 2).fill(GREEN);
    doc.moveDown(1.0);

    // ── Body — section-aware rendering ────────────────────────────────────────
    const lines = body.text.split("\n");

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();

      if (!line.trim()) {
        doc.moveDown(0.35);
        continue;
      }

      if (isHeading(line)) {
        doc.moveDown(0.7);

        // Grey rule before each section heading
        doc.rect(MARGIN_H, doc.y, W - MARGIN_H * 2, 0.5).fill(RULE);
        doc.moveDown(0.3);

        doc.font("Helvetica-Bold")
           .fontSize(9.5)
           .fillColor(DARK)
           .text(line.trim(), { lineGap: 1.5 });

        doc.moveDown(0.2);
      } else {
        doc.font("Helvetica")
           .fontSize(9)
           .fillColor("#374151")
           .text(line.trim(), {
             lineGap:   2.2,
             align:     "justify",
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
      const fy    = pageH - 42;

      // Separator rule
      doc.rect(MARGIN_H, fy, W - MARGIN_H * 2, 0.5).fill(RULE);

      // Hash
      const hashShort = `SHA-256: ${body.hash.slice(0, 36)}…`;
      doc.font("Helvetica")
         .fontSize(6)
         .fillColor(GREY)
         .text(hashShort, MARGIN_H, fy + 6, { lineBreak: false });

      // Page N / M
      doc.font("Helvetica")
         .fontSize(7)
         .fillColor(GREY)
         .text(`Page ${i + 1} of ${total}`, 0, fy + 6, {
           width:     W - MARGIN_H,
           align:     "right",
           lineBreak: false,
         });

      // Branding
      doc.font("Helvetica")
         .fontSize(6)
         .fillColor(GREEN)
         .text("aistaff.app · Legal Toolkit", MARGIN_H, fy + 18, { lineBreak: false });
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
