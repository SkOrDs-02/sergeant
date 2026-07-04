/**
 * Unit tests for the nullable numeric converters.
 *
 * Adapted from `apps/web/src/shared/lib/dualWrite/core.test.ts` — pure part.
 */
import { describe, expect, it } from "vitest";

import { toIntOrNull, toRealOrNull } from "./index.js";

describe("toIntOrNull", () => {
  it("converts a positive integer", () => {
    expect(toIntOrNull(42)).toBe(42);
  });

  it("rounds a float to the nearest integer", () => {
    expect(toIntOrNull(3.7)).toBe(4);
    expect(toIntOrNull(2.3)).toBe(2);
  });

  it("converts a numeric string", () => {
    expect(toIntOrNull("7")).toBe(7);
  });

  it("returns null for null", () => {
    expect(toIntOrNull(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(toIntOrNull(undefined)).toBeNull();
  });

  it("returns null for NaN", () => {
    expect(toIntOrNull(NaN)).toBeNull();
  });

  it("returns null for Infinity", () => {
    expect(toIntOrNull(Infinity)).toBeNull();
    expect(toIntOrNull(-Infinity)).toBeNull();
  });

  it("returns null for a non-numeric string", () => {
    expect(toIntOrNull("not-a-number")).toBeNull();
  });

  it("handles zero", () => {
    expect(toIntOrNull(0)).toBe(0);
    expect(toIntOrNull("0")).toBe(0);
  });

  it("handles negative numbers", () => {
    expect(toIntOrNull(-5)).toBe(-5);
    expect(toIntOrNull(-2.9)).toBe(-3);
  });
});

describe("toRealOrNull", () => {
  it("passes through a positive float unchanged", () => {
    expect(toRealOrNull(3.14)).toBeCloseTo(3.14, 10);
  });

  it("converts an integer to a float (value unchanged)", () => {
    expect(toRealOrNull(10)).toBe(10);
  });

  it("converts a numeric string", () => {
    expect(toRealOrNull("2.5")).toBeCloseTo(2.5, 10);
  });

  it("returns null for null", () => {
    expect(toRealOrNull(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(toRealOrNull(undefined)).toBeNull();
  });

  it("returns null for NaN", () => {
    expect(toRealOrNull(NaN)).toBeNull();
  });

  it("returns null for Infinity", () => {
    expect(toRealOrNull(Infinity)).toBeNull();
    expect(toRealOrNull(-Infinity)).toBeNull();
  });

  it("returns null for non-numeric string", () => {
    expect(toRealOrNull("abc")).toBeNull();
  });

  it("does NOT round (unlike toIntOrNull)", () => {
    // toRealOrNull keeps the full precision
    expect(toRealOrNull(1.9999)).toBeCloseTo(1.9999, 10);
  });

  it("handles zero", () => {
    expect(toRealOrNull(0)).toBe(0);
  });
});
