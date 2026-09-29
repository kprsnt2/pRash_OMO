// QA-only upstream: stands in for OpenAI / NVIDIA / Groq / Gemini while the app is exercised.
// It records every request so the fallback order, privacy routing and attachment payloads can be asserted.
const state = {
  openaiFail: false,
  openaiFailOnce: false,
  nvidiaFail: false,
  groqFail: false,
  emptyOpenai: false,
  geminiFail: false,
};

const counts = { openai: 0, nvidia: 0, groq: 0, gemini: 0 };
const lastBodies = { openai: null, nvidia: null, groq: null, gemini: null };

function record(provider, body) {
  counts[provider] += 1;
  lastBodies[provider] = body;
}

function summary(body) {
  const messages = body?.messages ?? body?.contents ?? [];
  const parts = [];
  for (const message of messages) {
    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        parts.push(part.type === "image_url" ? "image_url" : "text");
      }
    }
    for (const part of message.parts ?? []) {
      if (part.inlineData) parts.push(`inlineData:${part.inlineData.mimeType}`);
      else parts.push("text");
    }
  }
  const flat = JSON.stringify(body ?? {});
  return {
    provider: body?.model ?? "gemini",
    messageCount: messages.length,
    partKinds: parts,
    imageParts: parts.filter((p) => p.startsWith("image_url") || p.includes("image/")).length,
    systemPromptChars: (body?.messages ?? []).filter((m) => m.role === "system").map((m) => String(m.content ?? "").length).reduce((a, b) => a + b, 0),
    systemPromptHead: String((body?.messages ?? []).find((m) => m.role === "system")?.content ?? "").slice(0, 90),
    containsHaemoglobin: flat.includes("haemoglobin 9.1"),
    containsNotesText: flat.includes("# notes"),
    systemPromptSeen: messages.some((m) => {
      if (typeof m.content === "string") return false;
      if (Array.isArray(m.content) && m.content.some((p) => p.text && p.text.length > 200)) return true;
      return (m.parts ?? []).some((p) => (p.text ?? "").length > 200);
    }),
  };
}

function lastUserText(body) {
  const messages = body?.messages ?? body?.contents ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i].content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) return content.map((p) => p.text ?? "").join(" ");
    const parts = messages[i].parts;
    if (Array.isArray(parts)) return parts.map((p) => p.text ?? "").join(" ");
  }
  return "";
}

const WORKSHEET_CHUNKS = [
  "Class 4 Maths - Multiplication (20 marks)\n\nAnswer all questions.\n\n",
  "1. 6 x 7 = ____\n\n2. 8 x 9 = ____\n\n3. 12 x 4 = ____\n\n",
  "---\n\n",
  "Answer key\n\n1. 42\n\n2. 72\n\n3. 48\n",
];

function openaiStream(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`),
        );
      }
      controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

function geminiStream(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: chunk }] } }] })}\n\n`,
          ),
        );
      }
      controller.close();
    },
  });
}

function sseResponse(stream) {
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } });
}

const server = Bun.serve({
  port: 4111,
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/__last") {
      const provider = url.searchParams.get("provider") ?? "openai";
      return Response.json({ body: lastBodies[provider] });
    }
    if (path === "/__stats") {
      return Response.json({
        counts,
        lastBodies: {
          openai: lastBodies.openai ? summary(lastBodies.openai) : null,
          nvidia: lastBodies.nvidia ? summary(lastBodies.nvidia) : null,
          groq: lastBodies.groq ? summary(lastBodies.groq) : null,
          gemini: lastBodies.gemini ? summary(lastBodies.gemini) : null,
        },
      });
    }
    if (path === "/__config") {
      const patch = await request.json().catch(() => ({}));
      Object.assign(state, patch);
      return Response.json({ state });
    }
    if (path === "/__reset") {
      for (const key of Object.keys(counts)) counts[key] = 0;
      for (const key of Object.keys(lastBodies)) lastBodies[key] = null;
      Object.assign(state, { openaiFail: false, openaiFailOnce: false, nvidiaFail: false, groqFail: false, geminiFail: false, emptyOpenai: false });
      return Response.json({ ok: true });
    }

    const body = await request.json().catch(() => ({}));
    const geminiModel = path.match(/models\/([^:]+):/)?.[1] ?? "gemini-flash-latest";

    if (path.startsWith("/openai/")) {
      if (state.openaiFail || state.openaiFailOnce) {
        state.openaiFailOnce = false;
        record("openai", body);
        return new Response("mock openai quota exhausted", { status: 429 });
      }
      record("openai", body);
      if (state.emptyOpenai) return sseResponse(openaiStream([]));
      const model = body?.model ?? "gpt-5.4-mini";
      if (/worksheet/i.test(lastUserText(body))) return sseResponse(openaiStream(WORKSHEET_CHUNKS));
      return sseResponse(openaiStream(["MOCK-OK ", `[openai:${model}] `, "Hello from the mock OpenAI rung."]));
    }

    if (path.startsWith("/nvidia/")) {
      if (state.nvidiaFail) {
        record("nvidia", body);
        return new Response("mock nvidia down", { status: 503 });
      }
      record("nvidia", body);
      return sseResponse(openaiStream(["MOCK-OK [nvidia] hello."]));
    }

    if (path.startsWith("/groq/")) {
      if (state.groqFail) {
        record("groq", body);
        return new Response("mock groq down", { status: 503 });
      }
      record("groq", body);
      if (/worksheet/i.test(lastUserText(body))) return sseResponse(openaiStream(WORKSHEET_CHUNKS));
      return sseResponse(openaiStream(["MOCK-OK [groq] hello."]));
    }

    if (path.startsWith("/gemini/")) {
      if (state.geminiFail) {
        record("gemini", body);
        return new Response("mock gemini down", { status: 503 });
      }
      record("gemini", body);
      return sseResponse(geminiStream(["MOCK-OK ", `[gemini:${geminiModel}] `, "Hello from the mock Gemini rung."]));
    }

    return new Response("not found", { status: 404 });
  },
});

console.log(`mock upstream listening on http://localhost:${server.port}`);
