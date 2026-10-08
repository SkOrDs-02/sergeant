/**
 * Last validated: 2026-10-08
 * Status: Active
 */
import { describe, expect, it } from "vitest";
import { MAX_PORTION_GRAMS } from "./mealFormUtils";
import {
  MAX_PORTIONS_PER_FOOD,
  validatePortions,
  type PortionDraft,
} from "./foodDraft";

const row = (id: string, name: string, grams: string): PortionDraft => ({
  id,
  name,
  grams,
});

describe("validatePortions", () => {
  it("відкидає порожній рядок без помилки", () => {
    const r = validatePortions([row("a", "", ""), row("b", "  ", " ")]);
    expect(r.portions).toEqual([]);
    expect(r.errors).toEqual({});
  });

  it("половинчастий рядок дає помилку", () => {
    const r = validatePortions([row("a", "скибка", ""), row("b", "", "30")]);
    expect(Object.keys(r.errors).sort()).toEqual(["a", "b"]);
    expect(r.portions).toEqual([]);
  });

  it("«Скибка» і «скибка» - дубль без урахування регістру", () => {
    const r = validatePortions([
      row("a", "Скибка", "30"),
      row("b", "скибка", "35"),
    ]);
    expect(r.portions).toHaveLength(1);
    expect(r.errors["b"]).toBeTruthy();
  });

  it.each(["0", String(MAX_PORTION_GRAMS + 1), "abc", "-5"])(
    "грами %s - помилка",
    (grams) => {
      const r = validatePortions([row("a", "скибка", grams)]);
      expect(r.errors["a"]).toBeTruthy();
    },
  );

  it("приймає кому в грамах", () => {
    const r = validatePortions([row("a", "ложка", "7,5")]);
    expect(r.portions).toEqual([{ id: "a", name: "ложка", grams: 7.5 }]);
  });

  it("дев'ята порція - помилка стелі", () => {
    const rows = Array.from({ length: MAX_PORTIONS_PER_FOOD + 1 }, (_, i) =>
      row(`r${i}`, `п${i}`, "10"),
    );
    expect(validatePortions(rows).limitError).toBeTruthy();
    expect(validatePortions(rows.slice(0, 8)).limitError).toBe("");
  });
});
