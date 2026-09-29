import type { ChatMessage, ChainEntry, ChatRequest, ProviderAdapter } from "./types";
import { jsonFromSseData, sseDataLines } from "./sse";

type EnvLike = Record<string, string | undefined>;

/**
 * OpenAI's current models reject `max_tokens` and want `max_completion_tokens`; the compatible
 * third-party servers (NVIDIA NIM, Groq) and older gateways still expect `max_tokens`.
 */
export function tokenParameter(entry: ChainEntry, env: EnvLike = process.env): "max_tokens" | "max_completion_tokens" {
  if (entry.provider !== "openai") return "max_tokens";
  return env.OPENAI_TOKEN_PARAM === "max_tokens" ? "max_tokens" : "max_completion_tokens";
}

/** Reasoning models accept only the default temperature, so an agent's value is dropped for them. */
export function temperatureFor(entry: ChainEntry, req: ChatRequest): number | undefined {
  if (entry.provider === "openai" && /^(gpt-5|o[1-9])/i.test(entry.model)) return undefined;
  return req.temperature ?? 0.7;
}

function fileNote(name: string, mime: string, text: string): string {
  return `\n\n[Attached file: ${name} (${mime})]\n${text}`;
}

/** Builds the OpenAI-compatible "content" value for one message (string, or multimodal parts). */
export function openaiContent(m: ChatMessage): string | unknown[] {
  const attachments = m.attachments ?? [];
  const images = attachments.filter((a) => a.kind === "image" && a.data);
  let text = m.content ?? "";
  for (const a of attachments) {
    if (a.kind === "image") continue;
    text += fileNote(a.name, a.mime, a.text ?? "(no extractable text)");
  }
  if (images.length === 0) return text;
  const parts: unknown[] = [{ type: "text", text: text || "(see attached images)" }];
  for (const img of images) {
    parts.push({ type: "image_url", image_url: { url: `data:${img.mime};base64,${img.data}` } });
  }
  return parts;
}

export function openaiMessages(req: ChatRequest): unknown[] {
  return req.messages.map((m) => ({ role: m.role, content: openaiContent(m) }));
}

export const openaiAdapter: ProviderAdapter = {
  id: "openai",
  url: (entry: ChainEntry) => `${entry.endpoint.replace(/\/$/, "")}/chat/completions`,
  init: (entry: ChainEntry, req: ChatRequest): RequestInit => ({
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${entry.apiKey}`,
    },
    body: JSON.stringify(openaiAdapter.body(entry, req)),
    signal: req.signal,
  }),
  body: (entry: ChainEntry, req: ChatRequest) => {
    const temperature = temperatureFor(entry, req);
    return {
      model: entry.model,
      messages: openaiMessages(req),
      stream: true,
      ...(temperature === undefined ? {} : { temperature }),
      ...(req.maxTokens ? { [tokenParameter(entry)]: req.maxTokens } : {}),
    };
  },
  async *parse(stream: ReadableStream<Uint8Array>) {
    for await (const data of sseDataLines(stream)) {
      const payload = jsonFromSseData<{
        choices?: { delta?: { content?: unknown }; text?: unknown }[];
      }>(data);
      if (!payload) continue;
      const choice = payload.choices?.[0];
      const delta = choice?.delta?.content ?? choice?.text;
      if (typeof delta === "string" && delta.length > 0) yield delta;
    }
  },
};
