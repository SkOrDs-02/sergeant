import { describe, expect, it } from "vitest";
import { ManualExpenseCreateSchema } from "@sergeant/shared/schemas";
import { MAX_AMOUNT_HRYVNIA } from "@shared/lib/format/amount";
import {
  TRANSACTION_DESCRIPTION_MAX_LEN,
  validateTransactionInput,
} from "./transactionInputValidation";

describe("validateTransactionInput", () => {
  it("приймає звичайний вхід і повертає суму числом", () => {
    expect(
      validateTransactionInput({ amount: "120.5", description: "кава" }),
    ).toEqual({ ok: true, amount: 120.5 });
  });

  it("приймає межові значення (сума, опис, дата)", () => {
    const out = validateTransactionInput({
      amount: MAX_AMOUNT_HRYVNIA,
      description: "x".repeat(TRANSACTION_DESCRIPTION_MAX_LEN),
      date: "2100-01-01",
    });
    expect(out.ok).toBe(true);
  });

  it.each([0, -5, "abc", Number.NaN])("відхиляє суму %s", (amount) => {
    const out = validateTransactionInput({ amount });
    expect(out).toEqual({ ok: false, message: "Некоректна сума операції." });
  });

  it("відхиляє суму вище MAX_AMOUNT_HRYVNIA", () => {
    const out = validateTransactionInput({ amount: MAX_AMOUNT_HRYVNIA + 1 });
    expect(out.ok).toBe(false);
    expect((out as { message: string }).message).toContain("завелика");
  });

  it("відхиляє опис довший за серверну межу", () => {
    const out = validateTransactionInput({
      amount: 10,
      description: "x".repeat(TRANSACTION_DESCRIPTION_MAX_LEN + 1),
    });
    expect(out.ok).toBe(false);
    expect((out as { message: string }).message).toContain("Опис задовгий");
  });

  it("не рахує пробіли по краях у довжину опису", () => {
    const out = validateTransactionInput({
      amount: 10,
      description: `  ${"x".repeat(TRANSACTION_DESCRIPTION_MAX_LEN)}  `,
    });
    expect(out.ok).toBe(true);
  });

  it.each(["2150-01-01", "2100-01-02", "1969-12-31", "2026-02-30"])(
    "відхиляє дату поза межами %s",
    (date) => {
      const out = validateTransactionInput({ amount: 10, date });
      expect(out.ok).toBe(false);
      expect((out as { message: string }).message).toContain(
        "Дата поза допустимим діапазоном",
      );
    },
  );

  it("ігнорує дату не у форматі YYYY-MM-DD (виконавці пишуть «сьогодні»)", () => {
    expect(validateTransactionInput({ amount: 10, date: "вчора" }).ok).toBe(
      true,
    );
  });

  // Дрейф-гейт: ліміти клієнта = ліміти серверної схеми manual-expenses.
  it("збігається із ManualExpenseCreateSchema (note ≤ ліміт)", () => {
    const base = { amount: 100, category: "food" };
    expect(
      ManualExpenseCreateSchema.safeParse({
        ...base,
        note: "x".repeat(TRANSACTION_DESCRIPTION_MAX_LEN),
      }).success,
    ).toBe(true);
    expect(
      ManualExpenseCreateSchema.safeParse({
        ...base,
        note: "x".repeat(TRANSACTION_DESCRIPTION_MAX_LEN + 1),
      }).success,
    ).toBe(false);
  });

  it("збігається із ManualExpenseCreateSchema (стеля суми)", () => {
    const minor = (h: number) => Math.round(h * 100);
    const parse = (h: number) =>
      ManualExpenseCreateSchema.safeParse({
        amount: minor(h),
        category: "food",
      }).success;
    expect(parse(MAX_AMOUNT_HRYVNIA)).toBe(true);
    expect(parse(MAX_AMOUNT_HRYVNIA + 1)).toBe(false);
  });
});
