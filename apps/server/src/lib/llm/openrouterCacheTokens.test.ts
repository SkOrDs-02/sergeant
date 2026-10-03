import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cache-токени нативного OpenRouter-шляху (`/chat/completions`).
 *
 * Джерело форми: OpenRouter docs, «Usage Accounting»
 * (https://openrouter.ai/docs/guides/guides/usage-accounting). Там
 * `usage.prompt_tokens_details` має `cached_tokens` (cache read) і
 * `cache_write_tokens` (cache write). УВАГА: на 2026-10-01 живу сторінку з
 * сесії агента відкрити не вдалося (мережевий fetch заборонено), тож форма
 * взята з памʼяті документації, а НЕ звірена дослівно. Перед покладанням на
 * числа звірити зі сторінкою або сирою відповіддю шлюзу. Числа у фікстурі
 * синтетичні (ілюстрація форми), не зняті з реального виклику.
 * `prompt_tokens` в OpenAI-стилі ВКЛЮЧАЄ кешовані токени.
 *
 * Нативний шлях не стрімить (`generate` - один `response.json()`), тож
 * агрегації стріму тут немає; злиття стріму живе в `chatStream.ts`.
 */

const toDb = vi.fn();

vi.mock("../../obs/metrics.js", () => ({
  aiTokensTotal: { inc: vi.fn() },
  aiCostEstimateUsd: { inc: vi.fn() },
  aiRequestsTotal: { inc: vi.fn() },
  llmProviderInvocationsTotal: { inc: vi.fn() },
}));
vi.mock("../../sentry.js", () => ({ Sentry: { addBreadcrumb: vi.fn() } }));
vi.mock("../anthropicUsageStore.js", () => ({
  ANTHROPIC_PROVIDER_SUBJECT: "provider:anthropic",
  recordAnthropicUsageToDb: toDb,
}));

const { OpenRouterProvider, parseOpenRouterCacheUsage } =
  await import("./provider.js");

async function run(usage: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "ок" } }], usage }),
    }),
  );
  return new OpenRouterProvider("k").generate({
    model: "z-ai/glm-5.2",
    maxTokens: 100,
    messages: [{ role: "user", content: "x" }],
    endpoint: "coach-insight",
  });
}

beforeEach(() => toDb.mockClear());
afterEach(() => vi.unstubAllGlobals());

describe("OpenRouter prompt_tokens_details -> леджер", () => {
  it("кладе cache_read і cache_creation в окремі поля без перехрещення", async () => {
    const r = await run({
      prompt_tokens: 1000,
      completion_tokens: 50,
      cost: 0.002,
      prompt_tokens_details: { cached_tokens: 700, cache_write_tokens: 200 },
    });

    expect(toDb.mock.calls[0]?.[1]).toMatchObject({
      input_tokens: 100, // 1000 - 700 - 200: без подвійного обліку
      output_tokens: 50,
      cache_read_input_tokens: 700,
      cache_creation_input_tokens: 200,
    });
    expect(r.ok && r.usage).toMatchObject({
      inputTokens: 1000,
      cacheReadInputTokens: 700,
      cacheCreationInputTokens: 200,
    });
  });

  it("лише cached_tokens: creation лишається 0", async () => {
    await run({
      prompt_tokens: 500,
      completion_tokens: 10,
      prompt_tokens_details: { cached_tokens: 400 },
    });
    expect(toDb.mock.calls[0]?.[1]).toMatchObject({
      input_tokens: 100,
      cache_read_input_tokens: 400,
      cache_creation_input_tokens: 0,
    });
  });

  it("без prompt_tokens_details усе 0 і без падіння", async () => {
    const r = await run({ prompt_tokens: 300, completion_tokens: 20 });
    expect(r.ok).toBe(true);
    expect(toDb.mock.calls[0]?.[1]).toMatchObject({
      input_tokens: 300,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
    expect(r.ok && r.usage?.cacheReadInputTokens).toBeUndefined();
  });

  it("prompt_tokens_details: null не валить виклик", async () => {
    const r = await run({
      prompt_tokens: 50,
      completion_tokens: 5,
      prompt_tokens_details: null,
    });
    expect(r.ok).toBe(true);
  });

  it("сміттєві значення дають 0", () => {
    expect(
      parseOpenRouterCacheUsage({
        prompt_tokens: 10,
        prompt_tokens_details: {
          cached_tokens: "x" as unknown as number,
          cache_write_tokens: -5,
        },
      }),
    ).toEqual({ cacheRead: 0, cacheCreation: 0, uncachedInput: 10 });
  });

  it("кеш більший за prompt_tokens не дає від'ємного input", () => {
    expect(
      parseOpenRouterCacheUsage({
        prompt_tokens: 10,
        prompt_tokens_details: { cached_tokens: 50 },
      }).uncachedInput,
    ).toBe(0);
  });
});
