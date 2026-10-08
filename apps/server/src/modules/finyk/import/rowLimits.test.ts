import { describe, expect, it } from "vitest";
import {
  isAmountKopiykasInBounds,
  isDayKeyInBounds,
  truncateImportText,
} from "./rowLimits.js";

describe("truncateImportText", () => {
  it("коротший або рівний текст повертає як є", () => {
    expect(truncateImportText("abc", 3)).toBe("abc");
    expect(truncateImportText("", 3)).toBe("");
  });

  it("обрізає до max UTF-16 одиниць", () => {
    expect(truncateImportText("abcdef", 4)).toBe("abcd");
  });

  it("не лишає розірваної сурогатної пари", () => {
    // «а» + 😀 (2 одиниці): зріз на 2 різав би емодзі навпіл.
    expect(truncateImportText("а😀б", 2)).toBe("а");
    expect(truncateImportText("а😀б", 3)).toBe("а😀");
  });
});

describe("isDayKeyInBounds", () => {
  it.each([
    ["1970-01-01", true],
    ["2026-10-03", true],
    ["2100-01-01", true],
    ["1969-12-31", false],
    ["2100-01-02", false],
    ["2206-08-16", false],
  ])("%s → %s", (key, expected) => {
    expect(isDayKeyInBounds(key)).toBe(expected);
  });
});

describe("isAmountKopiykasInBounds", () => {
  it.each([
    [1, true],
    [1_000_000_000, true],
    [0, false],
    [-5, false],
    [1_000_000_001, false],
    [95.5, false],
    [Number.NaN, false],
    [Number.POSITIVE_INFINITY, false],
  ])("%s → %s", (n, expected) => {
    expect(isAmountKopiykasInBounds(n)).toBe(expected);
  });
});
