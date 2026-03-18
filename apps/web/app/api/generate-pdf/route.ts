// Server-side PDF generation — pdfkit + sharp for image downscaling.
// Logo JPEG downscaled 2528→600px at request time → ~25 KB embedded image.
// Total typical output: 40–55 KB.
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs   from "fs";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit") as new (opts: Record<string, unknown>) => PDFKit.PDFDocument;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require("sharp") as typeof import("sharp");

interface GenerateBody {
  text:          string;
  hash:          string;
  contract_type: string;
  contract_id:   string;
}

// 1.5 cm = 42.52 pt
const ML      = 42.52;
const MR      = 42.52;
const HEADER  = 82;
const TOP     = HEADER + 14;
const FOOTER  = 44;
// Exact background colour sampled from logo-brand.png.jpg pixel (5,5)
const BANNER  = "#3a4147";
const GREEN   = "#16a34a";
const GREY    = "#9ca3af";
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

// ── Pre-load + downscale logo once at module init ───────────────────────────
// Resized to 600 px wide (from 2528 px) at JPEG q=82 → ~25 KB
let _logoCache: Buffer | null | false = false; // false = uninitialised

async function getLogoBuffer(): Promise<Buffer | null> {
  if (_logoCache !== false) return _logoCache;
  for (const name of ["logo-brand.png.jpg", "logo.png"]) {
    const p = path.join(process.cwd(), "public", name);
    if (fs.existsSync(p)) {
      try {
        _logoCache = await sharp(p).resize(600).jpeg({ quality: 82 }).toBuffer();
        return _logoCache;
      } catch { /* fall through */ }
    }
  }
  _logoCache = null;
  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: GenerateBody;
  try { body = await req.json() as GenerateBody; }
  catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }
  if (!body.text) return NextResponse.json({ error: "text is required" }, { status: 400 });

  const logoData = await getLogoBuffer();

  const contractTitle = body.contract_type.replace(/_/g, " ");
  const shortId       = body.contract_id.slice(0, 8).toUpperCase();
  const dateStr       = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return new Promise<NextResponse>((resolve, reject) => {
    const doc = new PDFDocument({
      compress: true,
      size:     "A4",
      margins:  { top: TOP, bottom: FOOTER + 8, left: ML, right: MR },
      info: {
        Title:   contractTitle.toUpperCase(),
        Author:  "AiStaff Legal Toolkit",
        Creator: "AiStaff",
        Subject: `Contract ${body.contract_id}`,
      },
    });

    const W       = doc.page.width;
    const H       = doc.page.height;
    const CONTENT = W - ML - MR;
    const BOTTOM  = H - FOOTER - 10;

    let pageNum = 1;

    // ── Header ───────────────────────────────────────────────────────────────
    function drawHeader() {
      doc.save();

      // Full-width banner in the exact logo background colour → perfect match
      doc.rect(0, 0, W, HEADER).fill(BANNER);

      if (logoData) {
        // Aspect ratio 2528:1696 ≈ 1.491 (same after resize)
        const lH = HEADER - 6;
        const lW = lH * (2528 / 1696);
        // x = ML aligns logo with text; background already matches
        doc.image(logoData, ML, 3, { width: lW, height: lH });
      } else {
        // Vector fallback
        doc.font("Helvetica-Bold").fontSize(18).fillColor("#ffffff")
           .text("AiStaff", ML, 20, { lineBreak: false });
        doc.font("Helvetica").fontSize(8).fillColor(GREEN)
           .text("FUTURE WORKFORCE", ML, 42, { lineBreak: false });
      }

      // Date / Document ID — right-aligned, white on dark banner
      doc.font("Helvetica").fontSize(7.5).fillColor("#ffffff")
         .text(`Date: ${dateStr}`, ML, 22, {
           width: CONTENT, align: "right", lineBreak: false,
         });
      doc.font("Helvetica").fontSize(7.5).fillColor("#a3e6b8")
         .text(`Document ID: ${shortId}`, ML, 36, {
           width: CONTENT, align: "right", lineBreak: false,
         });

      // Green separator rule
      doc.rect(0, HEADER, W, 2).fill(GREEN);

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
         .text(`SHA-256: ${body.hash.slice(0, 40)}…`, ML, fy + 6, { lineBreak: false });
      doc.font("Helvetica").fontSize(7).fillColor(GREY)
         .text(`Page ${pageNum}`, ML, fy + 6, {
           width: CONTENT, align: "right", lineBreak: false,
         });
      doc.font("Helvetica").fontSize(6).fillColor(GREEN)
         .text("aistaff.app · Legal Toolkit", ML, fy + 18, { lineBreak: false });
      doc.restore();
    }

    drawHeader();
    doc.on("pageAdded", () => { pageNum++; drawHeader(); });

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

    const uW = 52;
    doc.rect(ML + (CONTENT - uW) / 2, doc.y + 1, uW, 2).fill(GREEN);
    doc.y += 16;

    // ── Body ─────────────────────────────────────────────────────────────────
    for (const rawLine of body.text.split("\n")) {
      const line = rawLine.trimEnd();
      if (!line.trim()) { doc.y += 4; continue; }

      if (doc.y + (isHeading(line) ? 22 : 14) > BOTTOM) {
        drawFooter();
        doc.addPage();
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

    drawFooter();

    // ── Respond ───────────────────────────────────────────────────────────────
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
