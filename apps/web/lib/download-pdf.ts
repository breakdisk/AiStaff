/**
 * Downloads a contract as a server-generated PDF.
 * Calls /api/generate-pdf which uses pdfkit (server-side, no font embedding,
 * zlib-compressed) — typical output 5–20 KB for a full legal document.
 */
export async function downloadContractPdf(
  text:         string,
  hash:         string,
  contractType: string,
  contractId:   string,
): Promise<void> {
  const res = await fetch("/api/generate-pdf", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      text,
      hash,
      contract_type: contractType,
      contract_id:   contractId,
    }),
  });

  if (!res.ok) throw new Error("PDF generation failed");

  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${contractType}-${contractId.slice(0, 8)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
