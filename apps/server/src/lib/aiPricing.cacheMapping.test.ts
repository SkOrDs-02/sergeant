import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ф1 спеки `docs/work/specs/ai-cost-ceiling.md`: мапінг cache-токенів у
 * вартість і в леджер `ai_usage_daily`.
 *
 * Що саме тут зафіксовано і чому це не «вигадана форма»:
 *
 * 1. `ANTHROPIC_DIRECT_SMOKE` — реальний вимір з живим ключем Anthropic,
 *    записаний у `docs/start/instructions/enable-prompt-caching.md`
 *    («Observed smoke після tools breakpoint»): запит 1 `input=360
 *    cache_creation=12284 cache_read=0`, запит 2 `input=3 cache_creation=357
 *    cache_read=12284`. Це єдина в репо реальна відповідь з ненульовими
 *    cache-полями. Сімейство моделей у плейбуці — Sonnet (поріг 1024 токени),
 *    ціна однакова для всіх субверсій сімейства. Токени виходу в тому записі
 *    не наведені, тому їх тут немає.
 * 2. `GATEWAY_REPORTED_EQUAL` — НЕ дослівна відповідь. Це спостереження з
 *    ініціативи 0025, як його переказує спека (`cache_read` = `cache_creation`
 *    = 14 574, `input_tokens` = 0). Сирого payload-у в репо немає, тож тест
 *    перевіряє не «що каже шлюз», а властивість нашого коду: ми нічого не
 *    перемішуємо, і при `usage.cost` стеля бачить списані гроші, а не
 *    таблицю.
 *
 * Форма самих полів (`input_tokens`, `output_tokens`,
 * `cache_creation_input_tokens`, `cache_read_input_tokens`) — документація
 * Anthropic Messages API (prompt caching):
 * https://docs.claude.com/en/docs/build-with-claude/prompt-caching.
 * OpenRouter Anthropic-сумісний `/api/v1/messages` (його і викликає
 * `lib/anthropic.ts`) повторює ті самі імена полів плюс `cost`.
 */

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("../db.js", () => ({
  default: { query: queryMock },
  pool: { query: queryMock },
  query: queryMock,
  // RLS-контекст прозорий: `fn` отримує той самий мок, SQL-виклики не міняються.
  withSubjectContext: (_subject: string, fn: (db: unknown) => unknown) =>
    fn({ query: queryMock }),
}));

vi.mock("../obs/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { estimateAnthropicCostUsd, pickAnthropicPricing } from "./aiPricing.js";
import { recordAnthropicUsageToDb } from "./anthropicUsageStore.js";

const SONNET = "claude-sonnet-4-5";
const SONNET_PRICE = { input: 3.0, cacheWrite: 3.75, cacheRead: 0.3 };

/** Реальний вимір прямого Anthropic (enable-prompt-caching.md). */
const ANTHROPIC_DIRECT_SMOKE = {
  request1: {
    input_tokens: 360,
    cache_creation_input_tokens: 12_284,
    cache_read_input_tokens: 0,
  },
  request2: {
    input_tokens: 3,
    cache_creation_input_tokens: 357,
    cache_read_input_tokens: 12_284,
  },
} as const;

/** Переказане спостереження 0025, не дослівний payload (див. шапку). */
const GATEWAY_REPORTED_EQUAL = {
  input_tokens: 0,
  cache_creation_input_tokens: 14_574,
  cache_read_input_tokens: 14_574,
} as const;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rowCount: 1 });
});

describe("таблиця цін тримає Anthropic-співвідношення кешу", () => {
  it("sonnet: запис 1.25x input, читання 0.10x input", () => {
    const p = pickAnthropicPricing(SONNET)!;
    expect(p.cacheWrite).toBeCloseTo(p.input * 1.25, 6);
    expect(p.cacheRead).toBeCloseTo(p.input * 0.1, 6);
  });
});

