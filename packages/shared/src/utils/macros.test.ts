import { describe, expect, it } from "vitest";
import {
  macrosHasAnyValue,
  macrosToTotals,
  normalizeMacrosNullable,
  sumMacrosNullable,
} from "./macros";

describe("shared/lib/macros", () => {
  it("normalizes finite non-negative macro values from numeric strings", () => {
    expect(
      normalizeMacrosNullable({
        kcal: "350",
        protein_g: "24.5",
        fat_g: 12,
        carbs_g: "41",
      }),
    ).toEqual({
      kcal: 350,
      protein_g: 24.5,
      fat_g: 12,
      carbs_g: 41,
    });
  });

  it("treats blank, invalid, negative, and non-object fields as unknown", () => {
    expect(
      normalizeMacrosNullable({
        kcal: "",
        protein_g: "not-a-number",
        fat_g: -1,
        carbs_g: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({
      kcal: null,
      protein_g: null,
      fat_g: null,
      carbs_g: null,
    });
    expect(normalizeMacrosNullable(null)).toEqual({
      kcal: null,
      protein_g: null,
      fat_g: null,
      carbs_g: null,
    });
    expect(normalizeMacrosNullable([])).toEqual({
      kcal: null,
      protein_g: null,
      fat_g: null,
      carbs_g: null,
    });
  });

  it("coerces unknown macro fields to zero for arithmetic totals", () => {
    expect(
      macrosToTotals({ kcal: null, protein_g: 18, fat_g: "", carbs_g: 9 }),
    ).toEqual({
      kcal: 0,
      protein_g: 18,
      fat_g: 0,
      carbs_g: 9,
    });
  });

  it("detects whether any macro field has a usable value", () => {
    expect(
      macrosHasAnyValue({ kcal: "", protein_g: null, fat_g: -2, carbs_g: "x" }),
    ).toBe(false);
    expect(
      macrosHasAnyValue({
        kcal: 0,
        protein_g: null,
        fat_g: null,
        carbs_g: null,
      }),
    ).toBe(true);
  });
});

describe("sumMacrosNullable", () => {
  it("adds field-by-field across items", () => {
    expect(
      sumMacrosNullable([
        { kcal: 120, protein_g: 4, fat_g: 2, carbs_g: 20 },
        { kcal: 300, protein_g: 21, fat_g: 11, carbs_g: 18 },
      ]),
    ).toEqual({ kcal: 420, protein_g: 25, fat_g: 13, carbs_g: 38 });
  });

  it("keeps a field null only when every item is null for it", () => {
    expect(
      sumMacrosNullable([
        { kcal: 120, protein_g: null, fat_g: 2, carbs_g: null },
        { kcal: 80, protein_g: null, fat_g: null, carbs_g: null },
      ]),
    ).toEqual({ kcal: 200, protein_g: null, fat_g: 2, carbs_g: null });
  });

  it("never turns unknown into zero", () => {
    expect(sumMacrosNullable([])).toEqual({
      kcal: null,
      protein_g: null,
      fat_g: null,
      carbs_g: null,
    });
    expect(
      sumMacrosNullable([
        { kcal: 0, protein_g: null, fat_g: null, carbs_g: null },
      ]),
    ).toEqual({ kcal: 0, protein_g: null, fat_g: null, carbs_g: null });
  });

  it("drops values normalizeMacrosNullable rejects", () => {
    expect(
      sumMacrosNullable([
        { kcal: 100, protein_g: -5, fat_g: "x", carbs_g: "" },
        { kcal: "50", protein_g: 3, fat_g: null, carbs_g: null },
      ]),
    ).toEqual({ kcal: 150, protein_g: 3, fat_g: null, carbs_g: null });
  });
});
