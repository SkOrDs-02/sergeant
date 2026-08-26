/**
 * Last validated: 2026-08-25
 * Status: Active
 *
 * AI-CONTEXT: B39 fix — доводить, що модал згоди отримує ЩОСЬ конкретніше
 * за голу назву інструмента для кожного з чотирьох деструктивних
 * інструментів Фініка/Нутриції, і що невідомі/порожні аргументи не
 * ламають модал (`undefined`, а не throw).
 */
import { describe, expect, it } from "vitest";

import { summarizeDestructiveToolInput } from "./destructiveConfirmSummary";

describe("summarizeDestructiveToolInput", () => {
  it("batch_categorize: показує патерн і стелю ліміту", () => {
    expect(
      summarizeDestructiveToolInput("batch_categorize", {
        pattern: "Сільпо",
        category_id: "food",
        limit: 15,
      }),
    ).toBe("патерн «Сільпо», до 15 транзакцій");
  });

  it("batch_categorize: без limit падає на дефолт 20", () => {
    expect(
      summarizeDestructiveToolInput("batch_categorize", {
        pattern: "АЗС",
      }),
    ).toBe("патерн «АЗС», до 20 транзакцій");
  });

  it("batch_categorize: limit понад стелю затискається до 50", () => {
    expect(
      summarizeDestructiveToolInput("batch_categorize", {
        pattern: "кафе",
        limit: 500,
      }),
    ).toBe("патерн «кафе», до 50 транзакцій");
  });

  it("batch_categorize: порожній pattern не ламає підсумок", () => {
    expect(
      summarizeDestructiveToolInput("batch_categorize", { limit: 5 }),
    ).toBe("до 5 транзакцій");
  });

  it("delete_transaction: показує tx_id", () => {
    expect(
      summarizeDestructiveToolInput("delete_transaction", { tx_id: "m_42" }),
    ).toBe("транзакція m_42");
  });

  it("forget: показує fact_id", () => {
    expect(summarizeDestructiveToolInput("forget", { fact_id: "f_7" })).toBe(
      "запис f_7",
    );
  });

  it("import_monobank_range: показує діапазон дат", () => {
    expect(
      summarizeDestructiveToolInput("import_monobank_range", {
        from: "2026-08-01",
        to: "2026-08-15",
      }),
    ).toBe("період 2026-08-01 – 2026-08-15");
  });

  it("import_monobank_range: часткові дати не показують нічого", () => {
    expect(
      summarizeDestructiveToolInput("import_monobank_range", {
        from: "2026-08-01",
      }),
    ).toBeUndefined();
  });

  it("clear_pantry: без аргументів показує статичний опис масштабу", () => {
    expect(summarizeDestructiveToolInput("clear_pantry", {})).toBe(
      "усі позиції активної комори",
    );
  });

  it("невідомий інструмент або биті аргументи → undefined, без throw", () => {
    expect(summarizeDestructiveToolInput("невідомий", {})).toBeUndefined();
    expect(
      summarizeDestructiveToolInput("delete_transaction", { tx_id: 42 }),
    ).toBeUndefined();
  });
});
