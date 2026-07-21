import { describe, expect, it } from "vitest";

import {
  MEASUREMENT_FIELDS,
  emptyMeasurementDraft,
  entryToMeasurementDraft,
  formatMeasurementDate,
  getMeasurementFieldDef,
  hasAnyMeasurementValue,
  isMeasurementDraftValid,
  normaliseMeasurementDraft,
  parseMeasurementValue,
  removeMeasurement,
  setMeasurementField,
  sortMeasurementsDesc,
  summariseMeasurementEntry,
  upsertMeasurement,
  validateMeasurementDraft,
  type MeasurementFieldDef,
  type MeasurementDraft,
  type MobileMeasurementEntry,
} from "./index.js";

function draftOf(
  overrides: Partial<MeasurementDraft["values"]> = {},
  at = "2026-04-20T09:00:00Z",
): MeasurementDraft {
  const base = emptyMeasurementDraft(at);
  return { at: base.at, values: { ...base.values, ...overrides } };
}

describe("MEASUREMENT_FIELDS", () => {
  it("exposes exactly the 8 phase-6 mobile fields in declaration order", () => {
    expect(MEASUREMENT_FIELDS.map((f) => f.id)).toEqual([
      "weightKg",
      "waistCm",
      "chestCm",
      "hipsCm",
      "bicepCm",
      "sleepHours",
      "energyLevel",
      "mood",
    ]);
  });

  it("getMeasurementFieldDef throws on an unknown id", () => {
    expect(() =>
      getMeasurementFieldDef("lol" as unknown as "weightKg"),
    ).toThrow();
  });
});

describe("parseMeasurementValue", () => {
  it("accepts integers, floats, and comma decimals", () => {
    expect(parseMeasurementValue("80")).toBe(80);
    expect(parseMeasurementValue("80.5")).toBe(80.5);
    expect(parseMeasurementValue("80,5")).toBe(80.5);
    expect(parseMeasurementValue("  79.9  ")).toBe(79.9);
  });

  it("returns null for blank / non-numeric / nullish", () => {
    expect(parseMeasurementValue("")).toBeNull();
    expect(parseMeasurementValue("   ")).toBeNull();
    expect(parseMeasurementValue(null)).toBeNull();
    expect(parseMeasurementValue(undefined)).toBeNull();
    expect(parseMeasurementValue("abc")).toBeNull();
    expect(parseMeasurementValue("1abc")).toBeNull();
  });
});

describe("emptyMeasurementDraft / setMeasurementField / hasAnyMeasurementValue", () => {
  it("empty draft has every field set to an empty string", () => {
    const d = emptyMeasurementDraft("2026-01-01T00:00:00Z");
    expect(d.at).toBe("2026-01-01T00:00:00Z");
    for (const f of MEASUREMENT_FIELDS) {
      expect(d.values[f.id]).toBe("");
    }
  });

  it("setMeasurementField is immutable", () => {
    const d = emptyMeasurementDraft("2026-01-01T00:00:00Z");
    const next = setMeasurementField(d, "weightKg", "80");
    expect(next.values.weightKg).toBe("80");
    expect(d.values.weightKg).toBe("");
    expect(next).not.toBe(d);
  });

  it("hasAnyMeasurementValue reacts to the first non-empty field", () => {
    expect(hasAnyMeasurementValue(draftOf())).toBe(false);
    expect(hasAnyMeasurementValue(draftOf({ weightKg: "" }))).toBe(false);
    expect(hasAnyMeasurementValue(draftOf({ weightKg: "80" }))).toBe(true);
    expect(hasAnyMeasurementValue(draftOf({ mood: "3" }))).toBe(true);
  });
});

