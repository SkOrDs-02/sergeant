import { describe, expect, it } from "vitest";
import {
  foreignAccountCurrencyCode,
  isForeignAccountTx,
} from "./foreignAccountTx";
import { buildFinykExcludedTxIds } from "./metrics";
import { normalizeTransaction } from "../domain/transactions";

describe("foreignAccountCurrencyCode", () => {
  it("переказ у доларах з USD-картки: рахунок USD", () => {
    expect(
      foreignAccountCurrencyCode({
        amount: -10_000,
        operationAmount: -10_000,
        currencyCode: 840,
      }),
    ).toBe(840);
  });

  it("гривнева операція з USD-картки (суми різні): рахунок не гривневий", () => {
    expect(
      foreignAccountCurrencyCode({
        amount: -2400,
        operationAmount: -100_000,
        currencyCode: 980,
      }),
    ).toBe(0);
  });

  it("гривнева операція з гривневої картки: null", () => {
    expect(
      foreignAccountCurrencyCode({
        amount: -5000,
        operationAmount: -5000,
        currencyCode: 980,
      }),
    ).toBeNull();
  });

  it("валютна покупка гривневою карткою: не чужий рахунок", () => {
    expect(
      isForeignAccountTx({
        amount: -415_000,
        operationAmount: -10_000,
        currencyCode: 840,
      }),
    ).toBe(false);
  });

  it("ручні записи без валюти: null", () => {
    expect(isForeignAccountTx({ amount: -5000 })).toBe(false);
    expect(isForeignAccountTx(null)).toBe(false);
  });
});

describe("normalizeTransaction + excluded-set", () => {
  const usd = normalizeTransaction(
    {
      id: "usd1",
      time: 1_700_000_000,
      amount: -10_000,
      operationAmount: -10_000,
      currencyCode: 840,
    },
    { source: "monobank", accountId: "acc-usd" },
  );

  it("зберігає валюту операції й суму в ній", () => {
    expect(usd["currencyCode"]).toBe(840);
    expect(usd["operationAmount"]).toBe(-10_000);
  });

  it("операція USD-рахунку входить в excluded-set, гривнева ні", () => {
    const uah = normalizeTransaction(
      {
        id: "uah1",
        time: 1_700_000_000,
        amount: -5000,
        operationAmount: -5000,
        currencyCode: 980,
      },
      { source: "monobank", accountId: "acc-uah" },
    );
    const out = buildFinykExcludedTxIds({ transactions: [usd, uah] });
    expect(out.has("usd1")).toBe(true);
    expect(out.has("uah1")).toBe(false);
  });
});
