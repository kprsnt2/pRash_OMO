import type { ChainEntry, ProviderId } from "./types";

export type ChatMode = "normal" | "privacy";

export type EnvLike = Record<string, string | undefined>;

export const DEFAULT_BASES: Record<ProviderId, string> = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  nvidia: "https://integrate.api.nvidia.com/v1",
  groq: "https://api.groq.com/openai/v1",
};

export const DEFAULT_MODELS = {
  openai: "gpt-5.4-mini",
  openaiFallback: "gpt-5.4-nano",
  gemini: "gemini-flash-latest",
  nvidia: "meta/llama-3.3-70b-instruct",
  groq: "llama-3.3-70b-versatile",
};

/** Heuristic: the entry's model can consume images. */
export function looksVisionCapable(model: string): boolean {
  return /vision|scout|llama-4|gemma-3|qwen.*vl|pixtral|gpt-5|gpt-4o|claude|gemini/i.test(model);
}

/**
 * Builds the ordered fallback chain from environment variables.
 * Order: OpenAI mini -> OpenAI nano -> Gemini flash -> NVIDIA NIM -> Groq.
 * Entries without an API key are omitted entirely.
 */
export function envChain(env: EnvLike = process.env): ChainEntry[] {
  const entries: ChainEntry[] = [];
  const push = (
    provider: ProviderId,
    label: string,
    model: string,
    apiKey: string | undefined,
    baseOverride: string | undefined,
    vision: boolean,
    notes?: string,
  ) => {
    if (!apiKey) return;
    entries.push({
      id: `${provider}:${model}`,
      provider,
      label,
      model,
      endpoint: baseOverride || DEFAULT_BASES[provider],
      apiKey,
      vision,
      notes,
    });
  };

  const openaiModel = env.OPENAI_MODEL || DEFAULT_MODELS.openai;
  const openaiFallback = env.OPENAI_FALLBACK_MODEL || DEFAULT_MODELS.openaiFallback;
  push("openai", "OpenAI", openaiModel, env.OPENAI_API_KEY, env.OPENAI_BASE_URL, true, "primary");
  if (openaiFallback !== openaiModel) {
    push("openai", "OpenAI", openaiFallback, env.OPENAI_API_KEY, env.OPENAI_BASE_URL, true, "openai fallback tier");
  }

  push("gemini", "Gemini", env.GEMINI_MODEL || DEFAULT_MODELS.gemini, env.GEMINI_API_KEY, env.GEMINI_BASE_URL, true, "no-training-on-data tier");
  const geminiAlt = env.GEMINI_FALLBACK_MODEL;
  if (geminiAlt && geminiAlt !== (env.GEMINI_MODEL || DEFAULT_MODELS.gemini)) {
    push("gemini", "Gemini", geminiAlt, env.GEMINI_API_KEY, env.GEMINI_BASE_URL, true, "gemini alt model");
  }

  const nvidiaModel = env.NVIDIA_MODEL || DEFAULT_MODELS.nvidia;
  push("nvidia", "NVIDIA NIM", nvidiaModel, env.NVIDIA_API_KEY, env.NVIDIA_BASE_URL, looksVisionCapable(nvidiaModel));
  push("groq", "Groq", env.GROQ_MODEL || DEFAULT_MODELS.groq, env.GROQ_API_KEY, env.GROQ_BASE_URL, looksVisionCapable(env.GROQ_MODEL || DEFAULT_MODELS.groq));

  return entries;
}

/** Providers that may receive a request while privacy mode is on. */
export const PRIVACY_SAFE_PROVIDERS: ProviderId[] = ["gemini"];
