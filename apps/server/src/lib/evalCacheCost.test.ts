/**
 * Перевірка формули вартості з кешем (`scripts/eval/cost.ts`). Числа тут не
 * довільні: вони мають збігатися з тим, що описано в
 * `src/modules/chat/promptCache.ts` § TTL — інакше колонка «з кешем» у звіті
 * стенду перетворюється на впевнено подану вигадку.
 */

import { describe, expect, it } from "vitest";

import {
  SESSION_LENGTHS,
  cachedPrefixMultiplier,
  sessionCostNoCache,
  sessionCostWithCache,
  splitPrefixTokens,
} from "../../scripts/eval/cost.js";

const price = { input: 3, output: 15 };

describe("вартість сесії з prompt-кешем", () => {
  it("множник префікса = 2 + 0.1·(N−1)", () => {
    expect(cachedPrefixMultiplier(1)).toBeCloseTo(2);
    expect(cachedPrefixMultiplier(3)).toBeCloseTo(2.2);
    expect(cachedPrefixMultiplier(20)).toBeCloseTo(3.9);
  });

  it("на одному повідомленні кеш ДОРОЖЧИЙ — це і є ціна запису", () => {
    // Рівність настає при N≈1.65 (promptCache.ts § TTL). Якщо цей асерт
    // колись стане зеленим навпаки — формулу зламали.
    const input = {
      prefixTokens: 10_000,
      freshTokens: 200,
      outputTokens: 300,
      price,
      messages: 1,
    };
    expect(sessionCostWithCache(input)).toBeGreaterThan(
      sessionCostNoCache(input),
    );
  });

  it("на довгій сесії кеш дає економію в рази", () => {
    const input = {
      prefixTokens: 10_583,
      freshTokens: 200,
      outputTokens: 300,
      price,
      messages: 20,
    };
    const plain = sessionCostNoCache(input);
    const cached = sessionCostWithCache(input);
    expect(cached).toBeLessThan(plain / 3);
  });

  it("таблиця йде по N = 1, 3, 5, 10, 20", () => {
    expect([...SESSION_LENGTHS]).toEqual([1, 3, 5, 10, 20]);
  });

  it("поділ входу на префікс і змінну частину зберігає суму", () => {
    const split = splitPrefixTokens(1000, "x".repeat(900), "y".repeat(100));
    expect(split.prefixTokens + split.freshTokens).toBe(1000);
    expect(split.prefixTokens).toBe(900);
  });
});
