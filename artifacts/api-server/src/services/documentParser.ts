import pdfParse from "pdf-parse";

export interface ParsedDocument {
  text: string;
  textLength: number;
  textPreview: string;
}

export async function parseContractPdf(buffer: Buffer): Promise<ParsedDocument> {
  let data;
  try {
    data = await pdfParse(buffer);
  } catch (err) {
    throw new Error("Failed to parse PDF — the file may be corrupted or password-protected");
  }

  const text = data.text ?? "";

  if (!text.trim()) {
    throw new Error("No readable text found in the PDF — it may be a scanned image");
  }

  return {
    text,
    textLength: text.length,
    textPreview: text.slice(0, 1000),
  };
}