describe("normaliseMeasurementDraft", () => {
  it("omits empty / non-numeric fields rather than writing null", () => {
    const d = draftOf({
      weightKg: "80.5",
      waistCm: "",
      chestCm: "abc",
      mood: "3",
    });
    const entry = normaliseMeasurementDraft(d, "m_1");
    expect(entry).toEqual({
      id: "m_1",
      at: "2026-04-20T09:00:00Z",
      weightKg: 80.5,
      mood: 3,
    });
  });

  it("rounds integer fields (energyLevel / mood)", () => {
    const d = draftOf({ energyLevel: "4.6", mood: "2.2" });
    const entry = normaliseMeasurementDraft(d, "m_2");
    expect(entry.energyLevel).toBe(5);
    expect(entry.mood).toBe(2);
  });

  it("accepts comma decimals", () => {
    const entry = normaliseMeasurementDraft(
      draftOf({ weightKg: "79,8" }),
      "m_3",
    );
    expect(entry.weightKg).toBe(79.8);
  });
});

describe("entryToMeasurementDraft", () => {
  it("round-trips a persisted entry back into string-form", () => {
    const entry: MobileMeasurementEntry = {
      id: "m_4",
      at: "2026-04-20T09:00:00Z",
      weightKg: 80,
      waistCm: 82,
    };
    const d = entryToMeasurementDraft(entry);
    expect(d.at).toBe("2026-04-20T09:00:00Z");
    expect(d.values.weightKg).toBe("80");
    expect(d.values.waistCm).toBe("82");
    expect(d.values.chestCm).toBe("");
    expect(d.values.mood).toBe("");
  });
});

describe("validateMeasurementDraft / isMeasurementDraftValid", () => {
  it("rejects a draft with no numeric fields set (form-level error)", () => {
    const errs = validateMeasurementDraft(draftOf());
    expect(errs.form).toBe("Вкажи хоча б одне значення");
    expect(isMeasurementDraftValid(errs)).toBe(false);
  });

  it("rejects a malformed `at` timestamp", () => {
    const errs = validateMeasurementDraft({
      at: "not-a-date",
      values: { weightKg: "80" },
    });
    expect(errs.at).toBeTruthy();
    expect(isMeasurementDraftValid(errs)).toBe(false);
  });

  it("enforces field min / max bounds", () => {
    const low = validateMeasurementDraft(draftOf({ weightKg: "5" }));
    expect(low.values?.weightKg).toMatch(/≥/);
    const high = validateMeasurementDraft(draftOf({ weightKg: "999" }));
    expect(high.values?.weightKg).toMatch(/≤/);
  });

  it("enforces integer-only fields (energy / mood)", () => {
    const errs = validateMeasurementDraft(draftOf({ energyLevel: "3" }));
    expect(errs.values?.energyLevel).toBeUndefined();
    // The normaliser rounds 3.2 → 3 but the validator should still
    // accept it; only strings that *parse to* a non-integer finite
    // number trigger the integer error.
    const errsFloat = validateMeasurementDraft(draftOf({ energyLevel: "3.5" }));
    expect(errsFloat.values?.energyLevel).toMatch(/Ціле/);
  });

  it("rejects non-numeric input with a 'Не число' message", () => {
    const errs = validateMeasurementDraft(draftOf({ weightKg: "abc" }));
    expect(errs.values?.weightKg).toBe("Не число");
  });

  it("returns a no-error object for a valid draft", () => {
    const errs = validateMeasurementDraft(
      draftOf({ weightKg: "80", waistCm: "82", mood: "4" }),
    );
    expect(errs).toEqual({});
    expect(isMeasurementDraftValid(errs)).toBe(true);
  });

  it("treats an empty values error map as valid", () => {
    expect(isMeasurementDraftValid({ values: {} })).toBe(true);
  });
});

