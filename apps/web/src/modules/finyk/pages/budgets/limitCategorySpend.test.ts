/**
 * Регресія QA 2026-08-23: щойно створений ліміт показував 0 / 2000 попри
 * витрати, які вже лежали в тому ж місяці. Причина — не вікно дат і не
 * момент створення бюджету, а два різні словники категорій: ліміт бере id
 * з MCC-каталогу, ручна витрата — з детальнішої ручної таксономії, де
 * `groceries → food`, `cafe → restaurant`, `tech → shopping`.
 *
 * Кожен кейс НАВМИСНО сіє транзакції ДО «створення» бюджету — саме той
 * порядок, у якому баг видно.
 */
import { describe, it, expect } from "vitest";
import {
  calcLimitCategoryBreakdown,
  calcLimitCategorySpent,
  categoryBucketIds,
} from "./limitCategorySpend";
import { manualExpenseToTransaction } from "@sergeant/finyk-domain/domain/transactions";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

function manual(
  id: string,
  amountUah: number,
  category: string,
  date = "2026-06-10",
): Transaction {
  return manualExpenseToTransaction({
    id,
    amount: amountUah,
    date,
    description: `витрата ${id}`,
    category,
  } as never);
}

function bank(
  id: string,
  amountMinor: number,
  description: string,
  mcc: number,
): Transaction {
  return {
    id,
    amount: amountMinor,
    time: Math.floor(new Date("2026-06-10T09:00:00Z").getTime() / 1000),
    description,
    mcc,
  } as unknown as Transaction;
}

describe("categoryBucketIds", () => {
  it("folds the manual-only slugs into their MCC bucket", () => {
    expect([...categoryBucketIds("food")].sort()).toEqual([
      "food",
      "groceries",
    ]);
    expect([...categoryBucketIds("restaurant")].sort()).toEqual([
      "cafe",
      "restaurant",
    ]);
    expect([...categoryBucketIds("shopping")].sort()).toEqual([
      "shopping",
      "tech",
    ]);
  });

  it("leaves a category without manual aliases alone", () => {
    expect([...categoryBucketIds("transport")]).toEqual(["transport"]);
  });

  it("keeps a custom category id untouched", () => {
    expect([...categoryBucketIds("custom_kava")]).toEqual(["custom_kava"]);
  });
});

describe("calcLimitCategorySpent", () => {
  it("counts spending that existed before the limit was created", () => {
    // Транзакції сіємо першими — «бюджет» зʼявляється лише в аргументі нижче.
    const txs = [manual("m1", 1600, "food"), manual("m2", 1000, "food")];
    expect(calcLimitCategorySpent(txs, "food")).toBe(2600);
  });

  it("counts a manual `cafe` expense against a `restaurant` limit", () => {
    const txs = [manual("m1", 850, "cafe")];
    expect(calcLimitCategorySpent(txs, "restaurant")).toBe(850);
  });

  it("counts a legacy `groceries` expense against a `food` limit", () => {
    const txs = [manual("m1", 2600, "groceries")];
    expect(calcLimitCategorySpent(txs, "food")).toBe(2600);
  });

  it("counts a `tech` expense against a `shopping` limit", () => {
    const txs = [manual("m1", 12000, "tech")];
    expect(calcLimitCategorySpent(txs, "shopping")).toBe(12000);
  });

  it("mixes bank and manual rows in the same bucket exactly once", () => {
    const txs = [
      bank("b1", -260000, "Сільпо", 5411), // MCC → food
      manual("m1", 400, "groceries"),
      manual("m2", 100, "transport"),
    ];
    expect(calcLimitCategorySpent(txs, "food")).toBe(3000);
    expect(calcLimitCategorySpent(txs, "transport")).toBe(100);
  });

  it("ignores income rows and other categories", () => {
    const txs = [
      manual("m1", 1600, "food"),
      manual("m2", 900, "transport"),
      {
        id: "inc",
        amount: 500000,
        time: 1781049600,
        description: "Зарплата",
        mcc: 0,
      } as unknown as Transaction,
    ];
    expect(calcLimitCategorySpent(txs, "food")).toBe(1600);
  });

  it("honours a manual category override from txCategories", () => {
    const txs = [bank("b1", -50000, "Невідомо", 0)];
    expect(calcLimitCategorySpent(txs, "restaurant", { b1: "cafe" })).toBe(500);
  });

  it("sums only the split parts that fall in the bucket", () => {
    const txs = [bank("b1", -100000, "Змішана покупка", 0)];
    const splits = {
      b1: [
        { categoryId: "cafe", amount: 300 },
        { categoryId: "transport", amount: 700 },
      ],
    };
    expect(calcLimitCategorySpent(txs, "restaurant", {}, splits)).toBe(300);
    expect(calcLimitCategorySpent(txs, "transport", {}, splits)).toBe(700);
  });

  it("returns 0 for an empty category id", () => {
    expect(calcLimitCategorySpent([manual("m1", 100, "food")], "")).toBe(0);
  });
});

describe("multi-category limits", () => {
  it("union of buckets: manual groceries + cafe land in a food+restaurant combo", () => {
    const txs = [
      manual("m1", 2000, "groceries"),
      manual("m2", 600, "food"),
      manual("m3", 850, "cafe"),
      manual("m4", 300, "transport"),
    ];
    expect(calcLimitCategorySpent(txs, ["food", "restaurant"])).toBe(3450);
  });

  it("counts a transaction exactly once even with overlapping buckets", () => {
    // `food` двічі в наборі (дедуп) + сума комбо = сума одиночних.
    const txs = [manual("m1", 1000, "groceries"), manual("m2", 400, "cafe")];
    expect(calcLimitCategorySpent(txs, ["food", "food", "restaurant"])).toBe(
      calcLimitCategorySpent(txs, "food") +
        calcLimitCategorySpent(txs, "restaurant"),
    );
  });

  it("splits a split-transaction between combo categories without double counting", () => {
    const txs = [bank("b1", -100000, "Змішана покупка", 0)];
    const splits = {
      b1: [
        { categoryId: "food", amount: 700 },
        { categoryId: "restaurant", amount: 300 },
      ],
    };
    expect(
      calcLimitCategorySpent(txs, ["food", "restaurant"], {}, splits),
    ).toBe(1000);
  });

  it("empty id list returns 0", () => {
    expect(calcLimitCategorySpent([manual("m1", 100, "food")], [])).toBe(0);
  });

  it("breakdown rows follow categoryIds order and sum to the combo spent", () => {
    const txs = [
      manual("m1", 2000, "groceries"),
      manual("m2", 850, "cafe"),
      manual("m3", 300, "transport"),
    ];
    const rows = calcLimitCategoryBreakdown(txs, ["food", "restaurant"]);
    expect(rows).toEqual([
      { categoryId: "food", spent: 2000 },
      { categoryId: "restaurant", spent: 850 },
    ]);
    const total = rows.reduce((s, r) => s + r.spent, 0);
    expect(total).toBe(calcLimitCategorySpent(txs, ["food", "restaurant"]));
  });

  it("breakdown assigns split parts to their own categories", () => {
    const txs = [bank("b1", -100000, "Змішана покупка", 0)];
    const splits = {
      b1: [
        { categoryId: "food", amount: 700 },
        { categoryId: "cafe", amount: 300 },
      ],
    };
    expect(
      calcLimitCategoryBreakdown(txs, ["food", "restaurant"], {}, splits),
    ).toEqual([
      { categoryId: "food", spent: 700 },
      { categoryId: "restaurant", spent: 300 },
    ]);
  });
});
