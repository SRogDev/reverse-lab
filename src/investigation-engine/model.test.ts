/**
 * Model provider tests.
 *
 * - ScriptedModelProvider: deterministic canned outputs for tests/demo,
 *   honestly labeled as scripted.
 * - AIGatewayProvider: fails honestly when AI_GATEWAY_API_KEY (or the model
 *   id) is not configured — the live path needs a real key and is not
 *   exercised here.
 */
import { afterEach, describe, expect, it } from "vitest";
import { AIGatewayProvider, ScriptedModelProvider } from "./model";

const SAVED_API_KEY = process.env.AI_GATEWAY_API_KEY;
const SAVED_MODEL = process.env.AI_GATEWAY_MODEL;

afterEach(() => {
  if (SAVED_API_KEY === undefined) {
    delete process.env.AI_GATEWAY_API_KEY;
  } else {
    process.env.AI_GATEWAY_API_KEY = SAVED_API_KEY;
  }
  if (SAVED_MODEL === undefined) {
    delete process.env.AI_GATEWAY_MODEL;
  } else {
    process.env.AI_GATEWAY_MODEL = SAVED_MODEL;
  }
});

describe("ScriptedModelProvider", () => {
  it("returns the canned response whose key appears in the prompt", async () => {
    const provider = new ScriptedModelProvider({
      ttl: "TTL is implemented with lazy expiry on read.",
    });
    const text = await provider.complete(
      "Explain the ttl mechanism in mini-kv.",
    );
    expect(text).toContain("lazy expiry");
  });

  it("returns the fallback for unmatched prompts", async () => {
    const provider = new ScriptedModelProvider(
      { ttl: "TTL canned" },
      "no scripted response for this prompt",
    );
    const text = await provider.complete("something unrelated");
    expect(text).toBe("no scripted response for this prompt");
  });

  it("labels itself as scripted, never as a real model", () => {
    const provider = new ScriptedModelProvider({});
    expect(provider.providerLabel).toMatch(/scripted/i);
    expect(provider.providerLabel).not.toMatch(/\bgpt\b|\bclaude\b/i);
  });
});

describe("AIGatewayProvider", () => {
  it("throws an honest not-configured error when the API key is missing", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    const provider = new AIGatewayProvider({ modelId: "some/model" });
    await expect(provider.complete("hello")).rejects.toThrow(
      /AI Gateway not configured/i,
    );
  });

  it("throws when no model id is available", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key-not-real";
    delete process.env.AI_GATEWAY_MODEL;
    const provider = new AIGatewayProvider();
    await expect(provider.complete("hello")).rejects.toThrow(/model/i);
  });

  it("prefers the explicit model id over the env var", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    const provider = new AIGatewayProvider({ modelId: "explicit/model" });
    expect(provider.modelId).toBe("explicit/model");
  });
});
