import { NextResponse } from "next/server";
import { AGENTS } from "@/lib/agents/registry";
import type { AgentSummary } from "@/lib/agents/types";
import { DEFAULT_BASES, DEFAULT_MODELS, PRIVACY_SAFE_PROVIDERS, looksVisionCapable } from "@/lib/providers/config";
import type { ProviderId } from "@/lib/providers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RungPreview {
  provider: ProviderId;
  label: string;
  model: string;
  endpoint: string;
  vision: boolean;
  available: boolean;
  note?: string;
}

function rung(
  provider: ProviderId,
  label: string,
  model: string,
  key: string | undefined,
  env: Record<string, string | undefined>,
  note?: string,
): RungPreview {
  return {
    provider,
    label,
    model,
    endpoint: env[`${provider.toUpperCase()}_BASE_URL`] || DEFAULT_BASES[provider],
    vision: provider === "openai" || provider === "gemini" ? true : looksVisionCapable(model),
    available: Boolean(key),
    note,
  };
}

export async function GET() {
  const env = process.env;
  const rungs: RungPreview[] = [
    rung("openai", "OpenAI", env.OPENAI_MODEL || DEFAULT_MODELS.openai, env.OPENAI_API_KEY, env, "primary"),
    rung("openai", "OpenAI", env.OPENAI_FALLBACK_MODEL || DEFAULT_MODELS.openaiFallback, env.OPENAI_API_KEY, env, "fallback tier"),
    rung("gemini", "Gemini", env.GEMINI_MODEL || DEFAULT_MODELS.gemini, env.GEMINI_API_KEY, env, "no-training tier"),
    rung("nvidia", "NVIDIA NIM", env.NVIDIA_MODEL || DEFAULT_MODELS.nvidia, env.NVIDIA_API_KEY, env),
    rung("groq", "Groq", env.GROQ_MODEL || DEFAULT_MODELS.groq, env.GROQ_API_KEY, env),
  ];

  const agents: AgentSummary[] = AGENTS.map((a) => ({
    id: a.id,
    name: a.name,
    emoji: a.emoji,
    tagline: a.tagline,
    description: a.description,
    category: a.category,
    vision: a.vision,
    starters: a.starters,
  }));

  return NextResponse.json({
    agents,
    chain: rungs,
    privacySafeProviders: PRIVACY_SAFE_PROVIDERS,
    authRequired: Boolean(env.APP_PASSWORD),
    anyProviderKey: rungs.some((r) => r.available),
  });
}
