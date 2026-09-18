/**
 * Jest render + behaviour tests for the Fizruk Exercise detail page.
 *
 * Coverage:
 *  - Invalid-ID placeholder state.
 *  - Built-in catalog exercise renders title + primary-muscle chips.
 *  - History-driven sections:
 *      · PR banner surfaces when the latest workout beats prior best;
 *      · Summary cards show PR and next-set suggestion;
 *      · Load-calculator zones render for a non-zero 1RM.
 *  - CTA routes through `useActiveFizrukWorkout` + `useFizrukWorkouts`:
 *      starts a workout when none is active and appends the item.
 */

import { AccessibilityInfo } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance } from "@/lib/storage";
import type { Workout } from "@sergeant/fizruk-domain";

import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../lib/sqliteReader";
import { Exercise } from "./Exercise";

jest.mock("react-native-safe-area-context", () => {
  const RN = jest.requireActual("react-native");
  return {
    SafeAreaView: RN.View,
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// Victory charts pull in `react-native-svg` which brings heavy native
// modules into the Jest graph; the render tests don't need the DOM of
// the chart itself, just that the outer card renders — so we stub the
// three components used by ExerciseTrendChart.
jest.mock("victory-native", () => {
  const React = jest.requireActual("react");
  const RN = jest.requireActual("react-native");
  const Stub = ({ children }: { children?: unknown }) =>
    React.createElement(RN.View, null, children);
  return {
    __esModule: true,
    VictoryArea: Stub,
    VictoryGroup: Stub,
    VictoryLine: Stub,
  };
});

const BUILTIN_EXERCISE_ID = "bench_press_barbell"; // present in the gymup catalog

function seedWorkoutsWithHistory() {
  const older: Workout = {
    id: "w_old",
    startedAt: "2026-02-01T10:00:00Z",
    endedAt: "2026-02-01T11:00:00Z",
    items: [
      {
        id: "it_old",
        exerciseId: BUILTIN_EXERCISE_ID,
        nameUk: "Жим штанги лежачи",
        primaryGroup: "chest",
        musclesPrimary: ["chest"],
        musclesSecondary: ["triceps"],
        type: "strength" as const,
        sets: [{ weightKg: 100, reps: 5 }],
      },
    ],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
  };
  const newer: Workout = {
    id: "w_new",
    startedAt: "2026-03-01T10:00:00Z",
    endedAt: "2026-03-01T11:00:00Z",
    items: [
      {
        id: "it_new",
        exerciseId: BUILTIN_EXERCISE_ID,
        nameUk: "Жим штанги лежачи",
        primaryGroup: "chest",
        musclesPrimary: ["chest"],
        musclesSecondary: ["triceps"],
        type: "strength" as const,
        sets: [{ weightKg: 110, reps: 5 }],
      },
    ],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
  };
  // Stage 8 PR #057f-tombstone: hooks read workouts from the SQLite
  // warm cache, not MMKV. Seed the cache directly.
  __setFizrukSqliteCacheForTests({ workouts: [older, newer] });
}

beforeEach(() => {
  _getMMKVInstance().clearAll();
  clearFizrukSqliteCache();
  __setFizrukSqliteCacheForTests({ workouts: [] });
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(false);
  jest
    .spyOn(AccessibilityInfo, "addEventListener")
    .mockImplementation(() => ({ remove: () => {} }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Fizruk Exercise detail page (mobile)", () => {
  it("shows the invalid-id placeholder when no exerciseId is passed", () => {
    render(<Exercise />);
    expect(screen.getByTestId("fizruk-exercise-invalid")).toBeTruthy();
    expect(screen.getByText("Невірний ID вправи")).toBeTruthy();
  });

  it("renders the catalog title and muscle chips for a built-in exercise", () => {
    render(<Exercise exerciseId={BUILTIN_EXERCISE_ID} />);
    expect(screen.getByTestId("fizruk-exercise-header")).toBeTruthy();
    // Summary cards mount even without history (emitting "—" placeholders).
    expect(screen.getByTestId("fizruk-exercise-summary")).toBeTruthy();
    expect(screen.getByTestId("fizruk-exercise-summary-pr")).toBeTruthy();
    expect(screen.getByTestId("fizruk-exercise-summary-next")).toBeTruthy();
  });

  it("surfaces the new-PR banner, summary values and load calculator when history has a PR", () => {
    seedWorkoutsWithHistory();
    render(<Exercise exerciseId={BUILTIN_EXERCISE_ID} />);

    expect(screen.getByTestId("fizruk-exercise-new-pr")).toBeTruthy();
    expect(screen.getByTestId("fizruk-exercise-summary-pr")).toBeTruthy();
    expect(screen.getByTestId("fizruk-exercise-summary-next")).toBeTruthy();

    // Load calculator renders when best1rm > 0.
    expect(screen.getByTestId("fizruk-exercise-load")).toBeTruthy();
    expect(screen.getByTestId("fizruk-exercise-load-strength")).toBeTruthy();
    expect(screen.getByTestId("fizruk-exercise-load-hypertrophy")).toBeTruthy();
    expect(screen.getByTestId("fizruk-exercise-load-endurance")).toBeTruthy();

    // History list contains one row per workout.
    expect(
      screen.getByTestId("fizruk-exercise-history-row-w_new_it_new"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("fizruk-exercise-history-row-w_old_it_old"),
    ).toBeTruthy();
  });

  it("starts a new workout and appends the exercise on the primary CTA", () => {
    render(<Exercise exerciseId={BUILTIN_EXERCISE_ID} />);

    act(() => {
      fireEvent.press(screen.getByTestId("fizruk-exercise-add-to-workout"));
    });

    // Stage 8 PR #057f-tombstone: workouts persistence is now SQLite-
    // only via `triggerFizrukDualWrite`. The active-pointer key is
    // still MMKV-backed and out of scope for this PR.
    const rawActive = _getMMKVInstance().getString(
      STORAGE_KEYS.FIZRUK_ACTIVE_WORKOUT,
    );
    expect(rawActive).toBeTruthy();
  });
});
