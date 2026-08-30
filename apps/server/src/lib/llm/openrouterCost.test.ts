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
const incRequests = vi.fn();
const toDb = vi.fn();

vi.mock("../../obs/metrics.js", () => ({
  aiTokensTotal: { inc: incTokens },
  aiCostEstimateUsd: { inc: incCost },
  aiRequestsTotal: { inc: incRequests },
  llmProviderInvocationsTotal: { inc: vi.fn() },
}));

vi.mock("../../sentry.js", () => ({
  Sentry: { addBreadcrumb: vi.fn() },
}));

vi.mock("../anthropicUsageStore.js", () => ({
  ANTHROPIC_PROVIDER_SUBJECT: "provider:anthropic",
  recordAnthropicUsageToDb: toDb,
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
  incRequests.mockClear();
  toDb.mockClear();
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

    // Лічильник викликів — разом із рештою. Інакше $/виклик доводиться
    // рахувати то через `ai_requests_total`, то через провайдерський.
    expect(incRequests).toHaveBeenCalledTimes(1);
    expect(incRequests.mock.calls[0]?.[0]).toMatchObject({
      endpoint: "coach-insight",
      outcome: "ok",
    });
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
    //
    // Модель нижче навмисно не з реального каталогу (`z-ai/glm-5.2` стояв
    // тут раніше, доки B38 не додав йому pricing-entry в `aiPricing.ts` —
    // тест почав фейлити, бо перестав бути "невідомою моделлю").
    vi.stubGlobal(
      "fetch",
      mockGateway({ prompt_tokens: 100, completion_tokens: 20 }),
    );

    await new OpenRouterProvider("k").generate({
      model: "some-vendor/definitely-not-in-pricing-table",
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

/**
 * Лічильники вище живуть у памʼяті процесу й починаються з нуля на кожному
 * деплої. Поки цей шлях не писав у `ai_usage_daily`, витрати коуча,
 * дайджесту й readonly не переживали жодного рестарту — а денна стеля
 * `anthropicBudgetGuard` читає тепер саме той леджер.
 */
describe("OpenRouterProvider — persistent-леджер", () => {
  it("пише виклик у ai_usage_daily разом з ендпоінтом і фактом списання", async () => {
    vi.stubGlobal(
      "fetch",
      mockGateway({ prompt_tokens: 900, completion_tokens: 120, cost: 0.0031 }),
    );

    await new OpenRouterProvider("k").generate({
      model: "openai/gpt-5.1",
      maxTokens: 300,
      messages: [{ role: "user", content: "привіт" }],
      endpoint: "coach-insight",
      userId: "u_42",
    });

    expect(toDb).toHaveBeenCalledTimes(1);
    const [model, usage, userId, endpoint, actualCost] = toDb.mock.calls[0]!;
    expect(model).toBe("openai/gpt-5.1");
    expect(usage).toMatchObject({ input_tokens: 900, output_tokens: 120 });
    expect(userId).toBe("u_42");
    // Без ендпоінта леджер склав би всі конвеєри в один рядок, і питання
    // «скільки коштує коуч проти чату» знову лишилось би лише за
    // лічильником у памʼяті.
    expect(endpoint).toBe("coach-insight");
    expect(actualCost).toBeCloseTo(0.0031, 6);
  });

  it("без cost від шлюзу actual лишається порожнім, а не нулем", async () => {
    // Нуль читався б як «безкоштовний виклик» і занижував би стелю;
    // `undefined` означає «беремо оцінку за прайс-таблицею».
    vi.stubGlobal(
      "fetch",
      mockGateway({ prompt_tokens: 10, completion_tokens: 5 }),
    );

    await new OpenRouterProvider("k").generate({
      model: "z-ai/glm-5.2",
      maxTokens: 100,
      messages: [{ role: "user", content: "x" }],
      endpoint: "day-plan",
    });

    expect(toDb.mock.calls[0]?.[4]).toBeUndefined();
  });

  it("невдалий виклик у леджер не пише", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: "boom" } }),
      }),
    );

    await new OpenRouterProvider("k").generate({
      model: "openai/gpt-5.1",
      maxTokens: 10,
      messages: [{ role: "user", content: "x" }],
      endpoint: "coach-insight",
    });

    expect(toDb).not.toHaveBeenCalled();
  });
});
