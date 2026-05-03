import { describe, expect, it } from "vitest";

import type { Habit } from "../../types.js";
import {
  HEATMAP_DAYS,
  HEATMAP_WEEKS,
  activeHabits,
  buildHeatmapGrid,
  countActiveDays,
  countHabitCompletionsByDay,
  currentCompletionStreak,
  findCellByDateKey,
  heatmapIntensity,
  longestCompletionStreak,
} from "./index.js";

/**
 * All test fixtures share this deterministic "today" to make grid
 * shape assertions easy to reason about. 2025-01-15 is a Wednesday
 * which forces the grid to extend into the future portion of that
 * week, exercising the `isFuture` branches.
 */
const TODAY = new Date(2025, 0, 15, 12, 0, 0, 0); // Wed 2025-01-15

function habit(partial: Partial<Habit> & Pick<Habit, "id" | "name">): Habit {
  return {
    recurrence: "daily",
    archived: false,
    tagIds: [],
    categoryId: null,
    reminderTimes: [],
    weekdays: [],
    ...partial,
  };
}

describe("activeHabits", () => {
  it("filters out archived habits and tolerates null / undefined", () => {
    const list = [
      habit({ id: "a", name: "A" }),
      habit({ id: "b", name: "B", archived: true }),
    ];
    expect(activeHabits(list).map((h) => h.id)).toEqual(["a"]);
    expect(activeHabits(null)).toEqual([]);
    expect(activeHabits(undefined)).toEqual([]);
  });
});

describe("countHabitCompletionsByDay", () => {
  it("sums completions per day across active habits only", () => {
    const habits = [
      habit({ id: "a", name: "A" }),
      habit({ id: "b", name: "B" }),
      habit({ id: "c", name: "C", archived: true }),
    ];
    const completions = {
      a: ["2025-01-10", "2025-01-11"],
      b: ["2025-01-11"],
      c: ["2025-01-11", "2025-01-12"], // archived → ignored
    };
    expect(countHabitCompletionsByDay(habits, completions)).toEqual({
      "2025-01-10": 1,
      "2025-01-11": 2,
    });
  });

  it("returns an empty object when nothing is completed", () => {
    expect(countHabitCompletionsByDay([], {})).toEqual({});
    expect(countHabitCompletionsByDay(null, null)).toEqual({});
    expect(
      countHabitCompletionsByDay([habit({ id: "a", name: "A" })], {}),
    ).toEqual({});
  });

  it("ignores unknown habit-ids in the completions map", () => {
    const habits = [habit({ id: "a", name: "A" })];
    const completions = {
      a: ["2025-01-10"],
      // `b` is not in the habits list — silently skipped.
      b: ["2025-01-10", "2025-01-11"],
    };
    expect(countHabitCompletionsByDay(habits, completions)).toEqual({
      "2025-01-10": 1,
    });
  });
});

describe("heatmapIntensity", () => {
  it("returns 'future' regardless of ratio when isFuture=true", () => {
    expect(heatmapIntensity(0, true)).toBe("future");
    expect(heatmapIntensity(0.5, true)).toBe("future");
    expect(heatmapIntensity(1, true)).toBe("future");
  });

  it("returns 'empty' for zero / negative / NaN ratios", () => {
    expect(heatmapIntensity(0, false)).toBe("empty");
    expect(heatmapIntensity(-1, false)).toBe("empty");
    expect(heatmapIntensity(Number.NaN, false)).toBe("empty");
  });

  it("buckets ratios into the l1 / l2 / l3 thresholds", () => {
    expect(heatmapIntensity(0.01, false)).toBe("l1");
    expect(heatmapIntensity(0.33, false)).toBe("l1");
    expect(heatmapIntensity(0.34, false)).toBe("l2");
    expect(heatmapIntensity(0.66, false)).toBe("l2");
    expect(heatmapIntensity(0.67, false)).toBe("l3");
    expect(heatmapIntensity(1, false)).toBe("l3");
  });
});

