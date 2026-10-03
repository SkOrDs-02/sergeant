import { describe, it, expect } from "vitest";
import {
  canonicalizeAmountInput,
  formatMinorAsInput,
  parseAmountToMinor,
  MAX_AMOUNT_MINOR,
} from "./amount";

describe("parseAmountToMinor", () => {
  const cases: Array<[string, number | string]> = [
    ["12,50", 1250],
    [" 100 ", 10000],
    ["0012", 1200],
    ["1 000,50", 100050],
    ["1 000,50", 100050],
    ["12.345", 1235],
    ["0.01", 1],
    ["10000000", MAX_AMOUNT_MINOR],
    ["0", "too-small"],
    ["-5", "too-small"],
    ["0.004", "too-small"],
    ["1e9", "not-a-number"],
    ["99999999999", "too-large"],
    ["10000000.01", "too-large"],
    ["12,5,6", "not-a-number"],
    ["", "empty"],
    ["   ", "empty"],
    ["abc", "not-a-number"],
    ["Infinity", "not-a-number"],
    ["0x10", "not-a-number"],
    ["12.", "not-a-number"],
  ];

  it.each(cases)("%s", (input, expected) => {
    const result = parseAmountToMinor(input);
    if (typeof expected === "number") {
      expect(result).toEqual({ ok: true, minor: expected });
    } else {
      expect(result).toEqual({ ok: false, error: expected });
    }
  });
});

describe("formatMinorAsInput", () => {
  it("drops decimals for whole hryvnia", () => {
    expect(formatMinorAsInput(10000)).toBe("100");
  });

  it("keeps two decimals for fractional amounts", () => {
    expect(formatMinorAsInput(1250)).toBe("12.50");
    expect(formatMinorAsInput(1)).toBe("0.01");
  });
});

describe("canonicalizeAmountInput", () => {
  it("rewrites valid input to canonical form", () => {
    expect(canonicalizeAmountInput(" 12,50 ")).toBe("12.50");
  });

  it("keeps the typed value when invalid so the error stays explainable", () => {
    expect(canonicalizeAmountInput(" 1e9 ")).toBe("1e9");
  });
});
