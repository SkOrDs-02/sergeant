/**
 * Юніт-тести функції pluralize з useHubDashboardState.ts.
 *
 * `pluralize` реалізує українські правила відмінювання за числом:
 *   - 1, 21, 31, 101 → one (одна «звичка»)
 *   - 2–4, 22–24, 32–34 → few («звички»)
 *   - 0, 5–20, 25–30, 11–14 → many («звичок»)
 *
 * Тести залишаються детерміністично без жодних DOM або RQ-залежностей.
 * Функція вже публічно (named) експортується, тому жодних змін у
 * продакшн-коді не потрібно.
 */

import { describe, it, expect } from "vitest";
import { pluralize } from "./useHubDashboardState";

describe("pluralize — Ukrainian grammatical number rules", () => {
  // Форми для тестового іменника: одна звичка / дві звички / п'ять звичок
  const one = "звичка";
  const few = "звички";
  const many = "звичок";

  describe("форма ONE (mod10=1 і mod100≠11)", () => {
    it("1 → one", () => expect(pluralize(1, one, few, many)).toBe(one));
    it("21 → one", () => expect(pluralize(21, one, few, many)).toBe(one));
    it("31 → one", () => expect(pluralize(31, one, few, many)).toBe(one));
    it("101 → one", () => expect(pluralize(101, one, few, many)).toBe(one));
    it("1001 → one", () => expect(pluralize(1001, one, few, many)).toBe(one));
  });

  describe("форма FEW (mod10=2–4, але mod100 ∉ 10–20)", () => {
    it("2 → few", () => expect(pluralize(2, one, few, many)).toBe(few));
    it("3 → few", () => expect(pluralize(3, one, few, many)).toBe(few));
    it("4 → few", () => expect(pluralize(4, one, few, many)).toBe(few));
    it("22 → few", () => expect(pluralize(22, one, few, many)).toBe(few));
    it("23 → few", () => expect(pluralize(23, one, few, many)).toBe(few));
    it("24 → few", () => expect(pluralize(24, one, few, many)).toBe(few));
    it("32 → few", () => expect(pluralize(32, one, few, many)).toBe(few));
    it("102 → few", () => expect(pluralize(102, one, few, many)).toBe(few));
  });

  describe("форма MANY (залишок)", () => {
    it("0 → many", () => expect(pluralize(0, one, few, many)).toBe(many));
    it("5 → many", () => expect(pluralize(5, one, few, many)).toBe(many));
    it("6 → many", () => expect(pluralize(6, one, few, many)).toBe(many));
    it("10 → many", () => expect(pluralize(10, one, few, many)).toBe(many));
    it("11 → many (виняток: mod100=11 → not one)", () =>
      expect(pluralize(11, one, few, many)).toBe(many));
    it("12 → many (виняток: mod100=12 → not few)", () =>
      expect(pluralize(12, one, few, many)).toBe(many));
    it("13 → many (виняток: mod100=13 → not few)", () =>
      expect(pluralize(13, one, few, many)).toBe(many));
    it("14 → many (виняток: mod100=14 → not few)", () =>
      expect(pluralize(14, one, few, many)).toBe(many));
    it("20 → many", () => expect(pluralize(20, one, few, many)).toBe(many));
    it("25 → many", () => expect(pluralize(25, one, few, many)).toBe(many));
    it("111 → many (mod100=11 → виняток)", () =>
      expect(pluralize(111, one, few, many)).toBe(many));
    it("112 → many (mod100=12 → виняток)", () =>
      expect(pluralize(112, one, few, many)).toBe(many));
  });

  describe("реальні іменники", () => {
    it("'день/дні/днів': 1=день, 3=дні, 7=днів, 11=днів", () => {
      const d = (n: number) => pluralize(n, "день", "дні", "днів");
      expect(d(1)).toBe("день");
      expect(d(3)).toBe("дні");
      expect(d(7)).toBe("днів");
      expect(d(11)).toBe("днів");
      expect(d(21)).toBe("день");
    });
  });
});
