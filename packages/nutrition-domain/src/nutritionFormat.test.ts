import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@sergeant/shared", () => ({
  toLocalISODate: vi.fn(() => "2025-06-18"),
}));

import { toLocalISODate } from "@sergeant/shared";
import { fmtMacro, todayISODate } from "./nutritionFormat.js";

const mockedToday = toLocalISODate as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedToday.mockReturnValue("2025-06-18");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fmtMacro", () => {
  it.each([
    [null, "—"],
    [undefined, "—"],
    [NaN, "—"],
    ["abc", "—"],
  ])("повертає '—' для нульових/NaN значень (%p)", (input, expected) => {
    expect(fmtMacro(input)).toBe(expected);
  });

  it("округлює числа до цілого", () => {
    expect(fmtMacro(2.4)).toBe(2);
    expect(fmtMacro(2.6)).toBe(3);
    expect(fmtMacro(-1.5)).toBe(-1); // Math.round: -1.5 → -1 (round half to +∞)
  });

  it("приймає numeric string", () => {
    expect(fmtMacro("42")).toBe(42);
    expect(fmtMacro("3.7")).toBe(4);
  });

  it("0 → 0 (не сплутується з '—')", () => {
    expect(fmtMacro(0)).toBe(0);
  });
});

describe("todayISODate", () => {
  it("делегує у @sergeant/shared#toLocalISODate з new Date()", () => {
    const result = todayISODate();
    expect(result).toBe("2025-06-18");
    expect(toLocalISODate).toHaveBeenCalledTimes(1);
    const args = mockedToday.mock.calls[0]!;
    expect(args[0]).toBeInstanceOf(Date);
  });
});
