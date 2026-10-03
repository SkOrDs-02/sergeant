import { describe, expect, it } from "vitest";
import type { FrequentCategory } from "@sergeant/finyk-domain/domain/personalization";
import { toKyivISODate } from "@sergeant/shared";
import {
  getFrequentCategorySlugs,
  isExpenseDayPlaceholder,
  toExpenseInstant,
} from "./manualExpenseForm";

function frequentCategory(
  overrides: Partial<FrequentCategory>,
): FrequentCategory {
  return {
    id: "unknown",
    label: "Невідома",
    count: 1,
    total: 100,
    lastUsedTs: 1,
    ...overrides,
  };
}

describe("getFrequentCategorySlugs", () => {
  it("не підміняє невідому часту категорію на «Інше»", () => {
    expect(
      getFrequentCategorySlugs([
        frequentCategory({ manualLabel: "Кава з друзями" }),
      ]),
    ).toEqual([]);
  });

  it("лишає явну категорію «Інше» частою", () => {
    expect(
      getFrequentCategorySlugs([
        frequentCategory({ id: "other", manualLabel: "other" }),
      ]),
    ).toEqual(["other"]);
  });
});

// Р6 спеки аналітики v2: сьогоднішній запис несе реальну мить, минулий день
// лише плейсхолдер, і CSV відрізняє одне від іншого.
describe("toExpenseInstant / isExpenseDayPlaceholder", () => {
  const now = new Date("2026-09-24T01:12:00.000Z");

  it("сьогоднішній день зберігає поточну мить", () => {
    const instant = toExpenseInstant(toKyivISODate(now), now);
    expect(instant).toBe(now.toISOString());
    expect(isExpenseDayPlaceholder(Date.parse(instant))).toBe(false);
  });

  it("минулий день зберігає полудень UTC, і це плейсхолдер", () => {
    const instant = toExpenseInstant("2026-09-20", now);
    expect(instant).toBe("2026-09-20T12:00:00.000Z");
    expect(isExpenseDayPlaceholder(Date.parse(instant))).toBe(true);
  });

  it("голий день старих записів (північ UTC) теж плейсхолдер", () => {
    expect(isExpenseDayPlaceholder(Date.parse("2026-05-20"))).toBe(true);
  });
});
