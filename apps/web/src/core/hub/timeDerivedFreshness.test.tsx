// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Workout } from "@sergeant/fizruk-domain/domain";
import {
  defaultNutritionPrefs,
  type NutritionLog,
  type GoalPeriod,
} from "@sergeant/nutrition-domain";
import { useRestDayOverdueInsight } from "../../modules/fizruk/hooks/useRestDayOverdueInsight";
import { useTrainingProgram } from "../../modules/fizruk/hooks/useTrainingProgram";
import { useProteinLowInsight } from "../../modules/nutrition/hooks/useProteinLowInsight";
import { useStreakSevenDaysInsight } from "../../modules/nutrition/hooks/useStreakSevenDaysInsight";
import { useStreakRecordPendingInsight } from "../../modules/routine/hooks/useStreakRecordPendingInsight";
import { loadRoutineState } from "../../modules/routine/lib/routineStorage";
import { useTodoEveningInsight } from "../../modules/routine/hooks/useTodoEveningInsight";

const originalTz = process.env["TZ"];
beforeEach(() => {
  process.env["TZ"] = "Europe/Kyiv";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  if (originalTz === undefined) delete process.env["TZ"];
  else process.env["TZ"] = originalTz;
});
function resume(at: string) {
  act(() => {
    vi.setSystemTime(new Date(at));
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
it("shows pending habits when the device evening starts without a habit edit", () => {
  vi.setSystemTime(new Date("2026-10-18T16:59:59Z")); // 19:59 device
  const routine = {
    ...loadRoutineState(),
    habits: ["a", "b"].map((id) => ({
      id,
      name: id,
      recurrence: "daily" as const,
      startDate: "2026-10-01",
    })),
  };
  const { result } = renderHook(() => useTodoEveningInsight(routine));
  expect(result.current).toBeNull();
  act(() => {
    vi.advanceTimersByTime(2_001);
  });
  expect(result.current?.id).toBe("routine-todo-evening");
});
it("re-evaluates the rest-day insight when a third rest day starts", () => {
  const workouts: Workout[] = [
    {
      id: "w",
      startedAt: "2026-10-16T08:00:00Z",
      endedAt: "2026-10-16T09:00:00Z",
      items: [],
      groups: [],
      warmup: null,
      cooldown: null,
      note: "",
    },
  ];
  const { result } = renderHook(() => useRestDayOverdueInsight(workouts, true));
  expect(result.current).toBeNull();
  resume("2026-10-19T08:00:00Z");
  expect(result.current?.title).toContain("3 дні");
});
it.each(["resume", "minute timer"])(
  "re-evaluates the protein evening gate with unchanged data on %s",
  (signal) => {
    vi.setSystemTime(new Date("2026-10-18T14:59:59Z")); // 17:59 Kyiv
    const log = {};
    const prefs = { ...defaultNutritionPrefs(), dailyTargetProtein_g: 120 };
    const { result } = renderHook(() => useProteinLowInsight(log, prefs));
    expect(result.current).toBeNull();
    if (signal === "resume") resume("2026-10-18T15:01:00Z");
    else
      act(() => {
        vi.advanceTimersByTime(2_001);
      });
    expect(result.current?.id).toBe("nutrition-protein-low");
  },
);
it("expires yesterday's seven-day calorie streak without a log write", () => {
  const log: NutritionLog = Object.fromEntries(
    Array.from({ length: 7 }, (_, i) => [
      `2026-10-${18 - i}`,
      {
        meals: [
          {
            id: `meal${i}`,
            name: "Їжа",
            label: "Їжа",
            time: "12:00",
            mealType: "lunch",
            source: "manual",
            macroSource: "manual",
            amount_g: null,
            foodId: null,
            macros: { kcal: 2000, protein_g: 0, fat_g: 0, carbs_g: 0 },
          },
        ],
      },
    ]),
  );
  const goals: GoalPeriod[] = [
    {
      id: "goal",
      effectiveFrom: "2026-10-01",
      kcal: 2000,
      proteinG: null,
      fatG: null,
      carbsG: null,
      waterMl: null,
      origin: "manual",
      createdAt: "2026-10-01T12:00:00Z",
    },
  ];
  const { result } = renderHook(() => useStreakSevenDaysInsight(log, goals));
  expect(result.current).not.toBeNull();
  resume("2026-10-19T08:00:00Z");
  expect(result.current).toBeNull();
});
it("expires a pending habit streak after missed days without a record write", () => {
  const routine = {
    ...loadRoutineState(),
    habits: [
      {
        id: "h",
        name: "Читати",
        recurrence: "daily" as const,
        startDate: "2026-10-01",
      },
    ],
    completions: {
      h: [
        "2026-10-10",
        "2026-10-11",
        "2026-10-12",
        "2026-10-13",
        "2026-10-16",
        "2026-10-17",
        "2026-10-18",
      ],
    },
  };
  const { result } = renderHook(() => useStreakRecordPendingInsight(routine));
  expect(result.current).not.toBeNull();
  resume("2026-10-20T08:00:00Z");
  expect(result.current).toBeNull();
});
it("changes the active program's session when the day changes", () => {
  const { result } = renderHook(useTrainingProgram);
  const program = result.current.programs.find((p) =>
    p.schedule.some((s) => s.day === 1),
  );
  expect(program).toBeDefined();
  act(() => result.current.activateProgram(program!.id));
  const sunday = result.current.todaySession;
  resume("2026-10-19T08:00:00Z");
  expect(result.current.todaySession).not.toEqual(sunday);
  expect(result.current.todaySession?.day).toBe(1);
});
