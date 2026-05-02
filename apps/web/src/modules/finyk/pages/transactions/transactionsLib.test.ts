import { describe, expect, it } from "vitest";
import { INTERNAL_TRANSFER_ID } from "@sergeant/finyk-domain/constants";
import { computeDaySummary } from "./transactionsLib";

describe("computeDaySummary", () => {
  it("сумує amounts без спліту та без excludes", () => {
    const s = computeDaySummary([
      { id: "a", amount: -10000 },
      { id: "b", amount: 50000 },
    ]);
    expect(s).toEqual({ total: 40000, count: 2, statCount: 2 });
  });

  it("виключає транзакції з excludedTxIds (внутрішні перекази, приховані тощо)", () => {
    const s = computeDaySummary(
      [
        { id: "a", amount: 75000 }, // внутрішній переказ (income)
        { id: "b", amount: 335000 }, // внутрішній переказ (income)
        { id: "c", amount: 1130358 }, // реальний дохід
      ],
      { excludedTxIds: new Set(["a", "b"]) },
    );
    // Лише `c` враховано; збіг з поведінкою «не в статистиці» з TxRow.
    expect(s).toEqual({ total: 1130358, count: 3, statCount: 1 });
  });

  it("повертає statCount=0 коли всі транзакції виключені — UI ховає суму", () => {
    const s = computeDaySummary(
      [
        { id: "a", amount: 75000 },
        { id: "b", amount: 335000 },
      ],
      { excludedTxIds: new Set(["a", "b"]) },
    );
    expect(s.statCount).toBe(0);
    expect(s.total).toBe(0);
    expect(s.count).toBe(2);
  });

  it("при сплітах сумує лише не-internal_transfer частини, зберігаючи знак", () => {
    // Витрата -500.00₴ (amount = -50000 копійок), розділена:
    // 300.00₴ — продукти, 200.00₴ — внутрішній переказ. У день-total
    // має зайти лише 300.00₴ з правильним знаком (витрата → -30000).
    const s = computeDaySummary([{ id: "x", amount: -50000 }], {
      txSplits: {
        x: [
          { categoryId: "food", amount: 300 },
          { categoryId: INTERNAL_TRANSFER_ID, amount: 200 },
        ],
      },
    });
    expect(s.total).toBe(-30000);
    expect(s.statCount).toBe(1);
  });

  it("при сплітах на доходній транзакції віддає позитивну суму", () => {
    const s = computeDaySummary([{ id: "y", amount: 50000 }], {
      txSplits: {
        y: [
          { categoryId: "in_salary", amount: 400 },
          { categoryId: INTERNAL_TRANSFER_ID, amount: 100 },
        ],
      },
    });
    expect(s.total).toBe(40000);
  });

  it("пустий вхід повертає нулі", () => {
    expect(computeDaySummary([])).toEqual({
      total: 0,
      count: 0,
      statCount: 0,
    });
  });
});
