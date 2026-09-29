import { NextResponse } from "next/server";
import { AGENTS } from "@/lib/agents/registry";
import type { AgentSummary } from "@/lib/agents/types";
import {
  PRIVACY_SAFE_PROVIDERS,
  PROVIDER_LABELS,
  PROVIDER_ORDER,
  modelsFor,
  previewChain,
} from "@/lib/providers/config";
import type { ProviderId } from "@/lib/providers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ModelGroupView {
  provider: ProviderId;
  label: string;
  available: boolean;
  primary: string;
  models: string[];
}

export async function GET() {
  const env = process.env;

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

  const chain = previewChain(env);

  const models: ModelGroupView[] = PROVIDER_ORDER.map((provider) => {
    const listed = modelsFor(provider, env);
    return {
      provider,
      label: PROVIDER_LABELS[provider],
      available: Boolean(env[`${provider.toUpperCase()}_API_KEY`]),
      primary: listed[0] ?? "",
      models: listed,
    };
  });

  return NextResponse.json({
    agents,
    chain,
    models,
    privacySafeProviders: PRIVACY_SAFE_PROVIDERS,
    authRequired: Boolean(env.APP_PASSWORD),
    anyProviderKey: chain.some((rung) => rung.available),
  });
}
