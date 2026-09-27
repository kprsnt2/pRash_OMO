// Live smoke test: proves each configured provider really answers with your own keys.
// Usage: bun scripts/real-smoke.mjs            (reads .env.local, or the current environment)
import { existsSync } from "node:fs";

const envPath = "C:/Users/hplap/Desktop/pRash/pRash_omo/.env.local";
if (existsSync(envPath)) {
  for (const line of (await Bun.file(envPath).text()).split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const prompt = "Reply with exactly: PONG";

const rungs = [
  { provider: "openai", label: "OpenAI", base: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1", key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || "gpt-5.4-mini", kind: "openai" },
  { provider: "openai", label: "OpenAI (fallback tier)", base: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1", key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_FALLBACK_MODEL || "gpt-5.4-nano", kind: "openai" },
  { provider: "gemini", label: "Gemini", base: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta", key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || "gemini-flash-latest", kind: "gemini" },
  { provider: "nvidia", label: "NVIDIA NIM", base: process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1", key: process.env.NVIDIA_API_KEY, model: process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct", kind: "openai" },
  { provider: "groq", label: "Groq", base: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1", key: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile", kind: "openai" },
];

async function ask(rung) {
  const started = Date.now();
  try {
    if (rung.kind === "gemini") {
      const url = `${rung.base.replace(/\/$/, "")}/models/${encodeURIComponent(rung.model)}:generateContent`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": rung.key },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status} ${JSON.stringify(data).slice(0, 200)}` };
      const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      return { ok: true, text: text.trim().slice(0, 80), ms: Date.now() - started };
    }
    const res = await fetch(`${rung.base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${rung.key}` },
      body: JSON.stringify({ model: rung.model, messages: [{ role: "user", content: prompt }], max_tokens: 16 }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status} ${JSON.stringify(data).slice(0, 200)}` };
    const text = data.choices?.[0]?.message?.content ?? "";
    return { ok: true, text: String(text).trim().slice(0, 80), ms: Date.now() - started };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

const results = [];
for (const rung of rungs) {
  if (!rung.key) {
    results.push({ rung: `${rung.label} / ${rung.model}`, status: "SKIPPED (no key)" });
    continue;
  }
  const result = await ask(rung);
  results.push({
    rung: `${rung.label} / ${rung.model}`,
    status: result.ok ? `PASS (${result.ms}ms) "${result.text}"` : `FAIL ${result.detail}`,
  });
}

for (const row of results) console.log(`${row.status.startsWith("PASS") ? "ok  " : row.status.startsWith("SKIPPED") ? "--  " : "ERR "} ${row.rung}: ${row.status}`);

const configured = results.filter((r) => !r.status.startsWith("SKIPPED"));
const passed = configured.filter((r) => r.status.startsWith("PASS"));
console.log(`\n${passed.length}/${configured.length} configured providers answered (privacy mode needs Gemini to pass).`);
process.exit(configured.length > 0 && passed.length > 0 ? 0 : 1);
