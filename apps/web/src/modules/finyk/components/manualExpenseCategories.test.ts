import { describe, it, expect } from "vitest";
import {
  upgradeCategory,
  isCategorySlug,
  CATEGORY_SLUGS,
  DEFAULT_CATEGORY,
} from "./manualExpenseCategories";

describe("isCategorySlug", () => {
  it("returns true for every known slug", () => {
    for (const slug of CATEGORY_SLUGS) {
      expect(isCategorySlug(slug)).toBe(true);
    }
  });

  it("returns false for unknown strings", () => {
    expect(isCategorySlug("unknown")).toBe(false);
    expect(isCategorySlug("")).toBe(false);
    expect(isCategorySlug("Їжа")).toBe(false);
  });
});

describe("upgradeCategory", () => {
  it("returns the slug directly for Era-3 slugs", () => {
    expect(upgradeCategory("food")).toBe("food");
    expect(upgradeCategory("transport")).toBe("transport");
    expect(upgradeCategory("subscriptions")).toBe("subscriptions");
  });

  it("upgrades Era-1 bare Ukrainian labels", () => {
    expect(upgradeCategory("їжа")).toBe("food");
    expect(upgradeCategory("транспорт")).toBe("transport");
    expect(upgradeCategory("підписки")).toBe("subscriptions");
    expect(upgradeCategory("інше")).toBe("other");
  });

  it("upgrades Era-2 emoji-prefixed labels", () => {
    expect(upgradeCategory("🍴 їжа")).toBe("food");
    expect(upgradeCategory("🚗 транспорт")).toBe("transport");
  });

  it("falls back to DEFAULT_CATEGORY for null/undefined/empty", () => {
    expect(upgradeCategory(null)).toBe(DEFAULT_CATEGORY);
    expect(upgradeCategory(undefined)).toBe(DEFAULT_CATEGORY);
    expect(upgradeCategory("")).toBe(DEFAULT_CATEGORY);
  });

  it("falls back to DEFAULT_CATEGORY for completely unknown values", () => {
    expect(upgradeCategory("неіснуюча_категорія")).toBe(DEFAULT_CATEGORY);
  });

  it("handles whitespace-only input gracefully", () => {
    expect(upgradeCategory("   ")).toBe(DEFAULT_CATEGORY);
  });
});
