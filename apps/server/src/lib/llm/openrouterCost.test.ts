import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Облік вартості нативного OpenRouter-шляху.
 *
 * До цього коуч, дайджест, харчові тексти, класифікація й mono ходили через
 * `getLLMProvider` → `OpenRouterProvider` і не інкрементили НІЧОГО: ні
 * `ai_tokens_total`, ні `ai_cost_estimate_usd_total`. Наслідок був не
 * косметичний — `anthropicBudgetGuard` сумує саме цей лічильник, тож денна
 * стеля витрат цих конвеєрів не бачила взагалі.
 */

const incTokens = vi.fn();
const incCost = vi.fn();

vi.mock("../../obs/metrics.js", () => ({
  aiTokensTotal: { inc: incTokens },
  aiCostEstimateUsd: { inc: incCost },
  llmProviderInvocationsTotal: { inc: vi.fn() },
}));

vi.mock("../../sentry.js", () => ({
  Sentry: { addBreadcrumb: vi.fn() },
}));

const { OpenRouterProvider } = await import("./provider.js");

function mockGateway(usage: Record<string, number>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: "ок" } }],
      usage,
    }),
  });
}

beforeEach(() => {
  incTokens.mockClear();
  incCost.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenRouterProvider — облік вартості", () => {
  it("пише токени й реальну вартість зі шлюзу", async () => {
    vi.stubGlobal(
      "fetch",
      mockGateway({
        prompt_tokens: 1200,
        completion_tokens: 300,
        cost: 0.0042,
      }),
    );

    await new OpenRouterProvider("k").generate({
      model: "openai/gpt-5.1",
      maxTokens: 500,
      messages: [{ role: "user", content: "привіт" }],
      endpoint: "coach-insight",
    });

    const kinds = incTokens.mock.calls.map((c) => c[0].kind);
    expect(kinds).toContain("prompt");
    expect(kinds).toContain("completion");

    expect(incCost).toHaveBeenCalledTimes(1);
    // `usage.cost` — факт списання, він має перемогти прайс-таблицю.
    expect(incCost.mock.calls[0]?.[1]).toBeCloseTo(0.0042, 6);
  });

  it("лейбл provider=anthropic — інакше стеля витрат цього не побачить", async () => {
    // `anthropicBudgetGuard` сумує рівно provider="anthropic". Будь-яке інше
    // значення лишило б витрату поза денним порогом.
    vi.stubGlobal(
      "fetch",
      mockGateway({ prompt_tokens: 10, completion_tokens: 5, cost: 0.001 }),
    );

    await new OpenRouterProvider("k").generate({
      model: "z-ai/glm-5.2",
      maxTokens: 100,
      messages: [{ role: "user", content: "x" }],
      endpoint: "day-plan",
    });

    expect(incCost.mock.calls[0]?.[0]).toMatchObject({
      provider: "anthropic",
      model: "z-ai/glm-5.2",
      endpoint: "day-plan",
    });
  });

  it("просить шлюз повернути cost — без цього прапорця його не буде", async () => {
    const f = mockGateway({ prompt_tokens: 1, completion_tokens: 1 });
    vi.stubGlobal("fetch", f);

    await new OpenRouterProvider("k").generate({
      model: "google/gemini-2.5-flash-lite",
      maxTokens: 10,
      messages: [{ role: "user", content: "x" }],
      endpoint: "parse-pantry",
    });

    const body = JSON.parse(String(f.mock.calls[0]?.[1]?.body));
    expect(body.usage).toEqual({ include: true });
  });

  it("невідома модель без cost — токени є, вартості немає", async () => {
    // Краще «невідомо», ніж «0$ — все добре»: нуль у лічильнику вартості
    // читався б як безкоштовний виклик і занижував би стелю.
    vi.stubGlobal(
      "fetch",
      mockGateway({ prompt_tokens: 100, completion_tokens: 20 }),
    );

    await new OpenRouterProvider("k").generate({
      model: "z-ai/glm-5.2",
      maxTokens: 100,
      messages: [{ role: "user", content: "x" }],
      endpoint: "week-plan",
    });

    expect(incTokens).toHaveBeenCalled();
    expect(incCost).not.toHaveBeenCalled();
  });

  it("невдалий виклик нічого не інкрементить", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: "rate limited" } }),
      }),
    );

    const r = await new OpenRouterProvider("k").generate({
      model: "openai/gpt-5.1",
      maxTokens: 10,
      messages: [{ role: "user", content: "x" }],
      endpoint: "coach-insight",
    });

    expect(r.ok).toBe(false);
    expect(incTokens).not.toHaveBeenCalled();
    expect(incCost).not.toHaveBeenCalled();
  });
});
