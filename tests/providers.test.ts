import { describe, expect, test } from "bun:test";
import { geminiAdapter, geminiBody } from "../lib/providers/gemini";
import { openaiAdapter, openaiContent, openaiMessages } from "../lib/providers/openai";
import type { ChainEntry, ChatRequest } from "../lib/providers/types";

const entry = (over: Partial<ChainEntry> = {}): ChainEntry => ({
  id: "openai:gpt-5.4-mini",
  provider: "openai",
  label: "OpenAI",
  model: "gpt-5.4-mini",
  endpoint: "https://api.openai.com/v1",
  apiKey: "sk-secret",
  vision: true,
  ...over,
});

const request = (over: Partial<ChatRequest> = {}): ChatRequest => ({
  messages: [
    { role: "system", content: "be kind" },
    { role: "user", content: "look at these", attachments: [
      { id: "1", kind: "image", name: "a.png", mime: "image/png", size: 10, data: "QQ==" },
      { id: "2", kind: "image", name: "b.jpg", mime: "image/jpeg", size: 10, data: "Qg==" },
      { id: "3", kind: "pdf", name: "report.pdf", mime: "application/pdf", size: 20, data: "UEQ=", text: "haemoglobin 9.1" },
      { id: "4", kind: "text", name: "notes.md", mime: "text/markdown", size: 5, text: "# notes" },
    ] },
  ],
  ...over,
});

describe("openai-compatible adapter", () => {
  test("builds the chat completions url from the entry endpoint", () => {
    expect(openaiAdapter.url(entry())).toBe("https://api.openai.com/v1/chat/completions");
  });

  test("sends the api key as a bearer token", () => {
    const init = openaiAdapter.init(entry(), request());
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-secret");
    expect(init.method).toBe("POST");
  });

  test("carries every image as a data url and every document as extracted text", () => {
    const content = openaiContent(request().messages[1]) as { type: string; image_url?: { url: string }; text?: string }[];
    expect(Array.isArray(content)).toBe(true);
    expect(content[0].type).toBe("text");
    expect(content[0].text).toContain("haemoglobin 9.1");
    expect(content[0].text).toContain("# notes");
    const images = content.filter((part) => part.type === "image_url");
    expect(images).toHaveLength(2);
    expect(images[0].image_url?.url).toBe("data:image/png;base64,QQ==");
    expect(images[1].image_url?.url).toBe("data:image/jpeg;base64,Qg==");
  });

  test("keeps content as a plain string when no image is attached", () => {
    const messages = openaiMessages({ messages: [{ role: "user", content: "hi" }] });
    expect(messages[0]).toEqual({ role: "user", content: "hi" });
  });

  test("requests a stream for the configured model", () => {
    const body = openaiAdapter.body(entry(), request()) as { model: string; stream: boolean };
    expect(body.model).toBe("gpt-5.4-mini");
    expect(body.stream).toBe(true);
  });

  test("parses streaming deltas and ignores keep-alives", async () => {
    const frames = [
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      ": keep-alive\n\n",
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const frame of frames) controller.enqueue(new TextEncoder().encode(frame));
        controller.close();
      },
    });
    const chunks: string[] = [];
    for await (const chunk of openaiAdapter.parse(stream)) chunks.push(chunk);
    expect(chunks.join("")).toBe("Hello");
  });
});

describe("gemini adapter", () => {
  const geminiEntry = entry({ provider: "gemini", id: "gemini:gemini-flash-latest", model: "gemini-flash-latest", endpoint: "https://generativelanguage.googleapis.com/v1beta", apiKey: "gm-key" });

  test("builds the streamGenerateContent url with alt=sse", () => {
    expect(geminiAdapter.url(geminiEntry)).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse",
    );
  });

  test("passes the key as x-goog-api-key", () => {
    const init = geminiAdapter.init(geminiEntry, request());
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("gm-key");
  });

  test("moves the system prompt out of contents and maps assistant to model", () => {
    const body = geminiBody(geminiEntry, {
      messages: [
        { role: "system", content: "be kind" },
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
        { role: "user", content: "again" },
      ],
    }) as { systemInstruction: { parts: { text: string }[] }; contents: { role: string; parts: unknown[] }[] };
    expect(body.systemInstruction.parts[0].text).toBe("be kind");
    expect(body.contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
  });

  test("sends images as inlineData and scans as raw pdf inlineData", () => {
    const body = geminiBody(geminiEntry, request()) as unknown as { contents: { parts: Record<string, unknown>[] }[] };
    const parts = body.contents[0].parts;
    const inline = parts.filter((p) => "inlineData" in p) as { inlineData: { mimeType: string; data: string } }[];
    expect(inline).toHaveLength(2);
    expect(inline[0].inlineData.mimeType).toBe("image/png");
    const text = parts.filter((p) => "text" in p).map((p) => (p as { text: string }).text).join("\n");
    expect(text).toContain("haemoglobin 9.1");
  });

  test("parses gemini sse payloads", async () => {
    const frames = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Nam"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"aste"}]}}]}\n\n',
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const frame of frames) controller.enqueue(new TextEncoder().encode(frame));
        controller.close();
      },
    });
    const chunks: string[] = [];
    for await (const chunk of geminiAdapter.parse(stream)) chunks.push(chunk);
    expect(chunks.join("")).toBe("Namaste");
  });
});