describe("прямий Anthropic: cache_creation і cache_read не змішуються", () => {
  it("запит 1 (холодний кеш): весь кеш рахується як запис", () => {
    const usd = estimateAnthropicCostUsd(
      SONNET,
      ANTHROPIC_DIRECT_SMOKE.request1,
    )!;
    const expected =
      (360 * SONNET_PRICE.input + 12_284 * SONNET_PRICE.cacheWrite) / 1e6;
    expect(usd).toBeCloseTo(expected, 9);
  });

  it("запит 2 (теплий кеш): 12 284 токени рахуються як читання, 357 як запис", () => {
    const usd = estimateAnthropicCostUsd(
      SONNET,
      ANTHROPIC_DIRECT_SMOKE.request2,
    )!;
    const expected =
      (3 * SONNET_PRICE.input +
        357 * SONNET_PRICE.cacheWrite +
        12_284 * SONNET_PRICE.cacheRead) /
      1e6;
    expect(usd).toBeCloseTo(expected, 9);
    // Теплий запит дешевший за холодний при тому самому префіксі: саме це
    // й має давати кеш. Якби поля переплутали, було б навпаки.
    const cold = estimateAnthropicCostUsd(
      SONNET,
      ANTHROPIC_DIRECT_SMOKE.request1,
    )!;
    expect(usd).toBeLessThan(cold / 5);
  });

  it("леджер пише cache_read і cache_creation в окремі колонки без перехрещення", async () => {
    await recordAnthropicUsageToDb(
      SONNET,
      ANTHROPIC_DIRECT_SMOKE.request2,
      undefined,
      "chat",
    );
    const [, params] = queryMock.mock.calls[0]!;
    // [3] input-колонка = input + cache_read + cache_write (writer-семантика)
    expect(params![3]).toBe(3 + 12_284 + 357);
    expect(params![7]).toBe("chat"); // endpoint
    expect(params![8]).toBe(12_284); // cache_read_tokens
    expect(params![9]).toBe(357); // cache_creation_tokens
    expect(params![8]).not.toBe(params![9]);
  });
});

describe("шлюз прислав рівні cache_read і cache_creation (спостереження 0025)", () => {
  it("розкид таблиці між двома прочитаннями цих полів ~12.5x, тож таблиця не може бути джерелом стелі", () => {
    const asWrite = estimateAnthropicCostUsd(SONNET, {
      cache_creation_input_tokens: 14_574,
    })!;
    const asRead = estimateAnthropicCostUsd(SONNET, {
      cache_read_input_tokens: 14_574,
    })!;
    expect(asWrite / asRead).toBeCloseTo(12.5, 6);
  });

  it("`usage.cost` від шлюзу перемагає таблицю, що б не лежало в cache-полях", () => {
    const actual = 0.0123;
    const usd = estimateAnthropicCostUsd(SONNET, {
      ...GATEWAY_REPORTED_EQUAL,
      cost: actual,
    });
    expect(usd).toBe(actual);
  });

  it("леджер зберігає токени як прийшли, а списану суму пише окремо від таблиці", async () => {
    const actual = 0.0123;
    await recordAnthropicUsageToDb(
      SONNET,
      { ...GATEWAY_REPORTED_EQUAL, cost: actual },
      "user-1",
      "chat-stream",
      actual,
    );
    // два рядки: provider-aggregate і u:<userId>
    expect(queryMock).toHaveBeenCalledTimes(2);
    for (const [, params] of queryMock.mock.calls) {
      expect(params![8]).toBe(14_574); // cache_read_tokens
      expect(params![9]).toBe(14_574); // cache_creation_tokens
      expect(params![10]).toBe(actual); // actual_cost_usd
      // est_cost_usd тут дорівнює списаній сумі, бо estimateAnthropicCostUsd
      // бере cost першим. Це не незалежна оцінка таблиці.
      expect(params![6]).toBe(actual);
    }
  });
});
