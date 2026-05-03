import { describe, expect, it } from "vitest";
import { parseDateSafe } from "./parseDate";

describe("parseDateSafe", () => {
  it("parses ISO strings", () => {
    const d = parseDateSafe("2026-04-15T10:30:00.000Z");
    expect(d).toBeInstanceOf(Date);
    expect(d?.toISOString()).toBe("2026-04-15T10:30:00.000Z");
  });

  it("parses epoch milliseconds", () => {
    const d = parseDateSafe(1_700_000_000_000);
    expect(d?.getTime()).toBe(1_700_000_000_000);
  });

  it("passes through Date instances", () => {
    const src = new Date("2026-01-01T00:00:00.000Z");
    const d = parseDateSafe(src);
    expect(d?.getTime()).toBe(src.getTime());
  });

  it("returns null for falsy values", () => {
    expect(parseDateSafe(null)).toBeNull();
    expect(parseDateSafe(undefined)).toBeNull();
    expect(parseDateSafe("")).toBeNull();
    expect(parseDateSafe(0)).toBeNull();
  });

  it("returns null for invalid date strings", () => {
    expect(parseDateSafe("not-a-date")).toBeNull();
    expect(parseDateSafe("2026-13-99")).toBeNull();
  });

  it("returns null for objects that cannot become a date", () => {
    expect(parseDateSafe({})).toBeNull();
    expect(parseDateSafe([])).toBeNull();
  });
});
