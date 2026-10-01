import { describe, expect, it } from "vitest";
import { INCOME_CATEGORIES } from "./constants.js";

describe("constants — INCOME_CATEGORIES", () => {
  it("містить категорію «Борг» без ключових слів", () => {
    const debtCategory = INCOME_CATEGORIES.find((c) => c.id === "in_debt");
    expect(debtCategory).toEqual({
      id: "in_debt",
      label: "Борг",
      keywords: [],
    });
  });

  it("id категорій унікальні", () => {
    const ids = INCOME_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
