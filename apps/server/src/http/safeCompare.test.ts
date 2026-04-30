import { describe, it, expect } from "vitest";
import { safeStringEqual } from "./safeCompare.js";

describe("safeStringEqual", () => {
  it("returns true for identical strings", () => {
    expect(safeStringEqual("abc", "abc")).toBe(true);
    expect(safeStringEqual("", "")).toBe(true);
    const long = "a".repeat(256);
    expect(safeStringEqual(long, long)).toBe(true);
  });

  it("returns false for different same-length strings", () => {
    expect(safeStringEqual("abc", "abd")).toBe(false);
    expect(safeStringEqual("Bearer xxx", "Bearer xxy")).toBe(false);
  });

  it("returns false for length mismatch without throwing", () => {
    expect(safeStringEqual("a", "ab")).toBe(false);
    expect(safeStringEqual("Bearer xxx", "Bearer xxxx")).toBe(false);
  });

  it("returns false for null/undefined inputs", () => {
    expect(safeStringEqual(null, "x")).toBe(false);
    expect(safeStringEqual(undefined, "x")).toBe(false);
    expect(safeStringEqual("x", null)).toBe(false);
    expect(safeStringEqual("x", undefined)).toBe(false);
    expect(safeStringEqual(undefined, undefined)).toBe(false);
  });

  it("treats multi-byte UTF-8 by byte length, not code-point count", () => {
    // "é" is 2 UTF-8 bytes, "e" is 1 — different byte length, must be false.
    expect(safeStringEqual("é", "e")).toBe(false);
    // Same string is true even if it has multi-byte sequences.
    expect(safeStringEqual("привіт", "привіт")).toBe(true);
  });
});
