import type { ChatMessage, ChainEntry, ChatRequest, ProviderAdapter } from "./types";
import { jsonFromSseData, sseDataLines } from "./sse";

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}
interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export function geminiParts(m: ChatMessage): GeminiPart[] {
  const parts: GeminiPart[] = [];
  if (m.content) parts.push({ text: m.content });
  for (const a of m.attachments ?? []) {
    if (a.kind === "image" && a.data) {
      parts.push({ inlineData: { mimeType: a.mime || "image/png", data: a.data } });
    } else if (a.kind === "pdf" && !a.text && a.data) {
      // Gemini reads PDFs natively - used when local text extraction found nothing (scans).
      parts.push({ inlineData: { mimeType: a.mime || "application/pdf", data: a.data } });
    } else {
      parts.push({ text: `[Attached file: ${a.name} (${a.mime})]\n${a.text ?? "(no extractable text)"}` });
    }
  }
  if (parts.length === 0) parts.push({ text: "" });
  return parts;
}

export function geminiBody(entry: ChainEntry, req: ChatRequest) {
  const system = req.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const contents: GeminiContent[] = [];
  for (const msg of req.messages) {
    if (msg.role === "system") continue;
    const role: "user" | "model" = msg.role === "assistant" ? "model" : "user";
    const parts = geminiParts(msg);
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  }
  if (contents.length === 0) contents.push({ role: "user", parts: [{ text: "" }] });
  return {
    contents,
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    generationConfig: {
      temperature: req.temperature ?? 0.7,
      ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
    },
  };
}

export const geminiAdapter: ProviderAdapter = {
  id: "gemini",
  url: (entry: ChainEntry) =>
    `${entry.endpoint.replace(/\/$/, "")}/models/${encodeURIComponent(entry.model)}:streamGenerateContent?alt=sse`,
  init: (entry: ChainEntry, req: ChatRequest): RequestInit => ({
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": entry.apiKey,
    },
    body: JSON.stringify(geminiBody(entry, req)),
    signal: req.signal,
  }),
  body: geminiBody,
  async *parse(stream: ReadableStream<Uint8Array>) {
    for await (const data of sseDataLines(stream)) {
      const payload = jsonFromSseData<{
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      }>(data);
      if (!payload) continue;
      const parts = payload.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p) => p.text ?? "").join("");
      if (text.length > 0) yield text;
    }
  },
};
