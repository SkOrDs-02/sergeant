import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { emptyForm } from "./mealFormUtils";

// mealTypeByNow comes from @sergeant/nutrition-domain via the mealTypes re-export.
// We stub it so tests are not hour-sensitive.
vi.mock("../../lib/mealTypes", () => ({
  mealTypeByNow: () => "lunch" as const,
}));

describe("emptyForm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a form with empty name when no photoResult provided", () => {
    const form = emptyForm();
    expect(form.name).toBe("");
  });

  it("sets mealType from mealTypeByNow (stubbed as lunch)", () => {
    const form = emptyForm();
    expect(form.mealType).toBe("lunch");
  });

  it("formats the time as HH:MM using current clock", () => {
    const form = emptyForm();
    expect(form.time).toMatch(/^\d{2}:\d{2}$/);
  });

  it("initializes macro fields as empty strings when no photoResult", () => {
    const form = emptyForm();
    expect(form.kcal).toBe("");
    expect(form.protein_g).toBe("");
    expect(form.fat_g).toBe("");
    expect(form.carbs_g).toBe("");
  });

  it("initializes err as empty string", () => {
    expect(emptyForm().err).toBe("");
  });

  it("uses dishName from photoResult when provided", () => {
    const form = emptyForm({ dishName: "Гречана каша" });
    expect(form.name).toBe("Гречана каша");
  });

  it("uses null dishName → empty string", () => {
    const form = emptyForm({ dishName: null });
    expect(form.name).toBe("");
  });

  it("populates kcal from photoResult.macros (rounded)", () => {
    const form = emptyForm({ macros: { kcal: 312.7 } });
    expect(form.kcal).toBe("313");
  });

  it("populates protein_g from photoResult.macros (rounded)", () => {
    const form = emptyForm({ macros: { protein_g: 24.3 } });
    expect(form.protein_g).toBe("24");
  });

  it("populates fat_g from photoResult.macros (rounded)", () => {
    const form = emptyForm({ macros: { fat_g: 8.9 } });
    expect(form.fat_g).toBe("9");
  });

  it("populates carbs_g from photoResult.macros (rounded)", () => {
    const form = emptyForm({ macros: { carbs_g: 45.1 } });
    expect(form.carbs_g).toBe("45");
  });

  it("leaves kcal empty when photoResult.macros.kcal is null", () => {
    const form = emptyForm({ macros: { kcal: null } });
    expect(form.kcal).toBe("");
  });

  it("handles partial macros — fills present fields only", () => {
    const form = emptyForm({ macros: { kcal: 500, protein_g: 30 } });
    expect(form.kcal).toBe("500");
    expect(form.protein_g).toBe("30");
    expect(form.fat_g).toBe(""); // not provided
    expect(form.carbs_g).toBe(""); // not provided
  });

  it("handles null photoResult gracefully (same as no arg)", () => {
    const form = emptyForm(null);
    expect(form.name).toBe("");
    expect(form.kcal).toBe("");
  });
});
