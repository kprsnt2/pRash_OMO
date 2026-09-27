import type { ProviderAdapter, ProviderId } from "./types";
import { openaiAdapter } from "./openai";
import { geminiAdapter } from "./gemini";

export const adapters: Record<ProviderId, ProviderAdapter> = {
  openai: openaiAdapter,
  // NVIDIA NIM and Groq both expose the OpenAI chat-completions surface.
  nvidia: openaiAdapter,
  groq: openaiAdapter,
  gemini: geminiAdapter,
};

export function adapterFor(id: ProviderId): ProviderAdapter {
  return adapters[id];
}
