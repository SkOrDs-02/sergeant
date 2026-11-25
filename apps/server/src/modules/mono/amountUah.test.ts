import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("../../db.js", () => ({ query: vi.fn() }));
vi.mock("../../obs/logger.js", () => ({ logger: { warn: vi.fn() } }));
const getNbuRates = vi.hoisted(() => vi.fn());
vi.mock("../fx/nbuRate.js", () => ({
  getNbuRates,
  nbuRateKey: (code: number, date: string) => `${code}:${date}`,
}));

import { query as _query } from "../../db.js";
import { computeAmountUah, fillMissingAmountUah } from "./amountUah.js";

const queryMock = _query as unknown as Mock;

beforeEach(() => {
  queryMock.mockReset();
  getNbuRates.mockReset();
});

describe("computeAmountUah", () => {
  const usd = { accountCurrencyCode: 840 };

  it("uses operationAmount for a UAH operation on a foreign card, no rate needed", () => {
    expect(
      computeAmountUah(
        { ...usd, amount: -250, operationAmount: -10_000, currencyCode: 980 },
        null,
      ),
    ).toBe(-10_000);
  });

  it("converts the account amount at the NBU rate", () => {
    expect(
      computeAmountUah(
        {
          ...usd,
          amount: -10_000,
          operationAmount: -10_000,
          currencyCode: 840,
        },
        41.5,
      ),
    ).toBe(-415_000);
    // EUR-покупка з USD-картки: рахуємо суму РАХУНКУ за курсом його валюти.
    expect(
      computeAmountUah(
        { ...usd, amount: -1_099, operationAmount: -1_000, currencyCode: 978 },
        41.5,
      ),
    ).toBe(Math.round(-1_099 * 41.5));
  });

  it("never substitutes the foreign number as hryvnias without a rate", () => {
    expect(
      computeAmountUah(
        {
          ...usd,
          amount: -10_000,
          operationAmount: -10_000,
          currencyCode: 840,
        },
        null,
      ),
    ).toBeNull();
  });

  it("does not convert an account of unknown currency (stub code 0)", () => {
    expect(
      computeAmountUah(
        {
          accountCurrencyCode: 0,
          amount: -10,
          operationAmount: -10,
          currencyCode: 840,
        },
        41.5,
      ),
    ).toBeNull();
  });
});

describe("fillMissingAmountUah", () => {
  it("writes amount_uah for rows it can price and leaves the rest NULL", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          mono_tx_id: "usd-buy",
          time: new Date("2026-11-24T10:00:00Z"),
          amount: "-10000",
          operation_amount: "-10000",
          currency_code: 840,
          account_currency_code: 840,
        },
        {
          mono_tx_id: "uah-op",
          time: new Date("2026-11-24T11:00:00Z"),
          amount: "-250",
          operation_amount: "-10000",
          currency_code: 980,
          account_currency_code: 840,
        },
        {
          mono_tx_id: "no-rate",
          time: new Date("2026-11-20T11:00:00Z"),
          amount: "-500",
          operation_amount: "-500",
          currency_code: 840,
          account_currency_code: 840,
        },
      ],
    });
    getNbuRates.mockResolvedValueOnce(
      new Map([
        ["840:2026-11-24", { uahPerUnit: 41.5, sourceDate: "2026-11-24" }],
      ]),
    );
    queryMock.mockResolvedValueOnce({ rows: [] });

    await fillMissingAmountUah("user_1");

    expect(getNbuRates.mock.calls[0]![0]).toEqual([
      { currencyCode: 840, date: "2026-11-24" },
      { currencyCode: 840, date: "2026-11-20" },
    ]);
    const update = queryMock.mock.calls[1]!;
    expect(update[0]).toContain("AND t.amount_uah IS NULL");
    expect(update[1]).toEqual([
      "user_1",
      ["usd-buy", "uah-op"],
      [-415_000, -10_000],
    ]);
  });

  it("uses the Kyiv date of the operation", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          mono_tx_id: "late",
          // 23:30 UTC = 01:30 наступного дня в Києві.
          time: new Date("2026-11-23T23:30:00Z"),
          amount: "-100",
          operation_amount: "-100",
          currency_code: 840,
          account_currency_code: 840,
        },
      ],
    });
    getNbuRates.mockResolvedValueOnce(new Map());
    await fillMissingAmountUah("user_1");
    expect(getNbuRates.mock.calls[0]![0]).toEqual([
      { currencyCode: 840, date: "2026-11-24" },
    ]);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("swallows failures", async () => {
    queryMock.mockRejectedValueOnce(new Error("db down"));
    await expect(fillMissingAmountUah("user_1")).resolves.toBeUndefined();
  });
});