describe("buildHeatmapGrid", () => {
  it("returns exactly HEATMAP_WEEKS weeks × HEATMAP_DAYS days by default", () => {
    const grid = buildHeatmapGrid([], {}, TODAY);
    expect(grid.weeks).toHaveLength(HEATMAP_WEEKS);
    for (const week of grid.weeks) expect(week).toHaveLength(HEATMAP_DAYS);
  });

  it("reports today's date-key and marks only the corresponding cell", () => {
    const grid = buildHeatmapGrid([], {}, TODAY);
    expect(grid.todayKey).toBe("2025-01-15");
    const todayCells = grid.weeks.flat().filter((c) => c.isToday);
    expect(todayCells).toHaveLength(1);
    expect(todayCells[0]?.dateKey).toBe("2025-01-15");
    expect(todayCells[0]?.weekday).toBe(2); // Mon=0 → Wed=2
  });

  it("marks every cell after today as future with intensity='future'", () => {
    const grid = buildHeatmapGrid([], {}, TODAY);
    const future = grid.weeks.flat().filter((c) => c.isFuture);
    expect(future.length).toBeGreaterThan(0);
    for (const cell of future) {
      expect(cell.intensity).toBe("future");
      expect(cell.dateKey > grid.todayKey).toBe(true);
    }
  });

  it("computes the correct intensity for seeded completions", () => {
    const habits = [
      habit({ id: "a", name: "A" }),
      habit({ id: "b", name: "B" }),
      habit({ id: "c", name: "C" }),
    ];
    const completions = {
      a: ["2025-01-10", "2025-01-12", "2025-01-14"],
      b: ["2025-01-12", "2025-01-14"],
      c: ["2025-01-14"],
    };
    const grid = buildHeatmapGrid(habits, completions, TODAY);
    const byKey = new Map(grid.weeks.flat().map((c) => [c.dateKey, c]));
    // 1 of 3 → ratio 0.33 → l1
    expect(byKey.get("2025-01-10")?.intensity).toBe("l1");
    expect(byKey.get("2025-01-10")?.cnt).toBe(1);
    // 2 of 3 → ratio 0.66 → l2
    expect(byKey.get("2025-01-12")?.intensity).toBe("l2");
    // 3 of 3 → ratio 1 → l3
    expect(byKey.get("2025-01-14")?.intensity).toBe("l3");
    // empty past day
    expect(byKey.get("2025-01-11")?.intensity).toBe("empty");
  });

  it("ends the grid on the Sunday of the current week", () => {
    const grid = buildHeatmapGrid([], {}, TODAY);
    // Wed 2025-01-15's ISO week ends Sun 2025-01-19.
    expect(grid.endKey).toBe("2025-01-19");
    const lastWeek = grid.weeks.at(-1);
    expect(lastWeek?.at(-1)?.dateKey).toBe("2025-01-19");
    expect(lastWeek?.[0]?.weekday).toBe(0); // Monday
  });

  it("flags a month marker for every month present in the window", () => {
    const grid = buildHeatmapGrid([], {}, TODAY);
    // 53-week window ending mid-January covers ≥13 calendar months.
    expect(grid.monthMarkers.length).toBeGreaterThanOrEqual(13);
    // Markers appear in ascending week order.
    for (let i = 1; i < grid.monthMarkers.length; i++) {
      const cur = grid.monthMarkers[i];
      const prev = grid.monthMarkers[i - 1];
      expect(cur).toBeDefined();
      expect(prev).toBeDefined();
      expect(cur?.weekIdx ?? 0).toBeGreaterThanOrEqual(prev?.weekIdx ?? 0);
    }
  });

  it("accepts a custom number of weeks", () => {
    const grid = buildHeatmapGrid([], {}, TODAY, 4);
    expect(grid.weeks).toHaveLength(4);
    // 4 × 7 = 28 cells total.
    expect(grid.weeks.flat()).toHaveLength(28);
  });

  it("treats ratios with no active habits as empty (never NaN)", () => {
    const grid = buildHeatmapGrid(
      [habit({ id: "a", name: "A", archived: true })],
      { a: ["2025-01-10", "2025-01-11"] },
      TODAY,
    );
    const byKey = new Map(grid.weeks.flat().map((c) => [c.dateKey, c]));
    expect(byKey.get("2025-01-10")?.total).toBe(0);
    expect(byKey.get("2025-01-10")?.ratio).toBe(0);
    expect(byKey.get("2025-01-10")?.intensity).toBe("empty");
  });
});

describe("grid aggregates", () => {
  const habits = [habit({ id: "a", name: "A" }), habit({ id: "b", name: "B" })];
  const completions = {
    a: ["2025-01-11", "2025-01-12", "2025-01-13", "2025-01-14", "2025-01-15"],
    b: ["2025-01-10", "2025-01-15"],
  };

  it("countActiveDays counts past-or-today days with any completion", () => {
    const grid = buildHeatmapGrid(habits, completions, TODAY);
    expect(countActiveDays(grid)).toBe(6);
  });

  it("longestCompletionStreak finds the maximum consecutive run", () => {
    const grid = buildHeatmapGrid(habits, completions, TODAY);
    // 2025-01-10 … 2025-01-15 inclusive → 6 consecutive days.
    expect(longestCompletionStreak(grid)).toBe(6);
  });

  it("currentCompletionStreak counts back from today until an empty day", () => {
    const grid = buildHeatmapGrid(habits, completions, TODAY);
    expect(currentCompletionStreak(grid)).toBe(6);
  });

  it("currentCompletionStreak breaks on a gap before today", () => {
    const gapped = {
      a: ["2025-01-10", "2025-01-11", "2025-01-13", "2025-01-15"],
    };
    const grid = buildHeatmapGrid(
      [habit({ id: "a", name: "A" })],
      gapped,
      TODAY,
    );
    // Today (15) + 14? no — 14 is empty → streak just today = 1.
    expect(currentCompletionStreak(grid)).toBe(1);
    // Longest run is 10-11 (2 days) or the single 13 / 15, so max = 2.
    expect(longestCompletionStreak(grid)).toBe(2);
  });

  it("findCellByDateKey returns null outside the window and the cell inside", () => {
    const grid = buildHeatmapGrid(habits, completions, TODAY);
    expect(findCellByDateKey(grid, "1999-01-01")).toBeNull();
    const cell = findCellByDateKey(grid, "2025-01-12");
    expect(cell?.dateKey).toBe("2025-01-12");
    expect(cell?.cnt).toBe(1);
  });

  it("is deterministic given the same input", () => {
    const g1 = buildHeatmapGrid(habits, completions, TODAY);
    const g2 = buildHeatmapGrid(habits, completions, TODAY);
    expect(JSON.stringify(g1)).toBe(JSON.stringify(g2));
  });
});
