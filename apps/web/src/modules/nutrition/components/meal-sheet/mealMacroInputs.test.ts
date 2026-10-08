/**
 * Last validated: 2026-10-08
 * Status: Active
 */
import { describe, expect, it } from "vitest";

import {
  MAX_KCAL_PER_MEAL,
  macrosAreAllEmpty,
  parseMealMacroInputs,
  pickedFoodLabel,
  withoutSeededFields,
} from "./mealMacroInputs";

const FIELDS = { kcal: "", protein_g: "", fat_g: "", carbs_g: "" };

describe("parseMealMacroInputs", () => {
  it("порожні поля - null, а не помилка; кома приймається", () => {
    const r = parseMealMacroInputs({ ...FIELDS, kcal: "12,5" });
    expect(r).toEqual({
      ok: true,
      macros: { kcal: 12.5, protein_g: null, fat_g: null, carbs_g: null },
    });
  });

  it("відхиляє нечисловий ввід", () => {
    const r = parseMealMacroInputs({ ...FIELDS, protein_g: "abc" });
    expect(r.ok).toBe(false);
  });

  it("відхиляє калорії та БЖВ понад стелю", () => {
    const kcal = parseMealMacroInputs({
      ...FIELDS,
      kcal: String(MAX_KCAL_PER_MEAL + 1),
    });
    expect(kcal).toMatchObject({ ok: false });
    const fat = parseMealMacroInputs({ ...FIELDS, fat_g: "2001" });
    expect(fat).toMatchObject({ ok: false });
  });
});

describe("macrosAreAllEmpty", () => {
  it("true для null/0, false коли є хоч одне значення", () => {
    expect(
      macrosAreAllEmpty({ kcal: null, protein_g: 0, fat_g: null, carbs_g: 0 }),
    ).toBe(true);
    expect(
      macrosAreAllEmpty({ kcal: 1, protein_g: 0, fat_g: null, carbs_g: 0 }),
    ).toBe(false);
  });
});

describe("pickedFoodLabel", () => {
  it("склеює назву й бренд, порожній без продукту", () => {
    expect(pickedFoodLabel({ name: "Курка", brand: "Ряба" })).toBe(
      "Курка Ряба",
    );
    expect(pickedFoodLabel(null)).toBe("");
  });
});

describe("withoutSeededFields", () => {
  const form = { ...FIELDS, kcal: "100", name: "Курка", err: "x" };

  it("чистить КБЖВ і засіяну назву", () => {
    expect(withoutSeededFields(form, "Курка")).toMatchObject({
      name: "",
      kcal: "",
      err: "",
    });
  });

  it("не чіпає назву, набрану людиною", () => {
    expect(withoutSeededFields(form, "Інше").name).toBe("Курка");
  });
});