describe("sortMeasurementsDesc", () => {
  it("orders newest-first by `at`", () => {
    const entries: MobileMeasurementEntry[] = [
      { id: "a", at: "2026-04-10T00:00:00Z" },
      { id: "b", at: "2026-04-20T00:00:00Z" },
      { id: "c", at: "2026-04-15T00:00:00Z" },
    ];
    expect(sortMeasurementsDesc(entries).map((e) => e.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("pushes entries with unparseable `at` to the bottom", () => {
    const entries: MobileMeasurementEntry[] = [
      { id: "junk", at: "not-a-date" },
      { id: "b", at: "2026-04-20T00:00:00Z" },
      { id: "a", at: "2026-04-10T00:00:00Z" },
    ];
    expect(sortMeasurementsDesc(entries).map((e) => e.id)).toEqual([
      "b",
      "a",
      "junk",
    ]);
  });

  it("keeps invalid-date entries stable when both sides are unparseable", () => {
    const entries: MobileMeasurementEntry[] = [
      { id: "junk-a", at: "not-a-date" },
      { id: "junk-b", at: "also-not-a-date" },
    ];

    expect(sortMeasurementsDesc(entries).map((e) => e.id)).toEqual([
      "junk-a",
      "junk-b",
    ]);
  });

  it("does not mutate the input array", () => {
    const entries: MobileMeasurementEntry[] = [
      { id: "a", at: "2026-04-10T00:00:00Z" },
      { id: "b", at: "2026-04-20T00:00:00Z" },
    ];
    const snapshot = entries.slice();
    sortMeasurementsDesc(entries);
    expect(entries).toEqual(snapshot);
  });
});

describe("upsertMeasurement / removeMeasurement", () => {
  const base: readonly MobileMeasurementEntry[] = [
    { id: "a", at: "2026-04-10T00:00:00Z", weightKg: 80 },
    { id: "b", at: "2026-04-20T00:00:00Z", weightKg: 81 },
  ];

  it("appends a new entry when id is unseen", () => {
    const next = upsertMeasurement(base, {
      id: "c",
      at: "2026-04-22T00:00:00Z",
      weightKg: 79,
    });
    expect(next).toHaveLength(3);
    expect(next[2]?.id).toBe("c");
  });

  it("replaces an existing entry in place", () => {
    const next = upsertMeasurement(base, {
      id: "a",
      at: "2026-04-10T00:00:00Z",
      weightKg: 85,
    });
    expect(next).toHaveLength(2);
    expect(next[0]?.weightKg).toBe(85);
    expect(next[1]?.id).toBe("b");
  });

  it("removeMeasurement drops the matching id", () => {
    const next = removeMeasurement(base, "a");
    expect(next.map((e) => e.id)).toEqual(["b"]);
  });

  it("removeMeasurement returns a new (equal) array on a miss", () => {
    const next = removeMeasurement(base, "zzz");
    expect(next).toEqual(base);
  });
});

describe("summariseMeasurementEntry / formatMeasurementDate", () => {
  it("joins up to `maxParts` labelled fields separated by · ", () => {
    const entry: MobileMeasurementEntry = {
      id: "x",
      at: "2026-04-20T00:00:00Z",
      weightKg: 80,
      waistCm: 82,
      chestCm: 100,
      hipsCm: 95,
      bicepCm: 34,
    };
    const summary = summariseMeasurementEntry(entry);
    expect(summary.split(" · ")).toHaveLength(4);
    expect(summary).toContain("Вага: 80 кг");
    expect(summary).toContain("Талія: 82 см");
  });

  it("falls back to an em-dash for an entry with no numeric fields", () => {
    expect(
      summariseMeasurementEntry({ id: "x", at: "2026-04-20T00:00:00Z" }),
    ).toBe("—");
  });

  it("omits the unit suffix when a field definition has no unit", () => {
    const fields: readonly MeasurementFieldDef[] = [
      { id: "mood", label: "Настрій", unit: "", min: 1, max: 5, integer: true },
    ];

    expect(
      summariseMeasurementEntry(
        { id: "x", at: "2026-04-20T00:00:00Z", mood: 4 },
        1,
        fields,
      ),
    ).toBe("Настрій: 4");
  });

  it("formatMeasurementDate returns a short locale string", () => {
    const out = formatMeasurementDate("2026-04-20T09:00:00Z");
    expect(out.length).toBeLessThan(20);
    expect(out).toMatch(/\d/);
  });

  it("formatMeasurementDate falls back to raw input when unparseable", () => {
    expect(formatMeasurementDate("not-a-date")).toBe("not-a-date");
  });
});
