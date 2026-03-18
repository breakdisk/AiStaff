// Server-side PDF generation — pdfkit built-in fonts + zlib compression.
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
const ML      = 42.52;
const MR      = 42.52;
const HEADER  = 84;           // header height
const TOP     = HEADER + 14;  // content start y
const FOOTER  = 46;           // footer height reserved at bottom
const GREEN   = "#16a34a";
const GREY    = "#6b7280";
const DARK    = "#111827";
const RULE    = "#d1d5db";

function isHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length < 3) return false;
  if (t === t.toUpperCase() && /[A-Z]/.test(t)) return true;
  if (/^\d+(\.\d+)?\s+[A-Z]/.test(t)) return true;
  if (/^(ARTICLE|SECTION|CLAUSE|SCHEDULE|EXHIBIT)\s+/i.test(t)) return true;
  return false;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: GenerateBody;
  try { body = await req.json() as GenerateBody; }
  catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  if (!body.text) return NextResponse.json({ error: "text is required" }, { status: 400 });

  // Load logo — prefer branded JPEG, fall back to transparent PNG
  let logoData: Buffer | null = null;
  for (const name of ["logo-brand.png.jpg", "logo.png"]) {
    const p = path.join(process.cwd(), "public", name);
    if (fs.existsSync(p)) { logoData = fs.readFileSync(p); break; }
  }

  const contractTitle = body.contract_type.replace(/_/g, " ");
  const shortId       = body.contract_id.slice(0, 8).toUpperCase();
  const dateStr       = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return new Promise<NextResponse>((resolve, reject) => {
    // No bufferPages — eliminates the spurious blank second page.
    // Footer is drawn inline before each page break and after last line.
    const doc = new PDFDocument({
      compress: true,
      size:     "A4",
      margins:  { top: TOP, bottom: FOOTER + 10, left: ML, right: MR },
      info: {
        Title:   contractTitle.toUpperCase(),
        Author:  "AiStaff Legal Toolkit",
        Creator: "AiStaff",
        Subject: `Contract ${body.contract_id}`,
      },
    });

    const W       = doc.page.width;    // 595.28 pt
    const H       = doc.page.height;   // 841.89 pt
    const CONTENT = W - ML - MR;
    const BOTTOM  = H - FOOTER - 10;  // last y before footer reserve

    let pageNum = 1;

    // ── Header — white background, logo at left margin ──────────────────────
    function drawHeader() {
      doc.save();

      if (logoData) {
        // Logo at x=ML (aligned with text), fitted by height
        // Aspect ratio 2528:1696 ≈ 1.491
        const lH = HEADER - 8;
        const lW = lH * (2528 / 1696);
        doc.image(logoData, ML, 4, { width: lW, height: lH });
      } else {
        doc.font("Helvetica-Bold").fontSize(18).fillColor(DARK)
           .text("AiStaff", ML, 20, { lineBreak: false });
        doc.font("Helvetica").fontSize(8).fillColor(GREEN)
           .text("FUTURE WORKFORCE", ML, 42, { lineBreak: false });
      }

      // Date + Document ID — right-aligned in dark text on white
      doc.font("Helvetica").fontSize(7.5).fillColor(GREY)
         .text(`Date: ${dateStr}`, ML, 24, {
           width: CONTENT, align: "right", lineBreak: false,
         });
      doc.font("Helvetica").fontSize(7.5).fillColor(GREY)
         .text(`Document ID: ${shortId}`, ML, 38, {
           width: CONTENT, align: "right", lineBreak: false,
         });

      // Green separator rule
      doc.rect(ML, HEADER, CONTENT, 1.5).fill(GREEN);

      doc.restore();
      doc.x = ML;
      doc.y = TOP;
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    function drawFooter() {
      const fy = H - FOOTER + 2;
      doc.save();
      doc.rect(ML, fy, CONTENT, 0.5).fill(RULE);
      doc.font("Helvetica").fontSize(6).fillColor(GREY)
         .text(`SHA-256: ${body.hash.slice(0, 38)}…`, ML, fy + 6, { lineBreak: false });
      doc.font("Helvetica").fontSize(7).fillColor(GREY)
         .text(`Page ${pageNum}`, ML, fy + 6, {
           width: CONTENT, align: "right", lineBreak: false,
         });
      doc.font("Helvetica").fontSize(6).fillColor(GREEN)
         .text("aistaff.app · Legal Toolkit", ML, fy + 18, { lineBreak: false });
      doc.restore();
    }

    // Draw on first page
    drawHeader();

    // On every new page: draw header; caller draws footer before addPage()
    doc.on("pageAdded", () => {
      pageNum++;
      drawHeader();
    });

    // ── Contract title — centered ────────────────────────────────────────────
    doc.font("Helvetica").fontSize(7.5).fillColor(GREY)
       .text("SUBJECT", ML, doc.y, {
         width: CONTENT, align: "center", characterSpacing: 2, lineBreak: false,
       });
    doc.y += 13;

    doc.font("Helvetica-Bold").fontSize(14).fillColor(DARK)
       .text(contractTitle.toUpperCase(), ML, doc.y, {
         width: CONTENT, align: "center",
       });

    // Green underline centered under title
    const uW = 52;
    doc.rect(ML + (CONTENT - uW) / 2, doc.y + 1, uW, 2).fill(GREEN);
    doc.y += 16;

    // ── Body — section-aware, with manual page-break guard ───────────────────
    for (const rawLine of body.text.split("\n")) {
      const line = rawLine.trimEnd();

      if (!line.trim()) {
        doc.y += 4;
        continue;
      }

      // Page break guard — draw footer on this page then start a new one
      const estimatedH = isHeading(line) ? 22 : 14;
      if (doc.y + estimatedH > BOTTOM) {
        drawFooter();
        doc.addPage();
        // drawHeader() fires via pageAdded event
      }

      if (isHeading(line)) {
        doc.y += 8;
        doc.rect(ML, doc.y, CONTENT, 0.5).fill(RULE);
        doc.y += 4;
        doc.font("Helvetica-Bold").fontSize(9.5).fillColor(DARK)
           .text(line.trim(), ML, doc.y, { width: CONTENT, lineGap: 1 });
        doc.y += 3;
      } else {
        doc.font("Helvetica").fontSize(9).fillColor("#374151")
           .text(line.trim(), ML, doc.y, {
             width: CONTENT, align: "justify", lineGap: 2,
           });
      }
    }

    // Draw footer on the last (or only) page
    drawFooter();

    // ── Stream → buffer → response ───────────────────────────────────────────
    const chunks: Buffer[] = [];
    doc.on("data",  (c: Buffer) => chunks.push(c));
    doc.on("error", reject);
    doc.on("end", () => {
      const pdf  = Buffer.concat(chunks);
      const name = `${body.contract_type}-${body.contract_id.slice(0, 8)}.pdf`;
      resolve(new NextResponse(pdf, {
        headers: {
          "Content-Type":        "application/pdf",
          "Content-Disposition": `attachment; filename="${name}"`,
          "Content-Length":      String(pdf.length),
          "Cache-Control":       "no-store",
        },
      }));
    });

    doc.end();
  });
}
