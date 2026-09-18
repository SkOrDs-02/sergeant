import { describe, expect, it } from "vitest";
import type { FrequentCategory } from "@sergeant/finyk-domain/domain/personalization";
import { getFrequentCategorySlugs } from "./manualExpenseForm";

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
