import { describe, expect, it } from "vitest";
import { parseDuration } from "./duration.js";

/**
 * Unit-tests for the `since=<dur>` parser used by `/audit since=24h` etc.
 *
 * The parser is fail-loud (returns `null` on anything malformed) — the
 * caller is expected to surface a usage hint to the founder, not to
 * silently fall back to a default. These tests pin that contract so
 * future "be helpful" changes have to update the suite first.
 */

describe("parseDuration", () => {
  it("parses seconds (`s`)", () => {
    expect(parseDuration("5s")).toBe(5_000);
    expect(parseDuration("1s")).toBe(1_000);
  });

  it("parses minutes (`m`)", () => {
    expect(parseDuration("30m")).toBe(30 * 60_000);
    expect(parseDuration("1m")).toBe(60_000);
  });

  it("parses hours (`h`)", () => {
    expect(parseDuration("24h")).toBe(24 * 3_600_000);
    expect(parseDuration("1h")).toBe(3_600_000);
  });

  it("parses days (`d`)", () => {
    expect(parseDuration("7d")).toBe(7 * 86_400_000);
    expect(parseDuration("1d")).toBe(86_400_000);
  });

  it("parses weeks (`w`)", () => {
    expect(parseDuration("2w")).toBe(2 * 7 * 86_400_000);
    expect(parseDuration("1w")).toBe(7 * 86_400_000);
  });

  it("is case-insensitive on the unit suffix", () => {
    expect(parseDuration("24H")).toBe(24 * 3_600_000);
    expect(parseDuration("7D")).toBe(7 * 86_400_000);
    expect(parseDuration("30M")).toBe(30 * 60_000);
  });

  it("trims surrounding whitespace", () => {
    expect(parseDuration("  24h  ")).toBe(24 * 3_600_000);
  });

  it("returns null on missing unit", () => {
    expect(parseDuration("24")).toBeNull();
    expect(parseDuration("")).toBeNull();
  });

  it("returns null on missing magnitude", () => {
    expect(parseDuration("h")).toBeNull();
    expect(parseDuration("d")).toBeNull();
  });

  it("returns null on unsupported units", () => {
    // No `y` (year) support — too ambiguous wrt leap years.
    expect(parseDuration("1y")).toBeNull();
    // No `ms` — would collide with `m` (minutes) in a single-char regex.
    expect(parseDuration("100ms")).toBeNull();
    // Spaces inside the token always invalid.
    expect(parseDuration("24 h")).toBeNull();
  });

  it("returns null on zero / negative magnitudes", () => {
    expect(parseDuration("0h")).toBeNull();
    // `-1h` doesn't match the `\d+` regex either, but pin both branches.
    expect(parseDuration("-1h")).toBeNull();
  });

  it("returns null on non-integer magnitudes", () => {
    expect(parseDuration("1.5h")).toBeNull();
    expect(parseDuration("0.5d")).toBeNull();
  });

  it("returns null when the parsed window exceeds 30 days", () => {
    expect(parseDuration("31d")).toBeNull();
    expect(parseDuration("5w")).toBeNull(); // 35d > 30d
    expect(parseDuration("999h")).toBeNull(); // ~41d
  });

  it("accepts windows exactly at the 30-day cap", () => {
    expect(parseDuration("30d")).toBe(30 * 86_400_000);
    // 4w = 28d, still under cap
    expect(parseDuration("4w")).toBe(4 * 7 * 86_400_000);
  });
});
