import { describe, expect, it } from "vitest";

import {
  getMeasurementFieldDef,
  MEASUREMENT_FIELD_IDS,
  MEASUREMENT_FIELDS,
} from "./fields.js";

describe("MEASUREMENT_FIELDS", () => {
  it("is non-empty and every id has a matching entry in MEASUREMENT_FIELD_IDS", () => {
    expect(MEASUREMENT_FIELDS.length).toBeGreaterThan(0);
    expect(MEASUREMENT_FIELD_IDS).toEqual(MEASUREMENT_FIELDS.map((f) => f.id));
  });
});

describe("getMeasurementFieldDef", () => {
  it("returns the definition for every known field id", () => {
    for (const id of MEASUREMENT_FIELD_IDS) {
      const def = getMeasurementFieldDef(id);
      expect(def.id).toBe(id);
    }
  });

  it("returns the exact field def object (min/max/unit/label) for weightKg", () => {
    const def = getMeasurementFieldDef("weightKg");
    expect(def).toEqual({
      id: "weightKg",
      label: "Вага",
      unit: "кг",
      min: 20,
      max: 400,
    });
  });

  it("marks energyLevel and mood as integer fields", () => {
    expect(getMeasurementFieldDef("energyLevel").integer).toBe(true);
    expect(getMeasurementFieldDef("mood").integer).toBe(true);
  });

  it("leaves integer undefined for non-integer fields", () => {
    expect(getMeasurementFieldDef("weightKg").integer).toBeUndefined();
  });

  it("throws for an unknown field id", () => {
    expect(() => getMeasurementFieldDef("notAField" as never)).toThrowError(
      /Unknown measurement field id: notAField/,
    );
  });
});
