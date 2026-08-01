import { describe, it, expect } from "vitest";
import { clampNumericInput } from "./numberInput";

const MAX_WEIGHT_KG = 1000;

describe("clampNumericInput", () => {
  it("reads an empty field as zero", () => {
    expect(clampNumericInput("", MAX_WEIGHT_KG)).toBe(0);
  });

  it("passes a value inside the range through", () => {
    expect(clampNumericInput("82.5", MAX_WEIGHT_KG)).toBe(82.5);
  });

  it("clamps above the ceiling instead of storing it", () => {
    expect(clampNumericInput("99999999", MAX_WEIGHT_KG)).toBe(MAX_WEIGHT_KG);
    expect(clampNumericInput("1e9", MAX_WEIGHT_KG)).toBe(MAX_WEIGHT_KG);
  });

  it("rejects negatives, NaN and Infinity", () => {
    expect(clampNumericInput("-5", MAX_WEIGHT_KG)).toBe(0);
    expect(clampNumericInput("abc", MAX_WEIGHT_KG)).toBe(0);
    expect(clampNumericInput("Infinity", MAX_WEIGHT_KG)).toBe(0);
  });
});
