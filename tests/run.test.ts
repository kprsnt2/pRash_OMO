import { describe, expect, test } from "bun:test";
import { AllProvidersFailedError, openFirstWorking } from "../lib/providers/run";
import type { ChainEntry, ChatRequest } from "../lib/providers/types";

const ENDPOINTS: Record<string, string> = {
  openai: "https://openai.invalid/v1",
  nvidia: "https://nvidia.invalid/v1",
  groq: "https://groq.invalid/openai/v1",
  gemini: "https://gemini.invalid/v1beta",
};

function entry(provider: ChainEntry["provider"], model: string): ChainEntry {
  return {
    id: `${provider}:${model}`,
    provider,
    label: provider,
    model,
    endpoint: ENDPOINTS[provider],
    apiKey: "k",
    vision: true,
  };
}

const request: ChatRequest = { messages: [{ role: "user", content: "hi" }] };

/** OpenAI-compatible SSE frame stream - the shape the openai, nvidia and groq rungs parse. */
function openaiSse(chunks: string[], status = 200): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`),
        );
      }
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "content-type": "text/event-stream" } });
}

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let out = "";
  for await (const piece of gen) out += piece;
  return out;
}

describe("fallback runner", () => {
  test("walks past a failing rung and serves from the next one", async () => {
    const chain = [entry("openai", "gpt-5.4-mini"), entry("groq", "llama-3.3-70b-versatile")];
    const calls: string[] = [];
    const fakeFetch = (async (url: string | URL | Request) => {
      calls.push(String(url));
      if (calls.length === 1) return new Response("rate limited", { status: 429 });
      return openaiSse(["Hel", "lo from groq"]);
    }) as unknown as typeof fetch;

    const opened = await openFirstWorking(chain, request, { fetchImpl: fakeFetch });
    expect(opened.entry.model).toBe("llama-3.3-70b-versatile");
    expect(opened.attempts).toHaveLength(2);
    expect(opened.attempts[0].ok).toBe(false);
    expect(opened.attempts[0].status).toBe(429);
    expect(opened.attempts[0].error).toContain("rate limited");
    expect(opened.attempts[1].ok).toBe(true);
    expect(await collect(opened.deltas)).toBe("Hello from groq");
    expect(calls).toEqual([`${ENDPOINTS.openai}/chat/completions`, `${ENDPOINTS.groq}/chat/completions`]);
  });

  test("the answer comes only from the rung that committed", async () => {
    const chain = [entry("openai", "gpt-5.4-mini"), entry("groq", "llama-3.3-70b-versatile")];
    const fakeFetch = (async (url: string | URL | Request) =>
      String(url).includes("openai.invalid") ? openaiSse(["first rung"]) : openaiSse(["second rung"])) as unknown as typeof fetch;

    const opened = await openFirstWorking(chain, request, { fetchImpl: fakeFetch });
    expect(opened.entry.provider).toBe("openai");
    expect(await collect(opened.deltas)).toBe("first rung");
    expect(opened.attempts.filter((a) => !a.ok)).toHaveLength(0);
  });

  test("skips a rung that answers with an empty stream", async () => {
    const chain = [entry("openai", "gpt-5.4-mini"), entry("groq", "llama-3.3-70b-versatile")];
    let call = 0;
    const fakeFetch = (async () => {
      call += 1;
      return call === 1 ? openaiSse([]) : openaiSse(["second rung"]);
    }) as unknown as typeof fetch;

    const opened = await openFirstWorking(chain, request, { fetchImpl: fakeFetch });
    expect(opened.entry.provider).toBe("groq");
    expect(opened.attempts[0].error).toBe("stream produced no text");
    expect(await collect(opened.deltas)).toBe("second rung");
  });

  test("abandons a rung that never produces a first token", async () => {
    const chain = [entry("nvidia", "meta/llama-3.3-70b-instruct"), entry("groq", "llama-3.3-70b-versatile")];
    let call = 0;
    const fakeFetch = (async () => {
      call += 1;
      if (call === 1) return new Response(new ReadableStream<Uint8Array>({ start() {} }), { status: 200 });
      return openaiSse(["recovered"]);
    }) as unknown as typeof fetch;

    const opened = await openFirstWorking(chain, request, { fetchImpl: fakeFetch, firstChunkMs: 40 });
    expect(opened.entry.provider).toBe("groq");
    expect(opened.attempts[0].error).toContain("no first token");
    expect(await collect(opened.deltas)).toBe("recovered");
  });

  test("reports every attempt when the whole chain fails", async () => {
    const chain = [entry("openai", "gpt-5.4-mini"), entry("gemini", "gemini-flash-latest")];
    const fakeFetch = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;

    await expect(openFirstWorking(chain, request, { fetchImpl: fakeFetch })).rejects.toBeInstanceOf(AllProvidersFailedError);
    try {
      await openFirstWorking(chain, request, { fetchImpl: fakeFetch });
    } catch (error) {
      const failure = error as AllProvidersFailedError;
      expect(failure.attempts.map((a) => a.entry.provider)).toEqual(["openai", "gemini"]);
      expect(failure.attempts.every((a) => a.status === 500)).toBe(true);
      expect(failure.attempts.every((a) => a.error === "boom")).toBe(true);
    }
  });
});
