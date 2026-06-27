import { describe, it, expect } from "vitest";
import { calculate1rm } from "./calculator";

function makeAction(weight_kg: number, reps: number, exercise_name?: string) {
  return {
    name: "calculate_1rm" as const,
    input: { weight_kg, reps, ...(exercise_name ? { exercise_name } : {}) },
  };
}

describe("calculate1rm", () => {
  it("returns error for zero weight", () => {
    expect(calculate1rm(makeAction(0, 5))).toContain("Вага має бути");
  });

  it("returns error for negative weight", () => {
    expect(calculate1rm(makeAction(-10, 5))).toContain("Вага має бути");
  });

  it("returns error for non-finite weight (NaN)", () => {
    expect(calculate1rm(makeAction(NaN, 5))).toContain("Вага має бути");
  });

  it("returns error for zero reps", () => {
    expect(calculate1rm(makeAction(100, 0))).toContain("Повторення");
  });

  it("returns error for fractional reps", () => {
    expect(calculate1rm(makeAction(100, 2.5))).toContain("Повторення");
  });

  it("returns exact weight message for 1 rep", () => {
    const result = calculate1rm(makeAction(150, 1));
    expect(result).toContain("1RM");
    expect(result).toContain("150");
    expect(result).toContain("вже максимум");
  });

  it("includes exercise name in 1-rep result", () => {
    const result = calculate1rm(makeAction(100, 1, "Присідання"));
    expect(result).toContain("Присідання");
  });

  it("returns error for reps >= 37", () => {
    expect(calculate1rm(makeAction(80, 37))).toContain("1..36");
    expect(calculate1rm(makeAction(80, 50))).toContain("1..36");
  });

  it("calculates 1RM for typical set (5 reps, 100 kg)", () => {
    const result = calculate1rm(makeAction(100, 5));
    expect(result).toContain("1RM");
    // Epley: 100 * (1 + 5/30) = 116.7; Brzycki: 100*36/(37-5) = 112.5; avg ~114.6
    expect(result).toContain("кг");
    expect(result).toContain("Таблиця відсотків");
  });

  it("includes both Epley and Brzycki in result", () => {
    const result = calculate1rm(makeAction(80, 8));
    expect(result).toContain("Епллі");
    expect(result).toContain("Бжицкі");
  });

  it("includes all standard percentage rows", () => {
    const result = calculate1rm(makeAction(100, 5));
    expect(result).toContain("100%");
    expect(result).toContain("95%");
    expect(result).toContain("65%");
  });

  it("includes exercise name in multi-rep result", () => {
    const result = calculate1rm(makeAction(60, 10, "Жим лежачи"));
    expect(result).toContain("Жим лежачи");
  });

  it("handles edge case rep count of 36", () => {
    const result = calculate1rm(makeAction(100, 36));
    expect(result).toContain("1RM");
    expect(result).not.toContain("1..36");
  });
});
