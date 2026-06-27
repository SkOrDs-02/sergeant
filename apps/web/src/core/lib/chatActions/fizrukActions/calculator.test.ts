import { describe, expect, it } from "vitest";
import { calculate1rm } from "./calculator";

describe("calculate1rm", () => {
  it("returns error for zero weight", () => {
    expect(
      calculate1rm({ type: "calculate_1rm", input: { weight_kg: 0, reps: 5 } }),
    ).toContain("додатним");
  });

  it("returns error for negative weight", () => {
    expect(
      calculate1rm({
        type: "calculate_1rm",
        input: { weight_kg: -10, reps: 5 },
      }),
    ).toContain("додатним");
  });

  it("returns error for reps < 1", () => {
    expect(
      calculate1rm({
        type: "calculate_1rm",
        input: { weight_kg: 100, reps: 0 },
      }),
    ).toContain("Повторення");
  });

  it("returns error for reps >= 37", () => {
    expect(
      calculate1rm({
        type: "calculate_1rm",
        input: { weight_kg: 100, reps: 37 },
      }),
    ).toContain("1..36");
  });

  it("returns direct 1RM for 1 rep", () => {
    const result = calculate1rm({
      type: "calculate_1rm",
      input: { weight_kg: 150, reps: 1 },
    }) as string;
    expect(result).toContain("150 кг (1 повторення = вже максимум)");
  });

  it("includes exercise name when provided", () => {
    const result = calculate1rm({
      type: "calculate_1rm",
      input: { weight_kg: 100, reps: 5, exercise_name: "Присідання" },
    }) as string;
    expect(result).toContain("Присідання");
  });

  it("returns estimated 1RM with Epley and Brzycki formulas", () => {
    const result = calculate1rm({
      type: "calculate_1rm",
      input: { weight_kg: 100, reps: 5 },
    }) as string;
    expect(result).toContain("Епллі:");
    expect(result).toContain("Бжицкі:");
    expect(result).toContain("Таблиця відсотків:");
  });

  it("includes percentage table rows", () => {
    const result = calculate1rm({
      type: "calculate_1rm",
      input: { weight_kg: 100, reps: 10 },
    }) as string;
    expect(result).toContain("100%");
    expect(result).toContain("95%");
    expect(result).toContain("65%");
  });

  it("shows correct base info", () => {
    const result = calculate1rm({
      type: "calculate_1rm",
      input: { weight_kg: 80, reps: 8 },
    }) as string;
    expect(result).toContain("80 кг × 8 повт");
  });

  it("calculates correct Epley 1RM for 100kg x 10 reps", () => {
    // Epley: 100 * (1 + 10/30) = 100 * 1.333 = 133.3
    const result = calculate1rm({
      type: "calculate_1rm",
      input: { weight_kg: 100, reps: 10 },
    }) as string;
    expect(result).toContain("Епллі: 133.3 кг");
  });
});
