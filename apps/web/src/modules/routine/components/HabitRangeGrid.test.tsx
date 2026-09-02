/** @vitest-environment jsdom */
/**
 * Unit tests for HabitRangeGrid — per-habit cells on short stats ranges.
 *
 * The counting itself is covered by `routine-domain/habitRangeRows.test.ts`;
 * here we pin the rendering contract: one row per habit, an accessible
 * summary per row, a legend, and the empty state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import type { Habit, RoutineState } from "../lib/types";

import { HabitRangeGrid } from "./HabitRangeGrid";

// Device-local "today" (ADR-0078) = пт 2026-01-10, so a 7-day window spans
// 2026-01-04..10. Vitest pins `TZ=UTC` (`apps/web/vitest.config.js`), so a
// UTC instant on that calendar day pins the same device-local date.
const FIXED_NOW = new Date("2026-01-10T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

function habit(id: string, name: string, over: Partial<Habit> = {}): Habit {
  return {
    id,
    name,
    archived: false,
    recurrence: "daily",
    startDate: "2026-01-01",
    endDate: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    ...over,
  } as Habit;
}

const completions: RoutineState["completions"] = {
  water: ["2026-01-08", "2026-01-09", "2026-01-10"],
  gym: [],
};

function renderGrid(days = 7, extra: Partial<RoutineState> = {}) {
  return render(
    <HabitRangeGrid
      habits={[habit("water", "Вода"), habit("gym", "Спортзал")]}
      completions={completions}
      days={days}
      hint={`останні ${days} днів`}
      {...(extra.skips ? { skips: extra.skips } : {})}
    />,
  );
}

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("HabitRangeGrid", () => {
  it("renders one row per habit with its name and rate", () => {
    renderGrid();
    expect(screen.getByText("Вода")).toBeInTheDocument();
    expect(screen.getByText("Спортзал")).toBeInTheDocument();
    // 3 з 7 виконано → 43%.
    expect(screen.getByText("3/7 ·")).toBeInTheDocument();
    expect(screen.getByText("0/7 ·")).toBeInTheDocument();
  });

  it("exposes each row as a single labelled image with cells hidden", () => {
    renderGrid();
    const row = screen.getByRole("img", {
      name: "Вода: 3 з 7 виконано · останні 7 днів",
    });
    // 7 днів → 7 клітинок, кожна декоративна.
    expect(row.children).toHaveLength(7);
    expect(within(row).queryAllByRole("button")).toHaveLength(0);
  });

  it("mentions skipped days in the row summary", () => {
    renderGrid(7, {
      skips: {
        gym: { "2026-01-07": { reason: "sick", at: "2026-01-07T08:00:00Z" } },
      },
    });
    expect(
      screen.getByRole("img", {
        name: "Спортзал: 0 з 7 виконано, 1 – не зміг · останні 7 днів",
      }),
    ).toBeInTheDocument();
  });

  it("renders weekday labels on the 7-day slice but not on 30 days", () => {
    const { unmount } = renderGrid(7);
    // Вікно нд 04.01 … сб 10.01 — починається з «Нд».
    expect(screen.getAllByText("Нд").length).toBeGreaterThan(0);
    unmount();

    renderGrid(30);
    expect(screen.queryByText("Нд")).not.toBeInTheDocument();
  });

  it("renders the state legend", () => {
    renderGrid();
    const legend = screen.getByRole("group", { name: "Легенда станів" });
    for (const label of [
      "виконано",
      "не зміг",
      "не виконано",
      "не заплановано",
    ]) {
      expect(within(legend).getByText(label)).toBeInTheDocument();
    }
  });

  it("falls back to an explanatory line when nothing is scheduled", () => {
    render(
      <HabitRangeGrid
        habits={[]}
        completions={{}}
        days={7}
        hint="останні 7 днів"
      />,
    );
    expect(
      screen.getByText(/жодна звичка не була запланована/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
