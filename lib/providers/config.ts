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

/** Provider order for the picker and the default fallback walk. */
export const PROVIDER_ORDER: ProviderId[] = ["openai", "gemini", "nvidia", "groq"];

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  nvidia: "NVIDIA NIM",
  groq: "Groq",
};

/**
 * The curated model list per provider. Only these are offered in the model picker; the first one
 * is that provider's primary rung. Replace a list with `${PROVIDER}_MODELS` (comma separated).
 */
export const PROVIDER_MODELS: Record<ProviderId, string[]> = {
  openai: ["gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.4", "gpt-4.1-mini"],
  gemini: ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-pro"],
  nvidia: ["meta/llama-3.3-70b-instruct", "meta/llama-3.2-90b-vision-instruct", "deepseek-ai/deepseek-r1"],
  groq: ["llama-3.3-70b-versatile", "meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.1-8b-instant"],
};

function parseModelList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Models offered for a provider, primary first.
 * - `${PROVIDER}_MODELS` (comma separated) replaces the curated list.
 * - `${PROVIDER}_DEFAULT_MODEL` - the legacy `${PROVIDER}_MODEL` still works - moves that model to
 *   the front and adds it when the list lacks it, so one env var can bypass the curated list.
 */
export function modelsFor(provider: ProviderId, env: EnvLike = process.env): string[] {
  const key = provider.toUpperCase();
  const listed = parseModelList(env[`${key}_MODELS`]);
  const base = listed.length > 0 ? listed : PROVIDER_MODELS[provider];
  const preferred = (env[`${key}_DEFAULT_MODEL`] || env[`${key}_MODEL`] || "").trim();
  if (!preferred) return base;
  return [preferred, ...base.filter((model) => model !== preferred)];
}

function entryFor(
  provider: ProviderId,
  model: string,
  env: EnvLike,
  apiKey: string,
  notes?: string,
): ChainEntry {
  return {
    id: `${provider}:${model}`,
    provider,
    label: PROVIDER_LABELS[provider],
    model,
    endpoint: env[`${provider.toUpperCase()}_BASE_URL`] || DEFAULT_BASES[provider],
    apiKey,
    vision: provider === "openai" || provider === "gemini" ? true : looksVisionCapable(model),
    notes,
  };
}

/** Puts a pinned entry at the head of the walk; the remaining rungs stay as fallback. */
export function withPinnedEntry(entries: ChainEntry[], pinned: ChainEntry | undefined): ChainEntry[] {
  if (!pinned) return entries;
  return [pinned, ...entries.filter((entry) => entry.id !== pinned.id)];
}

/**
 * The rung for one model the user pinned, or undefined when no provider lists that model or the
 * provider has no key. Pinning is limited to the curated lists on purpose.
 */
export function entryForModel(model: string, env: EnvLike = process.env): ChainEntry | undefined {
  for (const provider of PROVIDER_ORDER) {
    if (!modelsFor(provider, env).includes(model)) continue;
    const apiKey = env[`${provider.toUpperCase()}_API_KEY`];
    if (!apiKey) return undefined;
    return entryFor(provider, model, env, apiKey, "pinned in the model picker");
  }
  return undefined;
}

/** Heuristic: the entry's model can consume images. */
export function looksVisionCapable(model: string): boolean {
  return /vision|scout|llama-4|gemma-3|qwen.*vl|pixtral|gpt-5|gpt-4o|claude|gemini/i.test(model);
}

/**
 * Builds the ordered fallback chain from environment variables.
 * Order: OpenAI mini -> OpenAI nano -> Gemini flash -> NVIDIA NIM -> Groq.
 * Entries without an API key are omitted entirely.
 */
interface RungSpec {
  provider: ProviderId;
  model: string;
  base?: string;
  apiKey?: string;
  vision: boolean;
  note?: string;
}

/**
 * The ordered rungs, keys included. Providers without a key stay in the list so the picker can show
 * them as "no key"; envChain drops them and previewChain marks them unavailable.
 */
function chainSpecs(env: EnvLike): RungSpec[] {
  const specs: RungSpec[] = [];
  const spec = (
    provider: ProviderId,
    model: string,
    base: string | undefined,
    apiKey: string | undefined,
    vision: boolean,
    note?: string,
  ) => {
    specs.push({ provider, model, base, apiKey, vision, note });
  };

  const openaiModel = modelsFor("openai", env)[0] ?? DEFAULT_MODELS.openai;
  const openaiFallback = env.OPENAI_FALLBACK_MODEL || DEFAULT_MODELS.openaiFallback;
  spec("openai", openaiModel, env.OPENAI_BASE_URL, env.OPENAI_API_KEY, true, "primary");
  if (openaiFallback !== openaiModel) {
    spec("openai", openaiFallback, env.OPENAI_BASE_URL, env.OPENAI_API_KEY, true, "openai fallback tier");
  }

  const geminiModel = modelsFor("gemini", env)[0] ?? DEFAULT_MODELS.gemini;
  spec("gemini", geminiModel, env.GEMINI_BASE_URL, env.GEMINI_API_KEY, true, "no-training-on-data tier");
  const geminiAlt = env.GEMINI_FALLBACK_MODEL;
  if (geminiAlt && geminiAlt !== geminiModel) {
    spec("gemini", geminiAlt, env.GEMINI_BASE_URL, env.GEMINI_API_KEY, true, "gemini alt model");
  }

  const nvidiaModel = modelsFor("nvidia", env)[0] ?? DEFAULT_MODELS.nvidia;
  spec("nvidia", nvidiaModel, env.NVIDIA_BASE_URL, env.NVIDIA_API_KEY, looksVisionCapable(nvidiaModel));
  const groqModel = modelsFor("groq", env)[0] ?? DEFAULT_MODELS.groq;
  spec("groq", groqModel, env.GROQ_BASE_URL, env.GROQ_API_KEY, looksVisionCapable(groqModel));

  return specs;
}

export function envChain(env: EnvLike = process.env): ChainEntry[] {
  return chainSpecs(env)
    .filter((s): s is RungSpec & { apiKey: string } => Boolean(s.apiKey))
    .map((s) => ({
      id: `${s.provider}:${s.model}`,
      provider: s.provider,
      label: PROVIDER_LABELS[s.provider],
      model: s.model,
      endpoint: s.base || DEFAULT_BASES[s.provider],
      apiKey: s.apiKey,
      vision: s.vision,
      notes: s.note,
    }));
}

export interface RungPreview {
  id: string;
  provider: ProviderId;
  label: string;
  model: string;
  endpoint: string;
  vision: boolean;
  /** true when the provider has an API key, so this rung can actually serve */
  available: boolean;
  note?: string;
}

/** The same rungs as envChain, but every provider is listed and availability is reported. */
export function previewChain(env: EnvLike = process.env): RungPreview[] {
  return chainSpecs(env).map((s) => ({
    id: `${s.provider}:${s.model}`,
    provider: s.provider,
    label: PROVIDER_LABELS[s.provider],
    model: s.model,
    endpoint: s.base || DEFAULT_BASES[s.provider],
    vision: s.vision,
    available: Boolean(s.apiKey),
    note: s.note,
  }));
}

/** Providers that may receive a request while privacy mode is on. */
export const PRIVACY_SAFE_PROVIDERS: ProviderId[] = ["gemini"];
