// @vitest-environment jsdom
/**
 * `submitPastWorkout` з `activity` («Записати проведене → Заняття й час»):
 * тренування має лягати ОДНИМ записом (`restoreWorkout`), як у `useQuickLog`.
 *
 * Регресія аудиту 2026-10-01 (data-36): create + addItem + updateWorkout(kcal)
 * були трьома окремими dual-write-циклами в одному тіку. Кожен брав свій
 * `clientTs` (мілісекунда), і коли третій збігався з першим, upsert із
 * `kcalBurned` відкидав LWW-гард (локально `strictly-newer`, на сервері
 * `lww_conflict`) — «Приблизно 448 ккал» зникало.
 *
 * Мокається лише межа dual-write; diff — справжній.
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("../lib/sqliteWriter/index", () => ({
  triggerFizrukDualWrite: vi.fn(),
  isFizrukDualWriteRegistered: () => true,
}));

import { ToastProvider } from "@shared/hooks/useToast";
import { RestTimerProvider } from "../context/RestTimerProvider";
import { triggerFizrukDualWrite } from "../lib/sqliteWriter/index";
import { diffFizrukDualWriteOps } from "../lib/sqliteWriter/diff/index";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../lib/sqliteReader";
import { __resetFizrukSqliteReadGateForTests } from "../lib/sqliteReadGate";
import type { LogPastWorkoutActivity } from "../components/workouts/LogPastWorkoutSheet";
import { useWorkoutsOrchestrator } from "./useWorkoutsOrchestrator";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <RestTimerProvider>{children}</RestTimerProvider>
    </ToastProvider>
  );
}

const TIMES = {
  startedAt: "2026-08-09T15:00:00.000Z",
  endedAt: "2026-08-09T15:45:00.000Z",
};

const ACTIVITY: LogPastWorkoutActivity = {
  activityId: "running_easy",
  nameUk: "Біг, легкий темп",
  met: 8.3,
  zone: "lower",
  intensity: "normal",
  durationSec: 45 * 60,
  kcalBurned: 448,
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(triggerFizrukDualWrite).mockClear();
  __resetFizrukSqliteReadGateForTests();
  __setFizrukSqliteCacheForTests({ workouts: [] });
});
afterEach(() => {
  clearFizrukSqliteCache();
  __resetFizrukSqliteReadGateForTests();
});

describe("submitPastWorkout з activity — один запис", () => {
  it("зберігає kcalBurned і item з met/intensity одним dual-write викликом", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator(), { wrapper });
    act(() => {
      result.current.submitPastWorkout({ ...TIMES, activity: ACTIVITY });
    });

    // Рівно один dual-write для workouts (було три: create, addItem, kcal).
    expect(triggerFizrukDualWrite).toHaveBeenCalledTimes(1);

    const [prev, next] = vi.mocked(triggerFizrukDualWrite).mock.calls[0]!;
    expect(next.workouts).toHaveLength(1);
    expect(next.workouts[0]!.kcalBurned).toBe(448);
    const ops = diffFizrukDualWriteOps(prev, next);
    expect(ops.filter((o) => o.kind === "workout-upsert")).toHaveLength(1);

    // Збережене в React-стані тренування несе те саме.
    const saved = result.current.workouts[0]!;
    expect(result.current.workouts).toHaveLength(1);
    expect(saved.kcalBurned).toBe(448);
    expect(saved.startedAt).toBe(TIMES.startedAt);
    expect(saved.endedAt).toBe(TIMES.endedAt);
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0]).toMatchObject({
      exerciseId: "activity:running_easy",
      nameUk: "Біг, легкий темп",
      type: "time",
      durationSec: 45 * 60,
      met: 8.3,
      intensity: "normal",
    });
  });

  it("запис завершений і слот «одне активне» не займає", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator(), { wrapper });
    act(() => {
      result.current.submitPastWorkout({ ...TIMES, activity: ACTIVITY });
    });
    expect(result.current.activeWorkout).toBeNull();
    expect(result.current.activeWorkoutConflictOpen).toBe(false);
  });

  it("без ваги (kcalBurned: null) поле kcalBurned не пишеться, запис лишається", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator(), { wrapper });
    act(() => {
      result.current.submitPastWorkout({
        ...TIMES,
        activity: { ...ACTIVITY, kcalBurned: null },
      });
    });
    expect(triggerFizrukDualWrite).toHaveBeenCalledTimes(1);
    expect(result.current.workouts).toHaveLength(1);
    expect(result.current.workouts[0]!.kcalBurned).toBeUndefined();
  });
});
