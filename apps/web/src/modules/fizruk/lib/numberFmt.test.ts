import { describe, it, expect } from "vitest";
import { fmt, fmtLoose } from "./numberFmt";

/**
 * Роздільник дробової частини в uk-UA — КОМА. Регресія, яку ловлять ці
 * тести: `toFixed()` друкував крапку незалежно від локалі, тож на одній
 * сторінці стояло «102,5 кг» поруч із «92.5 / 87.5 / 2.5 кг»
 * (браузерне QA 2026-08-23).
 */
describe("fmt", () => {
  it("formats a positive integer with 0 decimal places by default", () => {
    expect(fmt(42)).toBe("42");
  });

  it("rounds to 0 decimal places by default", () => {
    expect(fmt(3.7)).toBe("4");
  });

  it("uses the Ukrainian decimal comma, never a dot", () => {
    expect(fmt(1.5, 2)).toBe("1,50");
    expect(fmt(100, 1)).toBe("100,0");
    expect(fmt(82.5, 1)).toBe("82,5");
    expect(fmt(92.5, 1)).not.toContain(".");
  });

  it("returns '0' for null (Number(null) === 0, which is finite)", () => {
    expect(fmt(null)).toBe("0");
  });

  it("returns '—' for undefined", () => {
    expect(fmt(undefined)).toBe("—");
  });

  it("returns '—' for non-numeric strings", () => {
    expect(fmt("not-a-number")).toBe("—");
  });

  it("returns '—' for Infinity", () => {
    expect(fmt(Infinity)).toBe("—");
  });

  it("returns '—' for -Infinity", () => {
    expect(fmt(-Infinity)).toBe("—");
  });

  it("handles zero correctly", () => {
    expect(fmt(0)).toBe("0");
    expect(fmt(0, 2)).toBe("0,00");
  });

  it("accepts numeric strings", () => {
    expect(fmt("5.5", 1)).toBe("5,5");
  });

  it("formats negative numbers", () => {
    expect(fmt(-3, 0)).toBe("-3");
    expect(fmt(-1.2, 1)).toBe("-1,2");
  });
});

describe("fmtLoose", () => {
  it("drops trailing zeros but keeps the comma", () => {
    expect(fmtLoose(100)).toBe("100");
    expect(fmtLoose(92.5)).toBe("92,5");
    expect(fmtLoose(2.5)).toBe("2,5");
  });

  it("returns '—' for non-numbers", () => {
    expect(fmtLoose(undefined)).toBe("—");
    expect(fmtLoose(Number.NaN)).toBe("—");
  });
});
