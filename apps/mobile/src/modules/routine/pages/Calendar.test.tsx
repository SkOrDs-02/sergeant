/**
 * Render + interaction tests for `pages/Calendar.tsx` (Phase 5 / PR 2).
 *
 * Covers:
 *  - Порожній стан (без звичок) рендерить календар без краху;
 *  - Перемикач режимів видимий (Сьогодні / Тиждень / Місяць);
 *  - Звичку, запланована на сьогодні, видно у списку;
 *  - Тап по її рядку викликає `applyToggleHabitCompletion` через
 *    `useRoutineStore`, і стан зберігається у SQLite warm cache
 *    (Stage 8 PR #057r-tombstone-mobile — MMKV write retired).
 */

import { fireEvent, render } from "@testing-library/react-native";

import {
  dateKeyFromDate,
  todayDate,
  type Habit,
} from "@sergeant/routine-domain";

import { _getMMKVInstance } from "@/lib/storage";
import {
  __setRoutineSqliteCompletionsCacheForTests,
  __setRoutineSqliteStateCacheForTests,
  clearSqliteCompletionsCache,
  clearSqliteRoutineStateCache,
  getCachedSqliteCompletions,
} from "../lib/sqliteReader";
import { __resetRoutineSqliteReadGateForTests } from "../lib/sqliteReadGate";

import { Calendar } from "./Calendar";

beforeEach(() => {
  // Stage 8 PR #057r-tombstone-mobile — load/persist now read from the
  // SQLite warm caches instead of MMKV, so each test starts from a
  // known-cold cache plus a clean MMKV (in case any unrelated keys
  // are exercised).
  _getMMKVInstance().clearAll();
  clearSqliteCompletionsCache();
  clearSqliteRoutineStateCache();
  __resetRoutineSqliteReadGateForTests();
});

function seedHabit(habit: Partial<Habit> = {}): void {
  const seeded: Habit = {
    id: "h1",
    name: "Випити воду",
    emoji: "💧",
    recurrence: "daily",
    tagIds: [],
    categoryId: null,
    archived: false,
    reminderTimes: [],
    ...habit,
  } as Habit;
  __setRoutineSqliteStateCacheForTests({
    habits: [seeded],
    habitOrder: [seeded.id],
    prefs: {
      showFizrukInCalendar: false,
      showFinykSubscriptionsInCalendar: false,
    },
  });
  __setRoutineSqliteCompletionsCacheForTests({ completions: {} });
}

describe("Calendar (mobile)", () => {
  it("renders without crashing when there are no habits", () => {
    const { getByText } = render(<Calendar />);
    expect(getByText("Hub календар")).toBeTruthy();
    expect(getByText("Сьогодні")).toBeTruthy();
  });

  it("shows time-mode segmented control", () => {
    const { getAllByText } = render(<Calendar />);
    // "Сьогодні" used twice: mode button + "go-to-today" action when in
    // month view — in initial "today" mode there is only the segmented
    // entry, so this is still assertable via the label.
    expect(getAllByText("Сьогодні").length).toBeGreaterThan(0);
    expect(getAllByText("Тиждень").length).toBeGreaterThan(0);
    expect(getAllByText("Місяць").length).toBeGreaterThan(0);
  });

  it("renders a seeded daily habit in today's list", () => {
    seedHabit();
    const { getByText } = render(<Calendar />);
    expect(getByText("💧 Випити воду")).toBeTruthy();
  });

  it("toggles habit completion and persists to the SQLite warm cache", () => {
    seedHabit();
    const todayKey = dateKeyFromDate(todayDate());
    const { getByText } = render(<Calendar />);

    fireEvent.press(getByText("💧 Випити воду"));

    // Stage 8 PR #057r-tombstone-mobile — `saveRoutineState` now
    // updates the SQLite completions cache (write-through) and
    // triggers the dual-write pipeline. MMKV no longer holds the
    // routine blob, so we assert against the warm cache directly.
    const completions = getCachedSqliteCompletions();
    expect(completions.refreshedAt).not.toBeNull();
    expect(completions.completions.h1 ?? []).toContain(todayKey);
  });
});
