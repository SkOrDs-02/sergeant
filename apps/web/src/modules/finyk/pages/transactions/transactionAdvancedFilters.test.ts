import { describe, it, expect } from "vitest";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { CASH_ACCOUNT_ID } from "@sergeant/finyk-domain/constants";
import { NO_ACCOUNT_KEY } from "@sergeant/finyk-domain/domain/accountBreakdown";
import {
  EMPTY_TX_ADVANCED_FILTERS,
  countActiveAdvancedFilters,
  filterTransactionsByAdvanced,
  listAccountKeys,
  listTagOptions,
  parseAmountBound,
  TX_AMOUNT_PRESETS,
  formatTxAmountPresetLabel,
  matchTxAmountPreset,
  type TxAdvancedFilters,
} from "./transactionAdvancedFilters";

function tx(
  id: string,
  amount: number,
  extra: Partial<Transaction> = {},
): Transaction {
  return { id, description: id, amount, time: 1, ...extra } as Transaction;
}

const list = [
  tx("b1", -5_000, { _accountId: "card-1" }),
  tx("b2", -150_000, { _accountId: "card-1" }),
  tx("b3", 4_000_000, { _accountId: "card-2" }),
  tx("manual_m1", -30_000, { _accountId: CASH_ACCOUNT_ID }),
  tx("manual_m2", -12_000),
];

const tags = {
  b1: ["Кава"],
  manual_m1: ["кава", "Робота"],
  b2: ["Ремонт"],
};

function f(over: Partial<TxAdvancedFilters>): TxAdvancedFilters {
  return { ...EMPTY_TX_ADVANCED_FILTERS, ...over };
}

describe("filterTransactionsByAdvanced", () => {
  it("без фільтрів повертає той самий масив", () => {
    expect(
      filterTransactionsByAdvanced(list, EMPTY_TX_ADVANCED_FILTERS, tags),
    ).toBe(list);
  });

  it("сума «від / до» в копійках за модулем, межі включно", () => {
    const res = filterTransactionsByAdvanced(
      list,
      f({ minKop: 12_000, maxKop: 150_000 }),
      tags,
    );
    expect(res.map((t) => t.id)).toEqual(["b2", "manual_m1", "manual_m2"]);
  });

  it("лише «від» ловить і надходження за модулем суми", () => {
    const res = filterTransactionsByAdvanced(
      list,
      f({ minKop: 1_000_000 }),
      tags,
    );
    expect(res.map((t) => t.id)).toEqual(["b3"]);
  });

  it("рахунок: картка, готівка і «Без рахунку»", () => {
    expect(
      filterTransactionsByAdvanced(list, f({ accountKey: "card-1" }), tags).map(
        (t) => t.id,
      ),
    ).toEqual(["b1", "b2"]);
    expect(
      filterTransactionsByAdvanced(
        list,
        f({ accountKey: NO_ACCOUNT_KEY }),
        tags,
      ).map((t) => t.id),
    ).toEqual(["manual_m2"]);
  });

  it("тег без регістру, разом із сумою як «і»", () => {
    const res = filterTransactionsByAdvanced(
      list,
      f({ tagKey: "кава", minKop: 10_000 }),
      tags,
    );
    expect(res.map((t) => t.id)).toEqual(["manual_m1"]);
  });

  it("нічого не підходить: порожній список", () => {
    expect(
      filterTransactionsByAdvanced(list, f({ tagKey: "відпустка" }), tags),
    ).toEqual([]);
  });
});

describe("countActiveAdvancedFilters", () => {
  it("сума «від / до» рахується одним фільтром", () => {
    expect(countActiveAdvancedFilters(EMPTY_TX_ADVANCED_FILTERS)).toBe(0);
    expect(countActiveAdvancedFilters(f({ minKop: 1, maxKop: 2 }))).toBe(1);
    expect(
      countActiveAdvancedFilters(
        f({ maxKop: 2, accountKey: "card-1", tagKey: "кава" }),
      ),
    ).toBe(3);
  });
});

describe("parseAmountBound", () => {
  it("порожнє поле знімає межу", () => {
    expect(parseAmountBound("  ")).toEqual({ ok: true, minor: null });
  });

  it("гривні з комою і пробілами переводить у копійки", () => {
    expect(parseAmountBound("1 000,5")).toEqual({ ok: true, minor: 100_050 });
  });

  it("не число дає помилку", () => {
    expect(parseAmountBound("abc").ok).toBe(false);
  });
});

describe("опції аркуша", () => {
  it("рахунки місяця за кількістю операцій, обраний лишається", () => {
    expect(listAccountKeys(list, null)).toEqual([
      "card-1",
      "card-2",
      CASH_ACCOUNT_ID,
      NO_ACCOUNT_KEY,
    ]);
    expect(listAccountKeys(list.slice(0, 2), "card-9")).toEqual([
      "card-1",
      "card-9",
    ]);
  });

  it("теги лише з операцій місяця, від частіших", () => {
    const opts = listTagOptions(list.slice(0, 4), tags, null);
    expect(opts.map((o) => o.key)).toEqual(["кава", "ремонт", "робота"]);
    expect(opts[0]?.label).toBe("Кава");
  });
});

describe("пресети суми (рішення власника 2026-11-19)", () => {
  it("чотири фіксовані межі в копійках", () => {
    expect(TX_AMOUNT_PRESETS.map((p) => [p.id, p.minKop, p.maxKop])).toEqual([
      ["upTo100", null, 10_000],
      ["from100to500", 10_000, 50_000],
      ["from500to1000", 50_000, 100_000],
      ["over1000", 100_000, null],
    ]);
  });

  it("matchTxAmountPreset упізнає пресет лише за точним збігом обох меж", () => {
    expect(matchTxAmountPreset(null, 10_000)).toBe("upTo100");
    expect(matchTxAmountPreset(50_000, 100_000)).toBe("from500to1000");
    expect(matchTxAmountPreset(100_000, null)).toBe("over1000");
    expect(matchTxAmountPreset(10_000, 60_000)).toBeNull();
    expect(matchTxAmountPreset(null, null)).toBeNull();
  });

  it("операція рівно на межі (500 ₴) не зникає з жодного сусіднього пресету", () => {
    const list = [tx("a", -50_000)];
    for (const id of ["from100to500", "from500to1000"] as const) {
      const p = TX_AMOUNT_PRESETS.find((x) => x.id === id)!;
      expect(
        filterTransactionsByAdvanced(
          list,
          { ...EMPTY_TX_ADVANCED_FILTERS, minKop: p.minKop, maxKop: p.maxKop },
          undefined,
        ),
      ).toHaveLength(1);
    }
  });

  it("підпис іде через форматування грошей", () => {
    expect(
      TX_AMOUNT_PRESETS.map((p) =>
        formatTxAmountPresetLabel(p).replace(/\s/g, " "),
      ),
    ).toEqual(["до 100 ₴", "100–500 ₴", "500–1 000 ₴", "понад 1 000 ₴"]);
  });
});
