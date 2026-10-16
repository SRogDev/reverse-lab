/**
 * Model provider abstraction for the investigation engine.
 *
 * The engine never calls an LLM directly; it goes through `ModelProvider`.
 * Two implementations:
 * - `ScriptedModelProvider`: deterministic canned outputs for tests and the
 *   zero-key demo. Honestly labeled — never presented as a real model.
 * - `AIGatewayProvider`: real calls through Vercel AI Gateway using ONLY
 *   exports verified against the installed packages (checked 2026-10-16):
 *   - `ai@7.0.142`: `generateText` (function), `stepCountIs` (function).
 *     `Agent` and `createGatewayProvider` do NOT exist in v7 — they are
 *     deliberately not used.
 *   - `@ai-sdk/gateway` (installed as a direct dependency): `createGateway`
 *     (function) with `{ apiKey }` settings; the provider exposes
 *     `.chat(modelId)` returning a LanguageModelV4.
 *   - The stop condition is the `stopWhen` OPTION of `generateText`
 *     (there is no standalone `stopWhen` export in v7).
 *
 * The `ai` packages are loaded with dynamic `import()` inside `complete()`
 * so they are never loaded — and never bundled into the hot path — unless
 * a key is actually configured. When no key is configured the provider
 * fails with an honest error pointing at `.env.example`.
 */

export interface ModelProvider {
  /** Human-readable label, recorded in provenance wherever output is used. */
  readonly providerLabel: string;
  complete(prompt: string): Promise<string>;
}

/**
 * Deterministic canned responses for tests and the zero-key demo.
 * Keys are matched by case-insensitive substring against the prompt.
 */
export class ScriptedModelProvider implements ModelProvider {
  readonly providerLabel =
    "scripted (deterministic canned output — not a real model)";

  constructor(
    private readonly scripts: Record<string, string>,
    private readonly fallback = "no scripted response for this prompt",
  ) {}

  async complete(prompt: string): Promise<string> {
    const lowered = prompt.toLowerCase();
    for (const [key, response] of Object.entries(this.scripts)) {
      if (lowered.includes(key.toLowerCase())) {
        return response;
      }
    }
    return this.fallback;
  }
}

const NOT_CONFIGURED =
  "AI Gateway not configured — set AI_GATEWAY_API_KEY (see .env.example)";

/**
 * Real model calls through Vercel AI Gateway. Throws honestly until
 * AI_GATEWAY_API_KEY is set and a model id is known (constructor arg or
 * AI_GATEWAY_MODEL). No default model id is invented: the caller must name
 * a real Gateway model (e.g. an `openai/...` id from the AI Gateway docs).
 */
export class AIGatewayProvider implements ModelProvider {
  readonly providerLabel = "ai-gateway (vercel ai gateway)";
  readonly modelId: string;

  constructor(opts?: { modelId?: string }) {
    this.modelId = opts?.modelId ?? process.env.AI_GATEWAY_MODEL ?? "";
  }

  async complete(prompt: string): Promise<string> {
    const apiKey = process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) {
      throw new Error(NOT_CONFIGURED);
    }
    if (!this.modelId) {
      throw new Error(
        "AI Gateway model not configured — pass modelId or set AI_GATEWAY_MODEL",
      );
    }
    // Dynamic imports: verified exports only (see module docstring).
    const { generateText, stepCountIs } = await import("ai");
    const { createGateway } = await import("@ai-sdk/gateway");
    const provider = createGateway({ apiKey });
    const result = await generateText({
      model: provider.chat(this.modelId),
      prompt,
      stopWhen: stepCountIs(1),
    });
    return result.text;
  }
}
