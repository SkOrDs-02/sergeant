/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { HabitHeatmap } from "./HabitHeatmap";
import type { Habit } from "../lib/types";

/**
 * Регресія "off-by-year" (a11y QA, 2026-06-16): heatmap «Активність за рік»
 * малює 53 тижні історії, тож його найстаріші (ліві) клітинки коректно
 * несуть торішній рік. Раніше дефолтний roving-tabindex лягав саме на цю
 * найстарішу клітинку → скрінрідер на вході у грід першою озвучував
 * торішню дату й це читалося як неправильний рік. Фікс: дефолтний таб-стоп
 * = клітинка "сьогодні" (поточний рік), історичні підписи незмінні.
 *
 * "Сьогодні" фіксуємо інстансом 2026-06-16T09:00:00Z = 12:00 Europe/Kyiv
 * (літо, UTC+3) → Kyiv-день 2026-06-16.
 */
const FIXED_NOW = new Date("2026-06-16T09:00:00Z");

const habits: Habit[] = [{ id: "h1", name: "Випити воду" }];
// Одна відмітка сьогодні (2026) і одна рівно ~52 тижні тому (2025) — на
// найстарішій клітинці гріда.
const completions: Record<string, string[]> = {
  h1: ["2026-06-16", "2025-06-16"],
};

describe("HabitHeatmap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels today's cell with the current year", () => {
    const { container } = render(
      <HabitHeatmap habits={habits} completions={completions} />,
    );
    expect(
      container.querySelector('[aria-label="2026-06-16: 1 з 1 звичок"]'),
    ).not.toBeNull();
  });

  it("defaults the single roving tab stop (tabIndex=0) to today, so the screen reader announces the current year on focus-in", () => {
    const { container } = render(
      <HabitHeatmap habits={habits} completions={completions} />,
    );
    const focusable = container.querySelectorAll('[tabindex="0"]');
    // Roving tabindex: exactly one cell is in the tab order, and it is today
    // (current year) — not the oldest cell ~52 weeks back.
    expect(focusable).toHaveLength(1);
    expect(focusable[0]?.getAttribute("aria-label")).toBe(
      "2026-06-16: 1 з 1 звичок",
    );
  });

  it("keeps real historical dates a year back on the oldest cells (does not rewrite history)", () => {
    const { container } = render(
      <HabitHeatmap habits={habits} completions={completions} />,
    );
    // The 53-week grid's leftmost cell is legitimately ~52 weeks ago, so 2025
    // is the CORRECT year there — the fix must not shift historical labels.
    expect(
      container.querySelector('[aria-label="2025-06-16: 1 з 1 звичок"]'),
    ).not.toBeNull();
  });
});
