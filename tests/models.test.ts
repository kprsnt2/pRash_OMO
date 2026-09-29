import { describe, expect, test } from "bun:test";
import {
  PROVIDER_MODELS,
  entryForModel,
  envChain,
  modelsFor,
  previewChain,
  withPinnedEntry,
} from "../lib/providers/config";
import { planChain } from "../lib/route/plan";

const KEYS = {
  OPENAI_API_KEY: "sk-openai",
  GEMINI_API_KEY: "gk",
  NVIDIA_API_KEY: "nk",
  GROQ_API_KEY: "qk",
};

describe("curated model list", () => {
  test("offers the curated models for a provider, primary first", () => {
    expect(modelsFor("openai", {})).toEqual(PROVIDER_MODELS.openai);
    expect(modelsFor("openai", {})[0]).toBe("gpt-5.4-mini");
  });

  test("${PROVIDER}_MODELS replaces the curated list", () => {
    expect(modelsFor("groq", { GROQ_MODELS: "a, b\nc" })).toEqual(["a", "b", "c"]);
  });

  test("${PROVIDER}_DEFAULT_MODEL moves that model to the front and adds it to the list", () => {
    const models = modelsFor("gemini", { GEMINI_DEFAULT_MODEL: "gemini-2.5-pro" });
    expect(models[0]).toBe("gemini-2.5-pro");
    expect(models).toHaveLength(PROVIDER_MODELS.gemini.length);

    const escaped = modelsFor("gemini", { GEMINI_DEFAULT_MODEL: "gemini-experimental" });
    expect(escaped[0]).toBe("gemini-experimental");
    expect(escaped).toContain("gemini-flash-latest");
  });

  test("the legacy ${PROVIDER}_MODEL still acts as the default override", () => {
    expect(modelsFor("nvidia", { NVIDIA_MODEL: "meta/llama-3.1-8b-instruct" })[0]).toBe("meta/llama-3.1-8b-instruct");
  });

  test("the fallback chain starts from the overridden default model", () => {
    const chain = envChain({ ...KEYS, OPENAI_DEFAULT_MODEL: "gpt-5.4" });
    expect(chain[0].id).toBe("openai:gpt-5.4");
    expect(chain[0].endpoint).toBe("https://api.openai.com/v1");
  });
});

describe("pinning a listed model", () => {
  test("builds an entry for a listed model when the provider has a key", () => {
    const entry = entryForModel("meta-llama/llama-4-scout-17b-16e-instruct", KEYS);
    expect(entry?.provider).toBe("groq");
    expect(entry?.model).toBe("meta-llama/llama-4-scout-17b-16e-instruct");
    expect(entry?.endpoint).toBe("https://api.groq.com/openai/v1");
    expect(entry?.vision).toBe(true);
  });

  test("refuses a model that no provider lists", () => {
    expect(entryForModel("gpt-2", KEYS)).toBeUndefined();
  });

  test("refuses a listed model when its provider has no key", () => {
    expect(entryForModel("gemini-2.5-pro", { OPENAI_API_KEY: "sk" })).toBeUndefined();
  });

  test("moves the pinned entry to the head of the walk and keeps the rest as fallback", () => {
    const env = { ...KEYS };
    const pinned = entryForModel("gpt-4.1-mini", env);
    const entries = withPinnedEntry(envChain(env), pinned);
    const plan = planChain({ entries, mode: "normal", hasImages: false, forceModel: "auto" });

    const chain = envChain(env);
    expect(chain.some((e) => e.model === "gpt-4.1-mini")).toBe(false);
    expect(plan.entries[0].model).toBe("gpt-4.1-mini");
    expect(plan.entries.slice(1).map((e) => e.id)).toEqual(chain.map((e) => e.id));
  });

  test("a model already in the chain is not duplicated", () => {
    const env = { ...KEYS };
    const pinned = entryForModel("gpt-5.4-mini", env);
    const entries = withPinnedEntry(envChain(env), pinned);
    expect(entries.filter((e) => e.id === "openai:gpt-5.4-mini")).toHaveLength(1);
    expect(entries).toHaveLength(envChain(env).length);
  });

  test("an absent pin leaves the chain untouched", () => {
    const entries = envChain(KEYS);
    expect(withPinnedEntry(entries, undefined)).toEqual(entries);
  });
});

describe("config preview", () => {
  test("lists every provider and marks the ones without a key", () => {
    const rungs = previewChain({ OPENAI_API_KEY: "sk" });
    expect(rungs.map((r) => r.provider)).toContain("gemini");
    expect(rungs.find((r) => r.provider === "gemini")?.available).toBe(false);
    expect(rungs.find((r) => r.provider === "openai")?.available).toBe(true);
  });

  test("agrees with the real chain on models and order", () => {
    const env = { ...KEYS, NVIDIA_DEFAULT_MODEL: "deepseek-ai/deepseek-r1" };
    const available = previewChain(env).filter((r) => r.available);
    expect(available.map((r) => r.id)).toEqual(envChain(env).map((e) => e.id));
  });
});
