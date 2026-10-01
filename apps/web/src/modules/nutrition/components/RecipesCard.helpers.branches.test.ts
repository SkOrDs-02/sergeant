/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guessMealTypeIdNow, parsePortionFactor } from "./RecipesCard.helpers";

describe("guessMealTypeIdNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [5, "breakfast"],
    [10, "breakfast"],
    [11, "lunch"],
    [15, "lunch"],
    [16, "dinner"],
    [21, "dinner"],
    [22, "snack"],
    [3, "snack"],
  ] as const)("hour %i → %s", (hour, expected) => {
    vi.setSystemTime(new Date(2026, 5, 2, hour, 30, 0));
    expect(guessMealTypeIdNow()).toBe(expected);
  });
});

describe("parsePortionFactor", () => {
  it.each([
    ["2", 2],
    ["1.5", 1.5],
    ["1,5", 1.5],
    [" 3 ", 3],
  ] as const)("«%s» → %d", (raw, expected) => {
    expect(parsePortionFactor(raw)).toBe(expected);
  });

  it.each([[undefined], [null], [""], ["abc"], ["0"], ["-2"], ["Infinity"]])(
    "%j → 1 (порожнє, нечислове, ≤ 0 чи нескінченне)",
    (raw) => {
      expect(parsePortionFactor(raw)).toBe(1);
    },
  );
});
