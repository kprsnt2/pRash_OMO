import type { ChainEntry, ProviderId } from "../providers/types";
import { PRIVACY_SAFE_PROVIDERS, type ChatMode } from "../providers/config";

export interface PlanInput {
  entries: ChainEntry[];
  mode: ChatMode;
  hasImages: boolean;
  forceProvider?: ProviderId | "auto";
  forceModel?: string | "auto";
}

export interface SkipRecord {
  id: string;
  provider: ProviderId;
  reason: string;
}

export interface PlanResult {
  entries: ChainEntry[];
  skipped: SkipRecord[];
}

/**
 * Pure routing decision: which provider entries may serve this request, in order.
 * - privacy mode never leaves the Gemini (no-training) tier
 * - image attachments require a vision-capable entry
 * - an explicit provider/model choice is honoured first, remaining rungs stay as fallback
 */
export function planChain(input: PlanInput): PlanResult {
  const skipped: SkipRecord[] = [];
  let candidates = input.entries.filter((e) => {
    if (input.mode === "privacy" && !PRIVACY_SAFE_PROVIDERS.includes(e.provider)) {
      skipped.push({ id: e.id, provider: e.provider, reason: "privacy mode: only Gemini (paid key, no training on your data)" });
      return false;
    }
    if (input.forceProvider && input.forceProvider !== "auto" && e.provider !== input.forceProvider) {
      // an explicit provider choice pins the tier, but other providers stay as fallback
      return false;
    }
    return true;
  });

  if (input.forceProvider && input.forceProvider !== "auto" && candidates.length === 0) {
    // explicit provider requested but unavailable -> fall back to the full safe set
    candidates = input.entries.filter((e) => !(input.mode === "privacy" && !PRIVACY_SAFE_PROVIDERS.includes(e.provider)));
  }

  if (input.hasImages) {
    candidates = candidates.filter((e) => {
      if (e.vision) return true;
      skipped.push({ id: e.id, provider: e.provider, reason: "model cannot read image attachments" });
      return false;
    });
  }

  if (input.forceModel && input.forceModel !== "auto") {
    const exact = candidates.filter((e) => e.model === input.forceModel);
    const rest = candidates.filter((e) => e.model !== input.forceModel);
    candidates = [...exact, ...rest];
  }

  return { entries: candidates, skipped };
}
