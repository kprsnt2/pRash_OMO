export interface PickedFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  base64: string;
  kind: "image" | "pdf" | "text";
  previewUrl?: string;
}

export function classify(name: string, mime: string): PickedFile["kind"] {
  const lower = name.toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic|bmp)$/.test(lower)) return "image";
  if (mime === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  return "text";
}

function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

export async function readPickedFile(file: File): Promise<PickedFile> {
  const base64 = await toBase64(file);
  const kind = classify(file.name, file.type || "");
  return {
    id: crypto.randomUUID(),
    name: file.name,
    mime: file.type || (kind === "pdf" ? "application/pdf" : "text/plain"),
    size: file.size,
    base64,
    kind,
    previewUrl: kind === "image" ? URL.createObjectURL(file) : undefined,
  };
}

export async function readPickedFiles(files: FileList | File[]): Promise<PickedFile[]> {
  const list = Array.from(files);
  return Promise.all(list.map((f) => readPickedFile(f)));
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const TOTAL_ATTACHMENT_BYTES = 60 * 1024 * 1024;

export function attachmentsBudget(files: PickedFile[]): { ok: boolean; total: number } {
  const total = files.reduce((sum, f) => sum + f.size, 0);
  return { ok: total <= TOTAL_ATTACHMENT_BYTES, total };
}
