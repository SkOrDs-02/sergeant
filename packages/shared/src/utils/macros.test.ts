import { describe, expect, it } from "vitest";
import {
  macrosHasAnyValue,
  macrosToTotals,
  normalizeMacrosNullable,
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
