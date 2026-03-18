// Server-side PDF generation — pdfkit with built-in fonts (no embedding) + zlib
// compression. Typical output: 5–20 KB for a full legal document.
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

  return new Promise<NextResponse>((resolve, reject) => {
    const doc = new PDFDocument({
      compress:    true,          // zlib-compress all streams → minimum file size
      size:        "A4",
      margins:     { top: 54, bottom: 54, left: 60, right: 60 },
      bufferPages: true,          // needed for page-count footer
      info: {
        Title:    body.contract_type.replace(/_/g, " ").toUpperCase(),
        Author:   "AiStaff Legal Toolkit",
        Creator:  "AiStaff",
        Subject:  `Contract ${body.contract_id}`,
      },
    });

    // ── Header stripe ─────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 26).fill("#09090b");
    doc.fontSize(8)
       .fillColor("#fbbf24")
       .font("Helvetica-Bold")
       .text("AiStaff Legal Toolkit", 60, 9, { lineBreak: false });
    doc.fillColor("#1a1a1a");

    // ── Body text ────────────────────────────────────────────────────────────
    // Helvetica is a PDF built-in font — zero bytes added to file for the font
    doc.moveDown(2);
    doc.font("Helvetica")
       .fontSize(9)
       .fillColor("#1a1a1a")
       .text(body.text, {
         lineGap:      2.5,
         paragraphGap: 5,
         align:        "left",
       });

    // ── Footer on every page (page number + SHA-256 hash) ────────────────────
    const range = doc.bufferedPageRange();
    const total = range.count;
    for (let i = 0; i < total; i++) {
      doc.switchToPage(i);
      const y = doc.page.height - 36;
      doc.fontSize(6.5)
         .fillColor("#999999")
         .font("Helvetica")
         .text(`SHA-256: ${body.hash}`, 60, y, { lineBreak: false });
      doc.text(`${i + 1} / ${total}`, 60, y, {
        align:     "right",
        lineBreak: false,
        width:     doc.page.width - 120,
      });
    }

    // ── Stream → buffer → response ────────────────────────────────────────────
    const chunks: Buffer[] = [];
    doc.on("data",  (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => {
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
