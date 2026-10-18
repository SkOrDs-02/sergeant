// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { Habit } from "../lib/types";
import { HabitHeatmap } from "./HabitHeatmap";
import { HabitRangeGrid } from "./HabitRangeGrid";
import { HabitLeadersBlock } from "./HabitLeadersBlock";

const habits: Habit[] = [
  { id: "h", name: "Вода", recurrence: "daily", startDate: "2026-09-01" },
];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function resume() {
  act(() => {
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
it("moves the heatmap's today marker without a completion write", () => {
  const { container } = render(
    <HabitHeatmap habits={habits} completions={{ h: ["2026-10-18"] }} />,
  );
  expect(container.querySelector('[data-today="true"]')).toHaveAttribute(
    "aria-label",
    "2026-10-18: 1 з 1 запланованих",
  );
  resume();
  expect(container.querySelector('[data-today="true"]')).toHaveAttribute(
    "aria-label",
    "2026-10-19: 0 з 1 запланованих",
  );
});
it("slides the seven-day habit rows without a completion write", () => {
  render(
    <HabitRangeGrid
      habits={habits}
      completions={{ h: ["2026-10-12"] }}
      days={7}
      hint="останні 7 днів"
    />,
  );
  expect(screen.getByRole("img")).toHaveAccessibleName(
    "Вода: 1 з 7 виконано · останні 7 днів",
  );
  resume();
  expect(screen.getByRole("img")).toHaveAccessibleName(
    "Вода: 0 з 7 виконано · останні 7 днів",
  );
});
it("keeps the leaders window at 30 civil days instead of freezing its start", () => {
  const { container } = render(
    <HabitLeadersBlock habits={habits} completions={{ h: ["2026-09-19"] }} />,
  );
  expect(container).toHaveTextContent("1/30");
  resume();
  expect(container).toHaveTextContent("0/30");
});
