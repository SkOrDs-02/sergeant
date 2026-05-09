/**
 * Render tests for the Routine `HeatmapPage` screen.
 *
 * Covers:
 *  - Empty-state banner when the user has no active habits;
 *  - Empty-completions state banner when habits exist but no day has
 *    been marked yet (grid still renders as a guide);
 *  - Seeded-completions rendering → at least one l1/l2/l3 cell exists
 *    and tapping a seeded cell opens the details strip.
 */

import { fireEvent, render } from "@testing-library/react-native";

import { type Habit, type RoutineState } from "@sergeant/routine-domain";

import { _getMMKVInstance } from "@/lib/storage";
import {
  __setRoutineSqliteCompletionsCacheForTests,
  __setRoutineSqliteStateCacheForTests,
  clearSqliteCompletionsCache,
  clearSqliteRoutineStateCache,
} from "../../lib/sqliteReader";
import { __resetRoutineSqliteReadGateForTests } from "../../lib/sqliteReadGate";

import { HeatmapPage } from "./HeatmapPage";

const TODAY = new Date(2025, 0, 15, 12, 0, 0, 0);

beforeEach(() => {
  // Stage 8 PR #057r-tombstone-mobile — load now reads from the SQLite
  // warm caches instead of MMKV. Reset both so each test starts cold.
  _getMMKVInstance().clearAll();
  clearSqliteCompletionsCache();
  clearSqliteRoutineStateCache();
  __resetRoutineSqliteReadGateForTests();
});

function seed(
  habits: Habit[],
  completions: RoutineState["completions"] = {},
): void {
  __setRoutineSqliteStateCacheForTests({
    habits,
    habitOrder: habits.map((h) => h.id),
  });
  __setRoutineSqliteCompletionsCacheForTests({ completions });
}

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

describe("HeatmapPage", () => {
  it("renders the empty state when the user has no active habits", () => {
    const { getByTestId, queryByTestId } = render(
      <HeatmapPage today={TODAY} />,
    );

    expect(getByTestId("heatmap-page-empty")).toBeTruthy();
    expect(queryByTestId("habit-heatmap")).toBeNull();
  });

  it("renders the empty-completions banner when habits exist but no days are marked", () => {
    seed([habit({ id: "a", name: "A" })], {});

    const { getByTestId } = render(<HeatmapPage today={TODAY} />);

    expect(getByTestId("heatmap-page-empty-completions")).toBeTruthy();
    // The grid itself still renders alongside the banner as a guide.
    expect(getByTestId("habit-heatmap")).toBeTruthy();
  });

  it("renders the heatmap grid with seeded completions and opens details on tap", () => {
    seed([habit({ id: "a", name: "A" })], {
      a: ["2025-01-10", "2025-01-12", "2025-01-14"],
    });

    const { getByTestId, queryByTestId } = render(
      <HeatmapPage today={TODAY} />,
    );

    // Empty banners must be gone.
    expect(queryByTestId("heatmap-page-empty")).toBeNull();
    expect(queryByTestId("heatmap-page-empty-completions")).toBeNull();
    // Three seeded days exist as cells.
    expect(getByTestId("habit-heatmap-cell-2025-01-10")).toBeTruthy();
    expect(getByTestId("habit-heatmap-cell-2025-01-12")).toBeTruthy();
    expect(getByTestId("habit-heatmap-cell-2025-01-14")).toBeTruthy();

    // Tap opens details.
    fireEvent.press(getByTestId("habit-heatmap-cell-2025-01-12"));
    expect(getByTestId("habit-heatmap-details")).toBeTruthy();
  });
});
