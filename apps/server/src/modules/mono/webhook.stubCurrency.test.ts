import { describe, expect, it, vi } from "vitest";

// webhook.ts тягне пул БД і метрики на імпорті; для чистої функції вони зайві.
vi.mock("../../db.js", () => ({ pool: {}, query: vi.fn() }));

import { stubAccountCurrencyCode } from "./webhook.js";

describe("stubAccountCurrencyCode", () => {
  it("покупка в гривні доларовою карткою: stub не гривневий (було 980)", () => {
    expect(
      stubAccountCurrencyCode({
        amount: -2400,
        operationAmount: -100_000,
        currencyCode: 980,
      }),
    ).not.toBe(980);
  });

  it("однакові суми: валюта рахунку = валюта операції", () => {
    expect(
      stubAccountCurrencyCode({
        amount: -10_000,
        operationAmount: -10_000,
        currencyCode: 840,
      }),
    ).toBe(840);
    expect(
      stubAccountCurrencyCode({
        amount: -5000,
        operationAmount: -5000,
        currencyCode: 980,
      }),
    ).toBe(980);
  });

  it("валютна покупка гривневою карткою: stub лишається гривневим", () => {
    expect(
      stubAccountCurrencyCode({
        amount: -415_000,
        operationAmount: -10_000,
        currencyCode: 840,
      }),
    ).toBe(980);
  });
});
