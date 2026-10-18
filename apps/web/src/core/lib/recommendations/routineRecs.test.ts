// @vitest-environment jsdom
/**
 * logic-12 (аудит 2026-10-01): рекомендації хабу про звички рахуються за
 * розкладом (`calcRoutineDayProgress` / `calcRoutinePeriodCompletion`), а не
 * за `habits.length` і `habits.length * 7`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Habit } from "@sergeant/routine-domain";
import {
  __setRoutineSqliteCompletionsCacheForTests,
  __setRoutineSqliteStateCacheForTests,
  clearSqliteCompletionsCache,
  clearSqliteRoutineStateCache,
} from "@routine/lib/sqliteReader";
import { generateRecommendations } from "../recommendationEngine";
import { buildRoutineRecs, buildWeeklyHabitPctText } from "./routineRecs";

// Digest-картка читає ще й Фінік: ізолюємо його від справжнього дзеркала.
vi.mock("../../../modules/finyk/lib/monoMirrorReader", () => {
  const state = () => ({ transactions: [], accounts: [], refreshedAt: null });
  return {
    getCachedFinykMonoMirrorState: state,
    getVisibleFinykMonoMirrorState: state,
  };
});

const BASE: Partial<Habit> = {
  createdAt: "2026-01-01T00:00:00.000Z",
  startDate: "2026-01-01",
};

const DAILY = { ...BASE, id: "daily", name: "Вода", recurrence: "daily" };
const MWF = {
  ...BASE,
  id: "mwf",
  name: "Читання",
  recurrence: "weekly",
  weekdays: [0, 2, 4], // Пн, Ср, Пт (Monday-first)
};
const WEEKDAYS = {
  ...BASE,
  id: "workdays",
  name: "Робота",
  recurrence: "weekdays",
};
const FLEX3 = {
  ...BASE,
  id: "flex",
  name: "Спорт",
  recurrence: "flexible",
  weeklyTargetHistory: [{ from: "2026-01-01", target: 3 }],
};

function seed(habits: unknown[], completions: Record<string, string[]> = {}) {
  __setRoutineSqliteStateCacheForTests({
    habits: habits as Habit[],
    habitOrder: (habits as Array<{ id: string }>).map((h) => h.id),
  });
  __setRoutineSqliteCompletionsCacheForTests({ completions });
}

describe("routineRecs (logic-12)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearSqliteRoutineStateCache();
    clearSqliteCompletionsCache();
  });
  afterEach(() => {
    vi.useRealTimers();
    clearSqliteRoutineStateCache();
    clearSqliteCompletionsCache();
  });

  describe("вечірнє нагадування", () => {
    it("субота: «щодня», «Пн/Ср/Пт», «будні» → лише 1 звичка чекає, а не 3", () => {
      vi.setSystemTime(new Date(2026, 9, 3, 19, 30)); // сб 2026-10-03
      seed([DAILY, MWF, WEEKDAYS]);

      const rec = buildRoutineRecs().find(
        (r) => r.id === "routine_evening_reminder",
      );
      expect(rec?.title).toBe("Сьогодні ще не виконано: 1 звичка");
    });

    it("нічого не заплановано на сьогодні → жодного нагадування", () => {
      vi.setSystemTime(new Date(2026, 9, 3, 19, 30)); // сб
      seed([MWF, WEEKDAYS]);

      const ids = buildRoutineRecs().map((r) => r.id);
      expect(ids).not.toContain("routine_evening_reminder");
      expect(ids).not.toContain("routine_streak_at_risk");
    });

    it("усе заплановане на сьогодні виконано → нагадування немає", () => {
      vi.setSystemTime(new Date(2026, 9, 3, 19, 30));
      seed([DAILY, MWF], { daily: ["2026-10-03"] });

      expect(buildRoutineRecs().map((r) => r.id)).not.toContain(
        "routine_evening_reminder",
      );
    });

    it("звичка на паузі й звичка зі стартом у майбутньому не рахуються", () => {
      vi.setSystemTime(new Date(2026, 9, 3, 19, 30));
      seed([
        DAILY,
        { ...BASE, id: "paused", recurrence: "daily", paused: true },
        { ...BASE, id: "future", recurrence: "daily", startDate: "2026-10-10" },
      ]);

      const rec = buildRoutineRecs().find(
        (r) => r.id === "routine_evening_reminder",
      );
      expect(rec?.title).toBe("Сьогодні ще не виконано: 1 звичка");
    });
  });

  describe("серія «N днів поспіль»", () => {
    it("звичка Пн/Ср/Пт виконана в усі свої дні → серія 3 спрацьовує", () => {
      vi.setSystemTime(new Date(2026, 9, 3, 10, 0)); // сб 2026-10-03
      // Пн 28.09, Ср 30.09, Пт 02.10; Пт 25.09 не відмічено → серія рівно 3.
      seed([MWF], { mwf: ["2026-09-28", "2026-09-30", "2026-10-02"] });

      expect(buildRoutineRecs().map((r) => r.id)).toContain("routine_streak_3");
    });

    it("пропуск запланованого дня рве серію", () => {
      vi.setSystemTime(new Date(2026, 9, 3, 10, 0));
      // Ср 30.09 пропущено → від учора серія лише 1.
      seed([MWF], { mwf: ["2026-09-28", "2026-10-02"] });

      expect(
        buildRoutineRecs().filter((r) => r.id.startsWith("routine_streak_")),
      ).toHaveLength(0);
    });
  });

  describe("понеділкова картка: відсоток звичок", () => {
    // Тиждень 28.09–04.10: Вода 3/7, Робота 3/5, Спорт 2/3 → канон 8/15 = 53%
    // (наївне `звички × 7` дало б 8/21 = 38%).
    const completions = {
      daily: ["2026-09-28", "2026-09-29", "2026-09-30"],
      workdays: ["2026-09-28", "2026-09-29", "2026-09-30"],
      flex: ["2026-09-30", "2026-10-02"],
    };

    it("buildWeeklyHabitPctText → «звички 53%»", () => {
      const now = new Date(2026, 9, 5, 9, 0); // пн 05.10
      vi.setSystemTime(now);
      seed([DAILY, WEEKDAYS, FLEX3], completions);

      expect(buildWeeklyHabitPctText(new Date(2026, 8, 28), now)).toBe(
        "звички 53%",
      );
    });

    it("картка «Підсумок минулого тижня» несе 53%, а не 38%", () => {
      vi.setSystemTime(new Date(2026, 9, 5, 9, 0));
      seed([DAILY, WEEKDAYS, FLEX3], completions);

      const card = generateRecommendations().find((r) =>
        r.id?.startsWith("weekly_digest_"),
      );
      expect(card?.body).toContain("звички 53%");
      expect(card?.body).not.toContain("38%");
    });

    it("за тиждень нічого не заплановано → без «звички 0%»", () => {
      const now = new Date(2026, 9, 5, 9, 0);
      vi.setSystemTime(now);
      seed([{ ...BASE, id: "once", recurrence: "once" }]);

      expect(buildWeeklyHabitPctText(new Date(2026, 8, 28), now)).toBe("");
    });
  });
});
