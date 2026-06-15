import { describe, it, expect } from "vitest";
import { pluralDays, pluralTimes, pluralUa } from "./ukrainianPlural";

describe("pluralDays", () => {
  it("one: 1, 21, 31, 101", () => {
    expect(pluralDays(1)).toBe("день");
    expect(pluralDays(21)).toBe("день");
    expect(pluralDays(31)).toBe("день");
    expect(pluralDays(101)).toBe("день");
  });

  it("few: 2-4, 22-24, 32-34", () => {
    expect(pluralDays(2)).toBe("дні");
    expect(pluralDays(3)).toBe("дні");
    expect(pluralDays(4)).toBe("дні");
    expect(pluralDays(22)).toBe("дні");
    expect(pluralDays(34)).toBe("дні");
  });

  it("many: 5-20, 25-30, 100, 111-114", () => {
    expect(pluralDays(0)).toBe("днів");
    expect(pluralDays(5)).toBe("днів");
    expect(pluralDays(10)).toBe("днів");
    expect(pluralDays(11)).toBe("днів");
    expect(pluralDays(12)).toBe("днів");
    expect(pluralDays(13)).toBe("днів");
    expect(pluralDays(14)).toBe("днів");
    expect(pluralDays(20)).toBe("днів");
    expect(pluralDays(25)).toBe("днів");
    expect(pluralDays(100)).toBe("днів");
    expect(pluralDays(111)).toBe("днів");
    expect(pluralDays(114)).toBe("днів");
  });

  it("симетрично для негативних значень", () => {
    expect(pluralDays(-1)).toBe("день");
    expect(pluralDays(-3)).toBe("дні");
    expect(pluralDays(-11)).toBe("днів");
  });

  it("pluralTimes: 1 раз / 2-4 рази / 5+ разів", () => {
    expect(pluralTimes(1)).toBe("раз");
    expect(pluralTimes(21)).toBe("раз");
    expect(pluralTimes(2)).toBe("рази");
    expect(pluralTimes(3)).toBe("рази");
    expect(pluralTimes(4)).toBe("рази");
    expect(pluralTimes(22)).toBe("рази");
    expect(pluralTimes(0)).toBe("разів");
    expect(pluralTimes(5)).toBe("разів");
    expect(pluralTimes(11)).toBe("разів");
    expect(pluralTimes(14)).toBe("разів");
    expect(pluralTimes(25)).toBe("разів");
  });

  it("працює як загальний helper на інших формах", () => {
    const forms = { one: "година", few: "години", many: "годин" };
    expect(pluralUa(1, forms)).toBe("година");
    expect(pluralUa(3, forms)).toBe("години");
    expect(pluralUa(7, forms)).toBe("годин");
    expect(pluralUa(12, forms)).toBe("годин");
  });
});
