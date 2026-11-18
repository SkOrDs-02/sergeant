// @vitest-environment jsdom
/**
 * Відмітка звички з «Зараз» на хабі (OD-29, Р-2 (а), П-16 (А), П-17 (А)):
 * той самий шлях, що й тап у модулі, тост зі «Скасувати», рядок моменту і
 * тост віхи.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyToggleHabitCompletion,
  type RoutineState,
} from "@sergeant/routine-domain";

const TODAY = "2026-01-10";

const mocks = vi.hoisted(() => ({
  store: { current: null as unknown as RoutineState },
  trackEvent: vi.fn(),
  recordRoutineMoment: vi.fn(),
  celebrateStreakMilestone: vi.fn(),
}));

vi.mock("./routineStorage", () => ({
  loadRoutineState: () => mocks.store.current,
  toggleHabitCompletion: (s: RoutineState, id: string, dk: string) => {
    const next = applyToggleHabitCompletion(s, id, dk, { todayKey: TODAY });
    mocks.store.current = next;
    return next;
  },
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
vi.mock("./dayAnchor", () => ({ anchoredTodayKey: () => TODAY }));
vi.mock("@shared/hooks/useStreakMilestoneCelebration", () => ({
  celebrateStreakMilestone: mocks.celebrateStreakMilestone,
}));

import { afterHabitCheckIn, checkInHabitFromHub } from "./habitCheckIn";

function seed(over: Partial<RoutineState> = {}): RoutineState {
  return {
    schemaVersion: 1,
    prefs: {},
    tags: [],
    categories: [],
    habits: [
      {
        id: "water",
        name: "Вода",
        recurrence: "daily",
        startDate: "2026-01-01",
      },
      {
        id: "weekdays",
        name: "Будні",
        recurrence: "weekdays",
        startDate: "2026-01-01",
      },
    ],
    completions: {
      water: ["2026-01-04", "2026-01-05", "2026-01-06"],
    },
    skips: {},
    habitOrder: [],
    completionNotes: {},
    ...over,
  };
}

function toastStub() {
  return { success: vi.fn(() => 1) };
}

describe("checkInHabitFromHub", () => {
  beforeEach(() => {
    mocks.store.current = seed();
    mocks.trackEvent.mockReset();
    mocks.recordRoutineMoment.mockReset();
    mocks.celebrateStreakMilestone.mockReset();
  });

  it("відмічає за сьогодні, дає тост зі «Скасувати», момент, подію і віху", () => {
    const toast = toastStub();
    const outcome = checkInHabitFromHub("water", toast);

    expect(outcome.changed).toBe(true);
    expect(outcome.done).toBe(true);
    expect(mocks.store.current.completions["water"]).toContain(TODAY);
    expect(mocks.recordRoutineMoment).toHaveBeenCalledWith(
      outcome.prev,
      outcome.next,
      "water",
      TODAY,
    );
    expect(mocks.trackEvent).toHaveBeenCalledWith(
      "routine_habit_checked",
      expect.objectContaining({ state: "done", source: "hub", day_key: TODAY }),
    );
    expect(mocks.celebrateStreakMilestone).toHaveBeenCalledWith(
      "routine",
      expect.any(Number),
      expect.stringContaining("{days}"),
      toast.success,
    );

    const call = toast.success.mock.calls[0] as unknown as [
      string,
      undefined,
      { label: string; kind: string; onClick: () => void },
    ];
    expect(call[0]).toBe("Відмічено: Вода");
    expect(call[2].label).toBe("Скасувати");
    expect(call[2].kind).toBe("undo");

    call[2].onClick();
    expect(mocks.store.current.completions["water"]).not.toContain(TODAY);
    expect(mocks.trackEvent).toHaveBeenLastCalledWith(
      "routine_habit_checked",
      expect.objectContaining({ state: "undone", source: "hub" }),
    );
    expect(mocks.recordRoutineMoment).toHaveBeenCalledTimes(2);
  });

  it("незапланована сьогодні звичка: нічого не змінює, тостів немає", () => {
    // 2026-01-10 — субота, будня звичка не запланована.
    const toast = toastStub();
    const before = mocks.store.current;
    const outcome = checkInHabitFromHub("weekdays", toast);
    expect(outcome.changed).toBe(false);
    expect(mocks.store.current).toBe(before);
    expect(toast.success).not.toHaveBeenCalled();
    expect(mocks.trackEvent).not.toHaveBeenCalled();
    expect(mocks.celebrateStreakMilestone).not.toHaveBeenCalled();
  });

  it("уже відмічену з іншої вкладки звичку чекбокс не знімає", () => {
    mocks.store.current = seed({ completions: { water: [TODAY] } });
    const toast = toastStub();
    const outcome = checkInHabitFromHub("water", toast);
    expect(outcome.changed).toBe(false);
    expect(mocks.store.current.completions["water"]).toEqual([TODAY]);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("«Скасувати» після зняття відмітки в модулі нічого не ставить назад", () => {
    const toast = toastStub();
    checkInHabitFromHub("water", toast);
    mocks.store.current = seed();
    const call = toast.success.mock.calls[0] as unknown as [
      string,
      undefined,
      { onClick: () => void },
    ];
    call[2].onClick();
    expect(mocks.store.current.completions["water"]).not.toContain(TODAY);
  });
});

describe("afterHabitCheckIn", () => {
  it("no-op для незміненої відмітки", () => {
    mocks.trackEvent.mockReset();
    mocks.recordRoutineMoment.mockReset();
    const s = seed();
    afterHabitCheckIn(
      { changed: false, done: false, prev: s, next: s },
      "water",
      TODAY,
      "ui",
    );
    expect(mocks.trackEvent).not.toHaveBeenCalled();
    expect(mocks.recordRoutineMoment).not.toHaveBeenCalled();
  });
});
