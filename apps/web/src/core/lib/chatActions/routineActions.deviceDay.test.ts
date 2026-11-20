// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { deviceDayKey } from "@sergeant/shared";
import type { Habit } from "@sergeant/routine-domain";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import {
  __setRoutineSqliteStateCacheForTests,
  __setRoutineSqliteCompletionsCacheForTests,
  clearSqliteRoutineStateCache,
  clearSqliteCompletionsCache,
} from "../../../modules/routine/lib/sqliteReader";
import { handleRoutineAction } from "./routineActions";
import { handleQueryRoutineAction } from "./queryRoutineActions";
import type { ChatAction } from "./types";

/**
 * ADR-0078: відмітки звичок лежать під день-ключами ПРИСТРОЮ, тож межі
 * вікон `habit_stats` / `habit_trend` / `query_habits` теж рахуються за
 * годинником пристрою. До 2026-11-18 вони брали київський день: на пристрої
 * поза Києвом після київської півночі «сьогодні» інструмента вже було
 * завтрашнім, і щойно зроблена відмітка випадала з вікна.
 *
 * Vitest пінить `TZ=UTC` (`vitest.config.js`), тобто пристрій тут «не в Києві».
 */

/** 22:30 на пристрої 22 квітня; у Києві (EEST, +3) це вже 01:30 23 квітня. */
const LATE = new Date(2026, 3, 22, 22, 30);
const deviceOutsideKyiv = getKyivDayKey(LATE) !== deviceDayKey(LATE);

const HABIT = {
  id: "h1",
  name: "Вода",
  archived: false,
  paused: false,
  recurrence: "daily",
  startDate: "2026-01-01",
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  reminderTimes: [],
  createdAt: "2026-01-01T00:00:00.000Z",
} as unknown as Habit;

function text(out: ReturnType<typeof handleRoutineAction>): string {
  if (out == null) throw new Error("handler returned nothing");
  return typeof out === "string" ? out : out.result;
}

beforeEach(() => {
  localStorage.clear();
  clearSqliteRoutineStateCache();
  clearSqliteCompletionsCache();
  __setRoutineSqliteStateCacheForTests({
    habits: [HABIT],
    habitOrder: ["h1"],
  });
  // Відмітка зроблена сьогодні за годинником пристрою.
  __setRoutineSqliteCompletionsCacheForTests({
    completions: { h1: ["2026-04-22"] },
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(LATE);
});
afterEach(() => {
  clearSqliteRoutineStateCache();
  clearSqliteCompletionsCache();
  vi.useRealTimers();
});

describe.skipIf(!deviceOutsideKyiv)(
  "звичкові інструменти · пристрій не в Києві, після київської півночі",
  () => {
    it("habit_stats: сьогоднішня відмітка пристрою у вікні й у серії", () => {
      const out = text(
        handleRoutineAction({
          name: "habit_stats",
          input: { habit_id: "h1", period_days: 1 },
        } as ChatAction),
      );
      expect(out).toContain("Виконано: 1/1 (100%)");
      expect(out).toContain("Поточна серія: 1 днів");
    });

    it("habit_trend: тиждень бачить сьогоднішню відмітку", () => {
      const out = text(
        handleRoutineAction({
          name: "habit_trend",
          input: { habit_id: "h1", period_days: 1 },
        } as ChatAction),
      );
      expect(out).toContain("Тиждень 1: 100%");
    });

    it("query_habits: вікно закінчується сьогоднішнім днем пристрою", () => {
      const out = text(
        handleQueryRoutineAction({
          name: "query_habits",
          input: { habit: "h1", period_days: 1 },
        } as ChatAction),
      );
      expect(out).toContain("Виконано: 1/1");
    });
  },
);
