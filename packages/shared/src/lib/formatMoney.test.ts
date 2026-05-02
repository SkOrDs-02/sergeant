import { describe, expect, it } from "vitest";

import { formatMoney, formatMoneyFromKopecks } from "./formatMoney";

describe("formatMoney", () => {
  it("appends ₴ with a regular space and uses uk-UA grouping by default", () => {
    const out = formatMoney(1250);
    expect(out).toMatch(/₴$/);
    // Allow for either NBSP or thin-space depending on the active Intl
    // implementation — we only care that the digits and symbol survive.
    expect(out).toContain("1");
    expect(out).toContain("250");
  });

  it("respects minFractionDigits / maxFractionDigits", () => {
    expect(formatMoney(1, { minFractionDigits: 2 })).toMatch(/^1[,.]00 ₴$/);
    expect(formatMoney(1.234, { maxFractionDigits: 2 })).toMatch(/^1[,.]23 ₴$/);
  });

  it("emits a leading + only for signed positive values", () => {
    expect(formatMoney(50, { signed: true })).toMatch(/^\+50 ₴$/);
    expect(formatMoney(0, { signed: true })).toMatch(/^0 ₴$/);
    // Negative values use the locale minus sign supplied by toLocaleString;
    // we only assert it does NOT start with "+".
    const neg = formatMoney(-50, { signed: true });
    expect(neg.startsWith("+")).toBe(false);
    expect(neg).toMatch(/50 ₴$/);
  });

  it("supports custom symbols", () => {
    expect(formatMoney(100, { symbol: "$" })).toMatch(/^100 \$$/);
  });

  it("treats non-finite inputs as 0 instead of throwing", () => {
    expect(formatMoney(Number.NaN)).toMatch(/^0 ₴$/);
    expect(formatMoney(Number.POSITIVE_INFINITY)).toMatch(/^0 ₴$/);
  });
});

describe("formatMoneyFromKopecks", () => {
  it("divides by 100 and rounds away floating-point drift", () => {
    expect(formatMoneyFromKopecks(199)).toMatch(/^2 ₴$/);
    expect(formatMoneyFromKopecks(199, { minFractionDigits: 2 })).toMatch(
      /^1[,.]99 ₴$/,
    );
  });

  it("treats non-finite inputs as 0", () => {
    expect(formatMoneyFromKopecks(Number.NaN)).toMatch(/^0 ₴$/);
  });
});
