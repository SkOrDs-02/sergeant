/**
 * Контрактні тести конверсій одиниць комори.
 *
 * Status: Active
 */
import { describe, expect, it } from "vitest";
import {
  baseUnitFor,
  displayDecimalsFor,
  fromBaseNatural,
  fromBaseToUnit,
  massToVolumeIfKnown,
  pantryQtyNatural,
  receiptPackCount,
  receiptQtyToBase,
  toBase,
  unitDimension,
} from "./units.js";

describe("unit dimensions and base conversions", () => {
  it.each([
    ["г", "mass"],
    ["кг", "mass"],
    ["мл", "volume"],
    ["л", "volume"],
    ["шт", "count"],
  ] as const)("recognizes %s as %s", (unit, dimension) => {
    expect(unitDimension(unit)).toBe(dimension);
  });

  it("rejects an unknown unit and maps values to base units", () => {
    expect(unitDimension("уп")).toBeNull();
    expect(baseUnitFor("mass")).toBe("г");
    expect(baseUnitFor("volume")).toBe("мл");
    expect(baseUnitFor("count")).toBe("шт");
    expect(toBase(1, "уп")).toBeNull();
    expect(toBase(2, "кг")).toEqual({ dimension: "mass", base: 2000 });
    expect(toBase(3, "л")).toEqual({ dimension: "volume", base: 3000 });
    expect(fromBaseToUnit(2000, "кг")).toBe(2);
    expect(fromBaseToUnit(12, "unknown")).toBe(12);
  });

  it("returns the natural display unit at the 1000 threshold", () => {
    expect(fromBaseNatural(999, "mass")).toEqual({ value: 999, unit: "г" });
    expect(fromBaseNatural(1000, "mass")).toEqual({ value: 1, unit: "кг" });
    expect(fromBaseNatural(1500, "volume")).toEqual({ value: 1.5, unit: "л" });
    expect(fromBaseNatural(999, "volume")).toEqual({ value: 999, unit: "мл" });
    expect(fromBaseNatural(3, "count")).toEqual({ value: 3, unit: "шт" });
    expect(displayDecimalsFor("кг")).toBe(2);
    expect(displayDecimalsFor("л")).toBe(2);
    expect(displayDecimalsFor("г")).toBe(0);
    expect(displayDecimalsFor("шт")).toBe(0);
  });
});

describe("massToVolumeIfKnown", () => {
  it("converts known liquids and preserves unknown/non-mass dimensions", () => {
    expect(
      massToVolumeIfKnown({ dimension: "mass", base: 900 }, "молоко"),
    ).toEqual({
      dimension: "volume",
      base: 874,
    });
    expect(
      massToVolumeIfKnown(
        { dimension: "mass", base: 900 },
        "невідомий продукт",
      ),
    ).toEqual({
      dimension: "mass",
      base: 900,
    });
    expect(
      massToVolumeIfKnown({ dimension: "volume", base: 500 }, "молоко"),
    ).toEqual({
      dimension: "volume",
      base: 500,
    });
  });
});

describe("pantryQtyNatural", () => {
  it("normalizes aliases and rejects missing or invalid quantities", () => {
    expect(pantryQtyNatural(2, "кг")).toEqual({ value: 2, unit: "кг" });
    expect(pantryQtyNatural(250, "г")).toEqual({ value: 250, unit: "г" });
    expect(pantryQtyNatural(2, "л")).toEqual({ value: 2, unit: "л" });
    expect(pantryQtyNatural(2, "шт")).toEqual({ value: 2, unit: "шт" });
    expect(pantryQtyNatural(null, "кг")).toBeNull();
    expect(pantryQtyNatural(Number.NaN, "кг")).toBeNull();
    expect(pantryQtyNatural(2, "уп")).toBeNull();
    expect(pantryQtyNatural(2, null)).toBeNull();
  });
});

describe("receiptQtyToBase", () => {
  it("handles plain units, merged packaging, decimal commas, and density", () => {
    expect(receiptQtyToBase(2, "кг")).toEqual({ qty: 2000, unit: "г" });
    expect(receiptQtyToBase(2, "0,25л")).toEqual({ qty: 500, unit: "мл" });
    expect(receiptQtyToBase(2, "1.5 кг")).toEqual({ qty: 3000, unit: "г" });
    expect(receiptQtyToBase(1, "900г", "молоко")).toEqual({
      qty: 874,
      unit: "мл",
    });
  });

  it("returns null when receipt data cannot be interpreted safely", () => {
    expect(receiptQtyToBase(null, "кг")).toBeNull();
    expect(receiptQtyToBase(0, "кг")).toBeNull();
    expect(receiptQtyToBase(-1, "кг")).toBeNull();
    expect(receiptQtyToBase(1, null)).toBeNull();
    expect(receiptQtyToBase(1, "уп")).toBeNull();
    expect(receiptQtyToBase(1, "0,25уп")).toBeNull();
  });
});

describe("receiptPackCount", () => {
  it("returns only a presentation pack count for multiplied packaging", () => {
    expect(receiptPackCount(2, "0,25л")).toBe(2);
    expect(receiptPackCount(3, "800г")).toBe(3);
    expect(receiptPackCount(1, "0,25л")).toBeNull();
    expect(receiptPackCount(2.5, "0,25л")).toBeNull();
    expect(receiptPackCount(2, "кг")).toBeNull();
    expect(receiptPackCount(null, "0,25л")).toBeNull();
    expect(receiptPackCount(2, null)).toBeNull();
  });
});
