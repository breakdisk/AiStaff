// Server-side PDF generation — pdfkit with built-in fonts + zlib compression.
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

// 1.5 cm = 1.5 × (72 / 2.54) = 42.52 pt
const ML     = 42.52;   // left margin
const MR     = 42.52;   // right margin
const HEADER = 88;      // header band height (pt)
const TOP    = HEADER + 16; // content starts just below header

const GREEN  = "#16a34a";
const GREY   = "#6b7280";
const DARK   = "#111827";
const RULE   = "#d1d5db";

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
      // Top margin = HEADER height so content never overlaps the header band
      margins:     { top: TOP, bottom: 64, left: ML, right: MR },
      bufferPages: true,
      info: {
        Title:   contractTitle.toUpperCase(),
        Author:  "AiStaff Legal Toolkit",
        Creator: "AiStaff",
        Subject: `Contract ${body.contract_id}`,
      },
    });

    const W       = doc.page.width;           // 595.28 pt  (A4)
    const CONTENT = W - ML - MR;             // usable width between margins

    // ── Header — drawn at absolute coords so it never moves the text cursor ──
    function drawHeader() {
      // White background (A4 default) — draw green bottom rule only
      doc.save();

      // Logo — 64 pt tall, positioned at left margin
      if (logoData) {
        doc.image(logoData, ML, 10, { height: 64 });
      }

      // "AiStaff" wordmark — to the right of the logo
      const tx = ML + (logoData ? 72 : 0);
      doc.font("Helvetica-Bold").fontSize(20).fillColor(DARK)
         .text("AiStaff", tx, 20, { lineBreak: false });
      doc.font("Helvetica").fontSize(8).fillColor(GREEN)
         .text("FUTURE WORKFORCE", tx, 44, { lineBreak: false });

      // Date + document ID — right-aligned, pinned to right margin
      doc.font("Helvetica").fontSize(7.5).fillColor(GREY)
         .text(`Date: ${dateStr}`, ML, 20, {
           width: CONTENT, align: "right", lineBreak: false,
         });
      doc.font("Helvetica").fontSize(7.5).fillColor(GREY)
         .text(`Document ID: ${shortId}`, ML, 34, {
           width: CONTENT, align: "right", lineBreak: false,
         });

      // Green separator rule at base of header
      doc.rect(ML, HEADER - 2, CONTENT, 1.5).fill(GREEN);

      doc.restore();

      // ── CRITICAL: reset text cursor to content start after header drawing ──
      doc.x = ML;
      doc.y = TOP;
    }

    drawHeader();
    doc.on("pageAdded", drawHeader);

    // ── Contract title — centered ────────────────────────────────────────────
    doc.font("Helvetica").fontSize(8).fillColor(GREY)
       .text("SUBJECT", ML, doc.y, {
         width: CONTENT, align: "center", characterSpacing: 2, lineBreak: false,
       });

    doc.y += 14;

    doc.font("Helvetica-Bold").fontSize(15).fillColor(DARK)
       .text(contractTitle.toUpperCase(), ML, doc.y, {
         width: CONTENT, align: "center",
       });

    // Green underline — centered
    const uW  = 56;
    const uX  = ML + (CONTENT - uW) / 2;
    doc.rect(uX, doc.y + 2, uW, 2).fill(GREEN);

    doc.y += 18;   // space after title block

    // ── Body — section-aware ────────────────────────────────────────────────
    for (const rawLine of body.text.split("\n")) {
      const line = rawLine.trimEnd();

      if (!line.trim()) {
        doc.y += 5;
        continue;
      }

      if (isHeading(line)) {
        doc.y += 10;
        doc.rect(ML, doc.y, CONTENT, 0.5).fill(RULE);
        doc.y += 5;
        doc.font("Helvetica-Bold").fontSize(9.5).fillColor(DARK)
           .text(line.trim(), ML, doc.y, { width: CONTENT, lineGap: 1.5 });
        doc.y += 4;
      } else {
        doc.font("Helvetica").fontSize(9).fillColor("#374151")
           .text(line.trim(), ML, doc.y, {
             width:  CONTENT,
             align:  "justify",
             lineGap: 2,
           });
      }
    }

    // ── Footer on every page ─────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    const total = range.count;

    for (let i = 0; i < total; i++) {
      doc.switchToPage(range.start + i);
      const pH = doc.page.height;
      const fy = pH - 46;

      doc.rect(ML, fy, CONTENT, 0.5).fill(RULE);

      const hashShort = `SHA-256: ${body.hash.slice(0, 40)}…`;
      doc.font("Helvetica").fontSize(6).fillColor(GREY)
         .text(hashShort, ML, fy + 6, { lineBreak: false });

      doc.font("Helvetica").fontSize(7).fillColor(GREY)
         .text(`Page ${i + 1} of ${total}`, ML, fy + 6, {
           width: CONTENT, align: "right", lineBreak: false,
         });

      doc.font("Helvetica").fontSize(6).fillColor(GREEN)
         .text("aistaff.app · Legal Toolkit", ML, fy + 18, { lineBreak: false });
    }

    // Return cursor to last content page so doc.end() doesn't add a blank page
    doc.switchToPage(range.start + total - 1);

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
