import { describe, expect, it, vi, afterEach } from "vitest";
import { fmtMacro, todayISODate } from "./nutritionFormat.js";

afterEach(() => {
  vi.useRealTimers();
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
  it("повертає YYYY-MM-DD за годинником пристрою (ADR-0078)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 18, 10, 0, 0));
    expect(todayISODate()).toBe("2025-06-18");
  });

  // ADR-0078: день логу належить ПРИСТРОЮ, не Києву. 22:00Z 18 червня — це
  // ще "сьогодні" (06-18) за пристроєм у цьому середовищі (TZ=UTC), але вже
  // "завтра" (06-19) за Kyiv (UTC+3 влітку) — якби функція досі форсувала
  // Kyiv, цей тест впав би.
  it("не зʼїжджає на київський день біля півночі Києва", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2025, 5, 18, 22, 0, 0)));
    expect(todayISODate()).toBe("2025-06-18");
  });
});
