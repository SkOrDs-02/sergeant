// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  normalizeTransaction,
  normalizeTransactions,
  manualExpenseToTransaction,
  dedupeAndSortTransactions,
} from "./transactions.js";
import { INTERNAL_TRANSFER_ID } from "../constants.js";

describe("normalizeTransaction — канонічні поля", () => {
  it("додає date як ISO-рядок з time у секундах", () => {
    const tx = normalizeTransaction({
      id: "x",
      time: 1700000000,
      amount: -1234,
      description: "АТБ",
    });
    expect(typeof tx.date).toBe("string");
    expect(tx.date).toBe(new Date(1700000000 * 1000).toISOString());
  });

  it("приймає мс у time та коректно конвертує у секунди", () => {
    const ms = 1700000000000;
    const tx = normalizeTransaction({ id: "x", time: ms, amount: 0 });
    expect(tx.time).toBe(Math.floor(ms / 1000));
    expect(tx.date).toBe(new Date(ms).toISOString());
  });

  it("приймає ISO-рядок у date і конвертує у time/date", () => {
    const tx = normalizeTransaction({
      id: "x",
      date: "2024-01-15T10:30:00.000Z",
      amount: 100,
    });
    expect(tx.date).toBe("2024-01-15T10:30:00.000Z");
    expect(tx.time).toBe(
      Math.floor(Date.parse("2024-01-15T10:30:00.000Z") / 1000),
    );
  });

  it("гарантує amount як number навіть зі string-входу", () => {
    const tx = normalizeTransaction({ id: "x", amount: "12.7" });
    expect(typeof tx.amount).toBe("number");
    expect(tx.amount).toBe(13);
  });

  it("0 для невалідного amount", () => {
    const tx = normalizeTransaction({ id: "x", amount: "abc" });
    expect(tx.amount).toBe(0);
  });

  it("генерує id, якщо його немає", () => {
    const tx = normalizeTransaction({ amount: 100, time: 1700000000 });
    expect(typeof tx.id).toBe("string");
    expect(tx.id.length).toBeGreaterThan(0);
  });

  it("type='expense' для від'ємного amount без явної категорії", () => {
    const tx = normalizeTransaction({ id: "x", amount: -500 });
    expect(tx.type).toBe("expense");
  });

  it("type='income' для додатного amount", () => {
    const tx = normalizeTransaction({ id: "x", amount: 500 });
    expect(tx.type).toBe("income");
  });

  it("type='transfer' для INTERNAL_TRANSFER_ID, незалежно від суми", () => {
    const tx = normalizeTransaction({
      id: "x",
      amount: -100,
      categoryId: INTERNAL_TRANSFER_ID,
    });
    expect(tx.type).toBe("transfer");
  });

  it("повертає merchant з description для mono-джерела", () => {
    const tx = normalizeTransaction(
      { id: "x", amount: -100, description: "Сільпо" },
      { source: "monobank" },
    );
    expect(tx.merchant).toBe("Сільпо");
  });

  it("note береться з description для manual", () => {
    const tx = normalizeTransaction(
      { id: "x", amount: -100, description: "Кава" },
      { source: "manual" },
    );
    expect(tx.note).toBe("Кава");
  });

  it("явні merchant і note мають перевагу", () => {
    const tx = normalizeTransaction({
      id: "x",
      amount: -100,
      description: "Опис",
      merchant: "Magaz",
      note: "коментар",
    });
    expect(tx.merchant).toBe("Magaz");
    expect(tx.note).toBe("коментар");
  });
});

describe("normalizeTransaction — джерела", () => {
  it("'monobank' → 'mono'", () => {
    const tx = normalizeTransaction(
      { id: "x", amount: 1 },
      { source: "monobank" },
    );
    expect(tx.source).toBe("mono");
    expect(tx._source).toBe("monobank"); // legacy збережено
  });

  it("'privatbank' → 'import'", () => {
    const tx = normalizeTransaction(
      { id: "x", amount: 1 },
      { source: "privatbank" },
    );
    expect(tx.source).toBe("import");
    expect(tx._source).toBe("privatbank");
  });

  it("'manual' лишається 'manual'", () => {
    const tx = normalizeTransaction(
      { id: "x", amount: 1 },
      { source: "manual" },
    );
    expect(tx.source).toBe("manual");
  });

  it("'ai' лишається 'ai'", () => {
    const tx = normalizeTransaction({ id: "x", amount: 1 }, { source: "ai" });
    expect(tx.source).toBe("ai");
  });

  it("невідоме джерело → 'import'", () => {
    const tx = normalizeTransaction({ id: "x", amount: 1 });
    expect(tx.source).toBe("import");
  });
});

describe("normalizeTransaction — back-compat поля", () => {
  it("зберігає _accountId, _manual, _manualId для UI", () => {
    const tx = normalizeTransaction(
      { id: "x", amount: -100, manual: true, manualId: "m1" },
      { source: "manual", accountId: "acc-1" },
    );
    expect(tx._accountId).toBe("acc-1");
    expect(tx._manual).toBe(true);
    expect(tx._manualId).toBe("m1");
    expect(tx.accountId).toBe("acc-1");
  });

  it("description і mcc лишаються як в legacy-форматі", () => {
    const tx = normalizeTransaction({
      id: "x",
      amount: -100,
      description: "АТБ",
      mcc: 5411,
    });
    expect(tx.description).toBe("АТБ");
    expect(tx.mcc).toBe(5411);
  });
});

describe("normalizeTransactions / dedupeAndSortTransactions", () => {
  it("normalize-ить масив", () => {
    const list = normalizeTransactions([
      { id: "a", time: 1, amount: 1 },
      { id: "b", time: 2, amount: -1 },
    ]);
    expect(list).toHaveLength(2);
    expect(list[0]!.source).toBe("import");
  });

  it("дедуплікує за id та сортує за time desc", () => {
    const result = dedupeAndSortTransactions([
      { id: "a", time: 1, amount: 1 },
      { id: "a", time: 1, amount: 999 }, // дубль
      { id: "b", time: 5, amount: 2 },
    ]);
    expect(result.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("толерує null/undefined/не-об'єкти у вхідному списку", () => {
    const result = dedupeAndSortTransactions([
      null,
      undefined,
      "garbage",
      42,
      { id: "a", time: 3, amount: 1 },
    ] as never);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("a");
  });

  it("повертає порожній масив для не-масиву", () => {
    expect(dedupeAndSortTransactions(null)).toEqual([]);
    expect(dedupeAndSortTransactions(undefined)).toEqual([]);
    expect(dedupeAndSortTransactions({} as never)).toEqual([]);
  });
});

describe("manualExpenseToTransaction", () => {
  it("конвертує гривні в копійки зі знаком витрати", () => {
    const tx = manualExpenseToTransaction({
      id: "1",
      date: "2024-06-15T12:00:00.000Z",
      description: "Кава",
      amount: 75,
      category: "food",
    });
    expect(tx.amount).toBe(-7500);
    expect(tx.source).toBe("manual");
    expect(tx.type).toBe("expense");
    expect(tx.categoryId).toBe("food");
    expect(tx._manual).toBe(true);
    expect(tx._manualId).toBe("1");
    expect(tx.id).toBe("manual_1");
  });

  it("обробляє відсутній amount як 0", () => {
    const tx = manualExpenseToTransaction({
      id: "2",
      date: "2024-06-15T12:00:00.000Z",
    });
    expect(tx.amount).toBe(0);
  });
});
