import type { Attachment, AttachmentKind } from "../providers/types";

export interface IncomingAttachment {
  id?: string;
  name: string;
  mime?: string;
  /** raw file payload; omitted for attachments replayed from conversation history */
  base64?: string;
  /** text already extracted on a previous turn */
  text?: string;
  kind?: AttachmentKind;
  size?: number;
}

const TEXT_EXTENSIONS = /\.(txt|md|markdown|csv|tsv|json|jsonl|log|xml|html|htm|yml|yaml|ts|tsx|js|jsx|py|sql|ini|cfg|env)$/i;
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|bmp|heic|heif|avif)$/i;

export const MAX_TEXT_CHARS = 200_000;
export const MAX_PDF_PAGES = 60;

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function decodeText(base64: string, maxChars: number = MAX_TEXT_CHARS): string {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(base64ToBytes(base64)).slice(0, maxChars);
  } catch {
    return "";
  }
}

export function classifyAttachment(name: string, mime: string): AttachmentKind {
  const lower = name.toLowerCase();
  if (mime.startsWith("image/") || IMAGE_EXTENSIONS.test(lower)) return "image";
  if (mime === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("text/") || TEXT_EXTENSIONS.test(lower)) return "text";
  return "text";
}

/** Extracts selectable text from a PDF. Returns "" for scans, encrypted or malformed files. */
export async function pdfToText(
  bytes: Uint8Array,
  options: { maxPages?: number; maxChars?: number } = {},
): Promise<string> {
  const maxPages = options.maxPages ?? MAX_PDF_PAGES;
  const maxChars = options.maxChars ?? MAX_TEXT_CHARS;
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: bytes, verbosity: 0, isEvalSupported: false }).promise;
    const pages = Math.min(doc.numPages, maxPages);
    const chunks: string[] = [];
    let total = 0;
    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => item.str ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) {
        chunks.push(text);
        total += text.length;
      }
      if (total >= maxChars) break;
    }
    return chunks.join("\n\n").slice(0, maxChars);
  } catch {
    return "";
  }
}

export async function extractAttachment(input: IncomingAttachment): Promise<Attachment> {
  const mime = input.mime || "application/octet-stream";
  const id = input.id ?? crypto.randomUUID();

  // Replayed from history: text and metadata are already known, no payload travels again.
  if (!input.base64) {
    return {
      id,
      kind: input.kind ?? classifyAttachment(input.name, mime),
      name: input.name,
      mime,
      size: input.size ?? 0,
      text: input.text ?? "",
    };
  }

  const kind = classifyAttachment(input.name, mime);
  const bytes = base64ToBytes(input.base64);
  const size = input.size ?? bytes.byteLength;

  if (kind === "image") {
    return { id, kind, name: input.name, mime, size, data: input.base64 };
  }
  if (kind === "pdf") {
    const text = await pdfToText(bytes);
    return { id, kind, name: input.name, mime, size, data: input.base64, text };
  }
  const text = decodeText(input.base64);
  const printable = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return {
    id,
    kind: "text",
    name: input.name,
    mime,
    size,
    text: printable
      ? text
      : `(binary or unsupported file "${input.name}" - only the file name is available; ask the user to paste the relevant text)`,
  };
}

export async function extractAll(inputs: IncomingAttachment[]): Promise<Attachment[]> {
  return Promise.all(inputs.map((input) => extractAttachment(input)));
}
