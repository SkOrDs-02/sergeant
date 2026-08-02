import { describe, it, expect } from "vitest";
import {
  amountMinorSchema,
  AMOUNT_MINOR_MIN,
  AMOUNT_MINOR_MAX,
  boundedDayKeySchema,
  HARD_MIN_DAY_KEY,
  HARD_MAX_DAY_KEY,
  nameTextSchema,
  NAME_MAX_LEN,
} from "./bounds.js";

describe("amountMinorSchema", () => {
  it("приймає межові значення [min; max]", () => {
    expect(amountMinorSchema.parse(AMOUNT_MINOR_MIN)).toBe(AMOUNT_MINOR_MIN);
    expect(amountMinorSchema.parse(AMOUNT_MINOR_MAX)).toBe(AMOUNT_MINOR_MAX);
  });

  it("відхиляє 0 і суми поза межами", () => {
    expect(amountMinorSchema.safeParse(0).success).toBe(false);
    expect(amountMinorSchema.safeParse(AMOUNT_MINOR_MIN - 1).success).toBe(
      false,
    );
    expect(amountMinorSchema.safeParse(AMOUNT_MINOR_MAX + 1).success).toBe(
      false,
    );
  });

  it("відхиляє дробові числа, NaN та ±Infinity", () => {
    expect(amountMinorSchema.safeParse(100.5).success).toBe(false);
    expect(amountMinorSchema.safeParse(Number.NaN).success).toBe(false);
    expect(amountMinorSchema.safeParse(Number.POSITIVE_INFINITY).success).toBe(
      false,
    );
    expect(amountMinorSchema.safeParse(Number.NEGATIVE_INFINITY).success).toBe(
      false,
    );
  });
});

describe("boundedDayKeySchema", () => {
  it("приймає межові дати HARD_MIN_DAY_KEY / HARD_MAX_DAY_KEY", () => {
    expect(boundedDayKeySchema.parse(HARD_MIN_DAY_KEY)).toBe(HARD_MIN_DAY_KEY);
    expect(boundedDayKeySchema.parse(HARD_MAX_DAY_KEY)).toBe(HARD_MAX_DAY_KEY);
  });

  it("приймає звичайну дату у форматі YYYY-MM-DD", () => {
    expect(boundedDayKeySchema.parse("2026-04-12")).toBe("2026-04-12");
  });

  it("відхиляє дату поза жорстким діапазоном", () => {
    expect(boundedDayKeySchema.safeParse("1969-12-31").success).toBe(false);
    expect(boundedDayKeySchema.safeParse("2100-01-02").success).toBe(false);
  });

  it("відхиляє неправильний формат", () => {
    expect(boundedDayKeySchema.safeParse("2026-4-12").success).toBe(false);
    expect(boundedDayKeySchema.safeParse("12-04-2026").success).toBe(false);
    expect(boundedDayKeySchema.safeParse("not-a-date").success).toBe(false);
    expect(boundedDayKeySchema.safeParse("").success).toBe(false);
  });
});

describe("nameTextSchema", () => {
  it("приймає порожній рядок і рядок максимальної довжини", () => {
    expect(nameTextSchema.parse("")).toBe("");
    const maxName = "a".repeat(NAME_MAX_LEN);
    expect(nameTextSchema.parse(maxName)).toBe(maxName);
  });

  it("відхиляє рядок довший за NAME_MAX_LEN", () => {
    const tooLong = "a".repeat(NAME_MAX_LEN + 1);
    expect(nameTextSchema.safeParse(tooLong).success).toBe(false);
  });
});
