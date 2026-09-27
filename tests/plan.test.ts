import { describe, expect, test } from "bun:test";
import { envChain, PRIVACY_SAFE_PROVIDERS } from "../lib/providers/config";
import { planChain } from "../lib/route/plan";
import type { ChainEntry } from "../lib/providers/types";

const FULL_ENV = {
  OPENAI_API_KEY: "sk-test-openai",
  GEMINI_API_KEY: "gm-test-gemini",
  NVIDIA_API_KEY: "nv-test-nvidia",
  GROQ_API_KEY: "gsk-test-groq",
};

describe("provider chain from environment", () => {
  test("orders the rungs openai mini -> openai nano -> gemini -> nvidia -> groq", () => {
    const chain = envChain(FULL_ENV);
    expect(chain.map((e) => `${e.provider}:${e.model}`)).toEqual([
      "openai:gpt-5.4-mini",
      "openai:gpt-5.4-nano",
      "gemini:gemini-flash-latest",
      "nvidia:meta/llama-3.3-70b-instruct",
      "groq:llama-3.3-70b-versatile",
    ]);
  });

  test("omits providers with no key instead of failing at request time", () => {
    const chain = envChain({ GEMINI_API_KEY: "gm-only" });
    expect(chain).toHaveLength(1);
    expect(chain[0].provider).toBe("gemini");
  });

  test("honours model and base-url overrides", () => {
    const chain = envChain({ OPENAI_API_KEY: "k", OPENAI_MODEL: "gpt-5.4", OPENAI_BASE_URL: "http://localhost:4100/v1" });
    expect(chain[0].model).toBe("gpt-5.4");
    expect(chain[0].endpoint).toBe("http://localhost:4100/v1");
  });

  test("marks the openai and gemini rungs vision capable and text-only nvidia as not", () => {
    const chain = envChain(FULL_ENV);
    const byId = Object.fromEntries(chain.map((e) => [`${e.provider}:${e.model}`, e]));
    expect(byId["openai:gpt-5.4-mini"].vision).toBe(true);
    expect(byId["gemini:gemini-flash-latest"].vision).toBe(true);
    expect(byId["nvidia:meta/llama-3.3-70b-instruct"].vision).toBe(false);
  });
});

describe("routing plan", () => {
  const chain: ChainEntry[] = envChain(FULL_ENV);

  test("normal mode keeps the whole chain", () => {
    const plan = planChain({ entries: chain, mode: "normal", hasImages: false });
    expect(plan.entries).toHaveLength(5);
    expect(plan.skipped).toHaveLength(0);
  });

  test("privacy mode keeps only the no-training tier and explains each skip", () => {
    const plan = planChain({ entries: chain, mode: "privacy", hasImages: false });
    expect(plan.entries.map((e) => e.provider)).toEqual(["gemini"]);
    expect(plan.entries.every((e) => PRIVACY_SAFE_PROVIDERS.includes(e.provider))).toBe(true);
    expect(plan.skipped.map((s) => s.provider).sort()).toEqual(["groq", "nvidia", "openai", "openai"]);
    expect(plan.skipped[0].reason).toContain("privacy mode");
  });

  test("image attachments drop rungs that cannot read images", () => {
    const plan = planChain({ entries: chain, mode: "normal", hasImages: true });
    expect(plan.entries.every((e) => e.vision)).toBe(true);
    expect(plan.skipped.some((s) => s.provider === "nvidia")).toBe(true);
  });

  test("an explicit provider is pinned ahead of the rest but the chain stays as fallback", () => {
    const plan = planChain({ entries: chain, mode: "normal", hasImages: false, forceProvider: "groq" });
    expect(plan.entries.map((e) => e.provider)).toEqual(["groq"]);
  });

  test("an explicit model is moved to the front without dropping the fallback rungs", () => {
    const plan = planChain({ entries: chain, mode: "normal", hasImages: false, forceModel: "gemini-flash-latest" });
    expect(plan.entries[0].model).toBe("gemini-flash-latest");
    expect(plan.entries).toHaveLength(5);
  });

  test("privacy mode ignores an explicit non-Gemini provider request", () => {
    const plan = planChain({ entries: chain, mode: "privacy", hasImages: false, forceProvider: "openai", forceModel: "gpt-5.4-mini" });
    expect(plan.entries.every((e) => e.provider === "gemini")).toBe(true);
  });

  test("returns an empty plan with reasons when nothing can serve", () => {
    const plan = planChain({ entries: envChain({}), mode: "normal", hasImages: false });
    expect(plan.entries).toHaveLength(0);
  });
});
