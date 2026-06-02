import { describe, it, expect } from "vitest";
import { lastValidValue, firstValidValue } from "./trendUtils";

type Row = { value: number | null };

describe("lastValidValue", () => {
  it("returns null for an empty array", () => {
    expect(lastValidValue([])).toBeNull();
  });

  it("returns null when all values are null", () => {
    const data: Row[] = [{ value: null }, { value: null }];
    expect(lastValidValue(data)).toBeNull();
  });

  it("returns the last non-null finite value", () => {
    const data: Row[] = [{ value: 70 }, { value: 71 }, { value: null }];
    expect(lastValidValue(data)).toBe(71);
  });

  it("skips trailing null entries and finds the last valid", () => {
    const data: Row[] = [
      { value: 68 },
      { value: 69 },
      { value: null },
      { value: null },
    ];
    expect(lastValidValue(data)).toBe(69);
  });

  it("returns the only valid value when surrounded by nulls", () => {
    const data: Row[] = [{ value: null }, { value: 75 }, { value: null }];
    expect(lastValidValue(data)).toBe(75);
  });

  it("returns the last element when all values are valid", () => {
    const data: Row[] = [{ value: 60 }, { value: 62 }, { value: 65 }];
    expect(lastValidValue(data)).toBe(65);
  });

  it("ignores non-finite values (Infinity, NaN stored as number)", () => {
    const data: Row[] = [
      { value: 70 },
      { value: NaN as unknown as number },
      { value: Infinity as unknown as number },
    ];
    expect(lastValidValue(data)).toBe(70);
  });
});

describe("firstValidValue", () => {
  it("returns null for an empty array", () => {
    expect(firstValidValue([])).toBeNull();
  });

  it("returns null when all values are null", () => {
    const data: Row[] = [{ value: null }, { value: null }];
    expect(firstValidValue(data)).toBeNull();
  });

  it("returns the first non-null finite value", () => {
    const data: Row[] = [{ value: null }, { value: 55 }, { value: 60 }];
    expect(firstValidValue(data)).toBe(55);
  });

  it("returns the first element when all are valid", () => {
    const data: Row[] = [{ value: 80 }, { value: 81 }, { value: 82 }];
    expect(firstValidValue(data)).toBe(80);
  });

  it("skips leading nulls correctly", () => {
    const data: Row[] = [
      { value: null },
      { value: null },
      { value: 73 },
      { value: 75 },
    ];
    expect(firstValidValue(data)).toBe(73);
  });

  it("lastValidValue and firstValidValue agree on a single-element valid array", () => {
    const data: Row[] = [{ value: 88 }];
    expect(firstValidValue(data)).toBe(88);
    expect(lastValidValue(data)).toBe(88);
  });

  it("firstValidValue and lastValidValue return different values when data has trend", () => {
    const data: Row[] = [{ value: 90 }, { value: 85 }, { value: 80 }];
    expect(firstValidValue(data)).toBe(90);
    expect(lastValidValue(data)).toBe(80);
  });
});
