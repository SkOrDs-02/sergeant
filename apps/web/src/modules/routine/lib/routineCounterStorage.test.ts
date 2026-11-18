// @vitest-environment jsdom
/**
 * Лічильник і автовідмітка поверх сховища (Р-1 (а) і (в), міграція 170):
 * крок із записом, памʼять «знято сьогодні» на пристрої, подія шини.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutineState } from "@sergeant/routine-domain";
import { STORAGE_KEYS } from "@sergeant/shared";

const TODAY = "2026-01-10";

const mocks = vi.hoisted(() => ({
  store: { current: null as unknown as RoutineState },
  trackEvent: vi.fn(),
  recordRoutineMoment: vi.fn(),
}));

vi.mock("./routineStorage", () => ({
  loadRoutineState: () => mocks.store.current,
  saveRoutineState: (s: RoutineState) => {
    mocks.store.current = s;
    return true;
  },
}));
vi.mock("./dayAnchor", () => ({
  anchoredTodayKey: () => TODAY,
  anchoredCompletionBounds: () => ({ todayKey: TODAY }),
}));
vi.mock("../../../core/observability/analytics", async () => {
  const actual = await vi.importActual<
    typeof import("../../../core/observability/analytics")
  >("../../../core/observability/analytics");
  return { ...actual, trackEvent: mocks.trackEvent };
});
vi.mock("./routineMoments", () => ({
  recordRoutineMoment: mocks.recordRoutineMoment,
}));

import { emitHubBus, __resetHubBusForTests } from "@shared/lib/modules/hubBus";
import {
  handleRoutineAutoMarkSignal,
  useRoutineAutoMark,
} from "../hooks/useRoutineAutoMark";
import { renderHook } from "@testing-library/react";
import {
  noteManualCompletionChange,
  readAutoMarkSuppressed,
  stepHabitCounter,
} from "./routineCounterStorage";

function seed(over: Partial<RoutineState> = {}): RoutineState {
  return {
    schemaVersion: 1,
    prefs: {},
    tags: [],
    categories: [],
    habits: [
      {
        id: "gym",
        name: "Спорт",
        recurrence: "daily",
        startDate: "2026-01-01",
        autoMarkSource: "fizruk_workout",
      },
      {
        id: "water",
        name: "Вода",
        recurrence: "daily",
        startDate: "2026-01-01",
        countTarget: 2,
      },
    ],
    completions: {},
    skips: {},
    habitOrder: [],
    completionNotes: {},
    ...over,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.store.current = seed();
  mocks.trackEvent.mockReset();
  mocks.recordRoutineMoment.mockReset();
  __resetHubBusForTests();
});

describe("stepHabitCounter", () => {
  it("записує кроки і ставить відмітку на цілі", () => {
    stepHabitCounter("water", TODAY, 1);
    expect(mocks.store.current.counts?.["water"]?.[TODAY]).toBe(1);
    const r = stepHabitCounter("water", TODAY, 1);
    expect(r.done).toBe(true);
    expect(mocks.store.current.completions["water"]).toEqual([TODAY]);
  });

  it("звичка без лічильника — без запису", () => {
    const before = mocks.store.current;
    const r = stepHabitCounter("gym", TODAY, 1);
    expect(r.changed).toBe(false);
    expect(mocks.store.current).toBe(before);
  });
});

describe("автовідмітка", () => {
  it("подія шини відмічає привʼязану звичку за сьогодні з моментом і подією auto", () => {
    renderHook(() => useRoutineAutoMark());
    emitHubBus("routineAutoMark", { source: "fizruk_workout", dayKey: TODAY });
    expect(mocks.store.current.completions["gym"]).toEqual([TODAY]);
    expect(mocks.recordRoutineMoment).toHaveBeenCalledTimes(1);
    expect(mocks.trackEvent).toHaveBeenCalledWith(
      "routine_habit_checked",
      expect.objectContaining({
        source: "auto",
        auto_source: "fizruk_workout",
      }),
    );
  });

  it("подія за вчора нічого не ставить (П-14 (А))", () => {
    expect(
      handleRoutineAutoMarkSignal({
        source: "fizruk_workout",
        dayKey: "2026-01-09",
      }),
    ).toEqual([]);
    expect(mocks.store.current.completions["gym"]).toBeUndefined();
  });

  it("знята сьогодні відмітка не повертається того дня (П-13 (А))", () => {
    handleRoutineAutoMarkSignal({ source: "fizruk_workout", dayKey: TODAY });
    const marked = mocks.store.current;
    const unmarked = { ...marked, completions: { gym: [] } };
    noteManualCompletionChange(marked, unmarked, "gym", TODAY);
    mocks.store.current = unmarked;
    expect([...readAutoMarkSuppressed(TODAY)]).toEqual(["gym"]);
    expect(
      handleRoutineAutoMarkSignal({ source: "fizruk_workout", dayKey: TODAY }),
    ).toEqual([]);
    // Наступного дня памʼять порожня.
    expect(readAutoMarkSuppressed("2026-01-11").size).toBe(0);
    expect(
      window.localStorage.getItem(STORAGE_KEYS.ROUTINE_AUTO_MARK_SUPPRESSED),
    ).toContain(TODAY);
  });
});
