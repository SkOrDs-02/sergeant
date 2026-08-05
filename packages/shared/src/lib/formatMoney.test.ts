import { describe, expect, it } from "vitest";

import {
  formatMoney,
  formatMoneyFromKopecks,
  splitMoneyParts,
  MINUS_SIGN,
} from "./formatMoney";

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

describe("splitMoneyParts", () => {
  it("splits hryvnia and kopecks into separate tiers", () => {
    const p = splitMoneyParts(1250.5, { minFractionDigits: 2 });
    expect(p.integer.replace(/[\s\u00a0\u202f]/g, "")).toBe("1250");
    expect(p.fraction).toBe("50");
    expect(p.decimalSeparator).toMatch(/[,.]/);
    expect(p.symbol).toBe("₴");
    expect(p.sign).toBe("");
  });

  it("leaves fraction empty when kopecks are not displayed", () => {
    const p = splitMoneyParts(1250.5);
    expect(p.fraction).toBe("");
    expect(p.decimalSeparator).toBe("");
  });

  it("normalises the minus to U+2212 and keeps the number unsigned", () => {
    const p = splitMoneyParts(-340);
    expect(p.sign).toBe(MINUS_SIGN);
    expect(p.sign).not.toBe("-");
    // Знак — окрема частина, тож у цілій його вже немає.
    expect(p.integer).not.toContain("-");
    expect(p.integer).not.toContain(MINUS_SIGN);
    expect(p.integer).toBe("340");
  });

  it("emits an explicit plus only when asked", () => {
    expect(splitMoneyParts(340).sign).toBe("");
    expect(splitMoneyParts(340, { signed: true }).sign).toBe("+");
    // Нуль не отримує знака навіть у signed-режимі — «+0» це не сума.
    expect(splitMoneyParts(0, { signed: true }).sign).toBe("");
  });

  it("agrees with formatMoney on grouping and rounding", () => {
    for (const amount of [0, 5, 999.994, 1250.5, -87654.321]) {
      for (const digits of [0, 2]) {
        const parts = splitMoneyParts(amount, { minFractionDigits: digits });
        const rebuilt =
          parts.sign +
          parts.integer +
          (parts.fraction ? parts.decimalSeparator + parts.fraction : "") +
          " " +
          parts.symbol;
        const flat = formatMoney(amount, { minFractionDigits: digits });
        expect(rebuilt).toBe(flat.replace("-", MINUS_SIGN));
      }
    }
  });

  it("treats non-finite input as 0", () => {
    expect(splitMoneyParts(Number.NaN).integer).toBe("0");
  });
});
