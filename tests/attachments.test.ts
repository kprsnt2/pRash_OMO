import { describe, expect, test } from "bun:test";
import { base64ToBytes, classifyAttachment, decodeText, extractAttachment, pdfToText } from "../lib/attachments/extract";

const b64 = (text: string) => Buffer.from(text, "utf-8").toString("base64");

/** Builds a real, minimal, uncompressed one-page PDF containing the words "Hello PDF". */
function buildMinimalPdf(): Uint8Array {
  const content = "BT /F1 12 Tf 20 100 Td (Hello PDF) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

describe("attachment extraction", () => {
  test("base64ToBytes round-trips bytes", () => {
    const bytes = base64ToBytes(Buffer.from([0, 1, 2, 250]).toString("base64"));
    expect(Array.from(bytes)).toEqual([0, 1, 2, 250]);
  });

  test("decodeText returns utf-8 content", () => {
    expect(decodeText(b64("hello world"))).toBe("hello world");
  });

  test("classifyAttachment detects image, pdf and text", () => {
    expect(classifyAttachment("photo.PNG", "image/png")).toBe("image");
    expect(classifyAttachment("report.pdf", "application/pdf")).toBe("pdf");
    expect(classifyAttachment("marks.csv", "text/csv")).toBe("text");
    expect(classifyAttachment("mystery", "application/octet-stream")).toBe("text");
  });

  test("image attachments keep their payload as base64 and carry no text", async () => {
    const png = Buffer.from("89504e470d0a1a0a", "hex").toString("base64");
    const attachment = await extractAttachment({ name: "kid-drawing.png", mime: "image/png", base64: png });
    expect(attachment.kind).toBe("image");
    expect(attachment.data).toBe(png);
    expect(attachment.text).toBeUndefined();
    expect(attachment.size).toBe(8);
  });

  test("text attachments are decoded", async () => {
    const attachment = await extractAttachment({ name: "marks.csv", mime: "text/csv", base64: b64("name,score\nasha,9") });
    expect(attachment.kind).toBe("text");
    expect(attachment.text).toContain("asha,9");
  });

  test("pdfToText extracts real text from a real PDF", async () => {
    const text = await pdfToText(buildMinimalPdf());
    expect(text).toContain("Hello PDF");
  }, 30000);

  test("pdf attachments keep payload so a native-pdf model can read scans", async () => {
    const attachment = await extractAttachment({
      name: "prescription.pdf",
      mime: "application/pdf",
      base64: Buffer.from(buildMinimalPdf()).toString("base64"),
    });
    expect(attachment.kind).toBe("pdf");
    expect(attachment.text).toContain("Hello PDF");
    expect(attachment.data).toBeTruthy();
  }, 30000);

  test("replayed history attachments skip the payload and keep the text", async () => {
    const attachment = await extractAttachment({ name: "marks.csv", mime: "text/csv", text: "cached text", size: 11 });
    expect(attachment.text).toBe("cached text");
    expect(attachment.data).toBeUndefined();
  });

  test("unknown binary formats never throw and describe the file", async () => {
    const attachment = await extractAttachment({
      name: "thing.xlsx",
      mime: "application/vnd.ms-excel",
      base64: Buffer.from([0, 1, 0, 2, 0, 3]).toString("base64"),
    });
    expect(attachment.kind).toBe("text");
    expect(attachment.text).toContain("thing.xlsx");
  });
  test("pdfToText returns empty string for garbage instead of throwing", async () => {
    const text = await pdfToText(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(text).toBe("");
  }, 30000);
});
