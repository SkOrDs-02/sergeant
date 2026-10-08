// @vitest-environment jsdom
/**
 * Unit tests for useRoutineDerivedData.
 *
 * All computations here are pure useMemo derivations from `routine`,
 * `timeState`, `tagFilter`, and `listQuery`. We freeze Kyiv time at
 * 2026-06-04 (Thursday, week Mon 2026-06-01..Sun 2026-06-07) so date-key
 * assertions stay deterministic.
 *
 * Test scope:
 *   - range derivation for each timeMode
 *   - filtering by tagFilter / listQuery
 *   - tagChips enumeration
 *   - derived booleans (hasNoHabits, canBulkMark, listIsEmpty, hasListFilter)
 *   - rangeLabel localised strings
 *   - todayKey equals the Kyiv date key
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "@fizruk/lib/sqliteReader";
import { notifyFizrukSqliteCacheRefresh } from "@fizruk/lib/sqliteReadGate";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "@finyk/lib/sqliteReader";
import { notifyFinykSqliteCacheRefresh } from "@finyk/lib/sqliteReadGate";
import { defaultRoutineState } from "@sergeant/routine-domain";
import { useRoutineDerivedData } from "./useRoutineDerivedData";
import type { TimeState } from "./useRoutineTimeState";
import type { RoutineState } from "./lib/types";

// ── Kyiv clock fixture ────────────────────────────────────────────────────────
// 2026-06-04T12:00:00 EEST (UTC+3) = 2026-06-04T09:00:00Z
// ISO weekday = Thursday; ISO week starts Monday 2026-06-01.
const KYIV_THURSDAY = new Date("2026-06-04T09:00:00Z");

// ── helpers ───────────────────────────────────────────────────────────────────

function mkTimeState(overrides: Partial<TimeState> = {}): TimeState {
  return {
    timeMode: "today",
    monthCursor: { y: 2026, m: 5 }, // June (0-indexed)
    selectedDay: "2026-06-04",
    ...overrides,
  };
}

function mkRoutine(overrides: Partial<RoutineState> = {}): RoutineState {
  return { ...defaultRoutineState(), ...overrides };
}

function buildParams(
  overrides: Partial<Parameters<typeof useRoutineDerivedData>[0]> = {},
) {
  return {
    routine: mkRoutine(),
    timeState: mkTimeState(),
    tagFilter: null,
    listQuery: "",
    finykCalendarTick: 0,
    ...overrides,
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("useRoutineDerivedData", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(KYIV_THURSDAY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("range derivation — today mode", () => {
    it("range.startKey === range.endKey === '2026-06-04'", () => {
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({ timeState: mkTimeState({ timeMode: "today" }) }),
        ),
      );
      expect(result.current.range.startKey).toBe("2026-06-04");
      expect(result.current.range.endKey).toBe("2026-06-04");
    });
  });

  describe("range derivation — tomorrow mode", () => {
    it("range covers 2026-06-05 only", () => {
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({ timeState: mkTimeState({ timeMode: "tomorrow" }) }),
        ),
      );
      expect(result.current.range.startKey).toBe("2026-06-05");
      expect(result.current.range.endKey).toBe("2026-06-05");
    });
  });

  describe("range derivation — day mode", () => {
    it("range covers only the selectedDay", () => {
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({
            timeState: mkTimeState({
              timeMode: "day",
              selectedDay: "2026-06-10",
            }),
          }),
        ),
      );
      expect(result.current.range.startKey).toBe("2026-06-10");
      expect(result.current.range.endKey).toBe("2026-06-10");
    });
  });

  describe("range derivation — week mode", () => {
    it("range spans Mon→Sun of the ISO week containing selectedDay", () => {
      // selectedDay = Thursday 2026-06-04 → week = Mon 2026-06-01..Sun 2026-06-07
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({
            timeState: mkTimeState({
              timeMode: "week",
              selectedDay: "2026-06-04",
            }),
          }),
        ),
      );
      expect(result.current.range.startKey).toBe("2026-06-01");
      expect(result.current.range.endKey).toBe("2026-06-07");
    });

    it("rangeLabel for week mode is 'Цей тиждень'", () => {
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({ timeState: mkTimeState({ timeMode: "week" }) }),
        ),
      );
      expect(result.current.rangeLabel).toBe("Цей тиждень");
    });
  });

  describe("range derivation — month mode", () => {
    it("range covers all of June 2026", () => {
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({
            timeState: mkTimeState({
              timeMode: "month",
              monthCursor: { y: 2026, m: 5 },
            }),
          }),
        ),
      );
      expect(result.current.range.startKey).toBe("2026-06-01");
      expect(result.current.range.endKey).toBe("2026-06-30");
    });
  });

  describe("rangeLabel", () => {
    it("'today' mode → 'Сьогодні'", () => {
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({ timeState: mkTimeState({ timeMode: "today" }) }),
        ),
      );
      expect(result.current.rangeLabel).toBe("Сьогодні");
    });

    it("'tomorrow' mode → 'Завтра'", () => {
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({ timeState: mkTimeState({ timeMode: "tomorrow" }) }),
        ),
      );
      expect(result.current.rangeLabel).toBe("Завтра");
    });
  });

  describe("todayKey", () => {
    it("equals the Kyiv date key for the frozen clock", () => {
      const { result } = renderHook(() => useRoutineDerivedData(buildParams()));
      expect(result.current.todayKey).toBe("2026-06-04");
    });
  });

  describe("hasNoHabits / activeHabitsCount", () => {
    it("hasNoHabits=true when no habits", () => {
      const { result } = renderHook(() => useRoutineDerivedData(buildParams()));
      expect(result.current.hasNoHabits).toBe(true);
      expect(result.current.activeHabitsCount).toBe(0);
    });

    it("hasNoHabits=false when there is an active habit", () => {
      const routine = mkRoutine({
        habits: [{ id: "h1", name: "Read" }],
      });
      const { result } = renderHook(() =>
        useRoutineDerivedData(buildParams({ routine })),
      );
      expect(result.current.hasNoHabits).toBe(false);
      expect(result.current.activeHabitsCount).toBe(1);
    });

    it("archived habits are excluded from activeHabitsCount", () => {
      const routine = mkRoutine({
        habits: [
          { id: "h1", name: "Active" },
          { id: "h2", name: "Archived", archived: true },
        ],
      });
      const { result } = renderHook(() =>
        useRoutineDerivedData(buildParams({ routine })),
      );
      expect(result.current.activeHabitsCount).toBe(1);
    });
  });

  describe("hasListFilter / listIsEmpty", () => {
    it("hasListFilter=false when tagFilter=null and listQuery is empty", () => {
      const { result } = renderHook(() => useRoutineDerivedData(buildParams()));
      expect(result.current.hasListFilter).toBe(false);
    });

    it("hasListFilter=true when tagFilter is set", () => {
      const { result } = renderHook(() =>
        useRoutineDerivedData(buildParams({ tagFilter: "sport" })),
      );
      expect(result.current.hasListFilter).toBe(true);
    });

    it("hasListFilter=true when listQuery is non-empty", () => {
      const { result } = renderHook(() =>
        useRoutineDerivedData(buildParams({ listQuery: "yoga" })),
      );
      expect(result.current.hasListFilter).toBe(true);
    });

    it("listIsEmpty=true when no habits (no events)", () => {
      const { result } = renderHook(() => useRoutineDerivedData(buildParams()));
      expect(result.current.listIsEmpty).toBe(true);
    });
  });

  describe("tagChips", () => {
    it("returns tag names sorted alphabetically when the tag has events in the visible period", () => {
      const routine = mkRoutine({
        tags: [
          { id: "t1", name: "Zumba" },
          { id: "t2", name: "Yoga" },
        ],
        habits: [
          { id: "h1", name: "Habit 1", tagIds: ["t1"] },
          { id: "h2", name: "Habit 2", tagIds: ["t2"] },
        ],
      });
      const { result } = renderHook(() =>
        useRoutineDerivedData(buildParams({ routine })),
      );
      expect(result.current.tagChips).toEqual(["Yoga", "Zumba"]);
    });

    it("returns empty array when routine has no tags", () => {
      const { result } = renderHook(() => useRoutineDerivedData(buildParams()));
      expect(result.current.tagChips).toEqual([]);
    });

    // Атрактор №7 анти-слоп-стратегії §3.2: тег без подій у видимому
    // періоді не має рендерити глухий чип — стеля тепер привʼязана до
    // видимого діапазону, а не до довжини `routine.tags`.
    it("excludes a tag with no habits scheduled in the visible period", () => {
      const routine = mkRoutine({
        tags: [{ id: "t1", name: "Zumba" }],
      });
      const { result } = renderHook(() =>
        useRoutineDerivedData(buildParams({ routine })),
      );
      expect(result.current.tagChips).toEqual([]);
    });
  });

  describe("canBulkMark", () => {
    it("is false when no habits exist", () => {
      const { result } = renderHook(() => useRoutineDerivedData(buildParams()));
      expect(result.current.canBulkMark).toBe(false);
    });

    /**
     * PR-R3 (рішення власника 2026-09-14): домен не позначає майбутній
     * день, тож кнопка на зрізі «Завтра» була б мертвою — натиснув, і
     * нічого. Рівно той дефект, який цей же аудит ловив у Фініку (PR-F1),
     * тож гейт мусить стояти і в UI, а не лише в домені.
     */
    it("«Завтра» → false: домен майбутнє не позначає, мертвої кнопки не лишаємо", () => {
      const routine = mkRoutine({
        habits: [{ id: "h1", name: "Daily", recurrence: "daily" }],
      });
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({
            routine,
            timeState: mkTimeState({ timeMode: "tomorrow" }),
          }),
        ),
      );
      expect(result.current.canBulkMark).toBe(false);
    });

    it("сьогодні → true: гейт не зʼїв робочий день", () => {
      // Парний до попереднього. Гейт на `>=` замість `>` зробив би кнопку
      // мертвою в ЄДИНИЙ день, коли вона потрібна.
      const routine = mkRoutine({
        habits: [{ id: "h1", name: "Daily", recurrence: "daily" }],
      });
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({
            routine,
            timeState: mkTimeState({ timeMode: "today" }),
          }),
        ),
      );
      expect(result.current.canBulkMark).toBe(true);
    });

    it("is false in week/month mode (multi-day range)", () => {
      const routine = mkRoutine({
        habits: [{ id: "h1", name: "Daily", recurrence: "daily" }],
      });
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({
            routine,
            timeState: mkTimeState({
              timeMode: "week",
              selectedDay: "2026-06-04",
            }),
          }),
        ),
      );
      // Week is a multi-day range → canBulkMark = false
      expect(result.current.canBulkMark).toBe(false);
    });

    /**
     * PR-R4 (аудит 2026-09): `habitScheduledOnDate` для `flexible` без
     * `weekDoneCount` завжди істинний, тож «Відмітити всі» лишалась би
     * активною для звички, що вже добрала тижневу ціль (нема чого
     * добирати). 2026-06-04 (четвер) належить тижню Пн 2026-06-01..Нд
     * 2026-06-07 — три відмітки пн/вт/ср добирають дефолтну ціль (3).
     */
    it("flexible: тижневу ціль уже добрано → false (нема чого відмічати)", () => {
      const routine = mkRoutine({
        habits: [{ id: "h1", name: "Спорт", recurrence: "flexible" }],
        completions: { h1: ["2026-06-01", "2026-06-02", "2026-06-03"] },
      });
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({
            routine,
            timeState: mkTimeState({ timeMode: "today" }),
          }),
        ),
      );
      expect(result.current.canBulkMark).toBe(false);
    });

    /**
     * Guard проти надто агресивного фіксу вище: гнучка звичка, що ЩЕ не
     * добрала тижневу ціль, лишається доступною для масової відмітки.
     */
    it("flexible: тижневу ціль ще НЕ добрано → true, як і раніше", () => {
      const routine = mkRoutine({
        habits: [{ id: "h1", name: "Спорт", recurrence: "flexible" }],
        completions: { h1: ["2026-06-01"] }, // 1 з 3 цього тижня
      });
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({
            routine,
            timeState: mkTimeState({ timeMode: "today" }),
          }),
        ),
      );
      expect(result.current.canBulkMark).toBe(true);
    });
  });

  describe("cells (month grid)", () => {
    it("returns an array whose length is a multiple of 7", () => {
      const { result } = renderHook(() => useRoutineDerivedData(buildParams()));
      expect(result.current.cells.length % 7).toBe(0);
    });

    it("non-null cells count equals 30 for June 2026", () => {
      const { result } = renderHook(() => useRoutineDerivedData(buildParams()));
      const nonNull = result.current.cells.filter((c) => c !== null);
      expect(nonNull).toHaveLength(30);
    });
  });

  describe("monthTitle", () => {
    it("is a non-empty string for June 2026", () => {
      const { result } = renderHook(() => useRoutineDerivedData(buildParams()));
      expect(typeof result.current.monthTitle).toBe("string");
      expect(result.current.monthTitle.length).toBeGreaterThan(0);
    });
  });

  /**
   * Репорт власника 2026-08-17: герой писав однакове в режимах «Сьогодні» і
   * «Місяць». Причина — `headlineDate` у місяці брав `selectedDay`, а
   * `applyMode("month")` ставить його на сьогодні. Тепер місяць показує свій
   * діапазон, як і тиждень.
   */
  describe("headlineDate", () => {
    it("'month' mode → діапазон місяця, а не сьогоднішня дата", () => {
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({
            timeState: mkTimeState({
              timeMode: "month",
              monthCursor: { y: 2026, m: 5 },
              selectedDay: "2026-06-04",
            }),
          }),
        ),
      );
      expect(result.current.headlineDate).toContain("1 червня");
      expect(result.current.headlineDate).toContain("30 червня");
      expect(result.current.headlineDate).toContain("–");
    });

    it("'month' і 'today' більше не читаються однаково", () => {
      const monthState = mkTimeState({
        timeMode: "month",
        monthCursor: { y: 2026, m: 5 },
        selectedDay: "2026-06-04",
      });
      const month = renderHook(() =>
        useRoutineDerivedData(buildParams({ timeState: monthState })),
      );
      const today = renderHook(() =>
        useRoutineDerivedData(
          buildParams({ timeState: mkTimeState({ timeMode: "today" }) }),
        ),
      );
      expect(month.result.current.headlineDate).not.toBe(
        today.result.current.headlineDate,
      );
    });

    it("'week' mode → діапазон Пн..Нд поточного тижня", () => {
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({ timeState: mkTimeState({ timeMode: "week" }) }),
        ),
      );
      expect(result.current.headlineDate).toContain("1 червня");
      expect(result.current.headlineDate).toContain("7 червня");
    });

    it("'today' mode → рівно одна дата, без діапазону", () => {
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({ timeState: mkTimeState({ timeMode: "today" }) }),
        ),
      );
      expect(result.current.headlineDate).toContain("4 червня");
      expect(result.current.headlineDate).not.toContain("–");
    });
  });

  /**
   * Регресія: лічильник дня в герої був жорстко привʼязаний до
   * `todayKey`, тож на вкладці «Завтра» під завтрашнім заголовком і
   * завтрашнім списком стояли СЬОГОДНІШНІ цифри.
   */
  describe("dayProgress — рахує показуваний день", () => {
    const routine = mkRoutine({
      habits: [
        // Разова подія рівно на завтра — сьогодні вона не запланована.
        {
          id: "once",
          name: "Разова подія",
          recurrence: "once",
          startDate: "2026-06-05",
        },
        // Щоденна: є в обох днях, сьогодні вже відмічена.
        { id: "daily", name: "Щоденна", recurrence: "daily" },
      ],
      completions: { daily: ["2026-06-04"] },
    });

    it("today: 1 з 1 (разова подія не рахується)", () => {
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({
            routine,
            timeState: mkTimeState({ timeMode: "today" }),
          }),
        ),
      );
      expect(result.current.dayProgress).toMatchObject({
        completed: 1,
        scheduled: 1,
      });
      expect(result.current.progressDayKey).toBe("2026-06-04");
    });

    it("tomorrow: 0 з 2 — цифри завтрашнього дня, не сьогоднішнього", () => {
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({
            routine,
            timeState: mkTimeState({ timeMode: "tomorrow" }),
          }),
        ),
      );
      expect(result.current.range.startKey).toBe("2026-06-05");
      expect(result.current.dayProgress).toMatchObject({
        completed: 0,
        scheduled: 2,
      });
      // PR-R6: `progressDayKey` мусить бути завтрашнім днем, а не
      // сьогоднішнім — саме це число веде денний звіт до правильного дня.
      expect(result.current.progressDayKey).toBe("2026-06-05");
    });

    it("day: слідує за довільним обраним днем", () => {
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({
            routine,
            timeState: mkTimeState({
              timeMode: "day",
              selectedDay: "2026-06-05",
            }),
          }),
        ),
      );
      expect(result.current.dayProgress).toMatchObject({
        completed: 0,
        scheduled: 2,
      });
      expect(result.current.progressDayKey).toBe("2026-06-05");
    });

    it("week: діапазон не однодневний → лишається сьогодні", () => {
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({
            routine,
            timeState: mkTimeState({ timeMode: "week" }),
          }),
        ),
      );
      expect(result.current.dayProgress).toMatchObject({
        completed: 1,
        scheduled: 1,
      });
      expect(result.current.progressDayKey).toBe("2026-06-04");
    });
  });

  describe("listQuery filtering", () => {
    it("filtered is empty when listQuery matches nothing", () => {
      const routine = mkRoutine({
        habits: [{ id: "h1", name: "Morning run", recurrence: "daily" }],
      });
      const { result } = renderHook(() =>
        useRoutineDerivedData(
          buildParams({ routine, listQuery: "xyzzy_no_match" }),
        ),
      );
      expect(result.current.filtered).toHaveLength(0);
    });
  });

  // logic-09: SQLite-кеші прогріваються асинхронно — події Фізрука й підписок
  // Фініка мають зʼявитись після тіку без зміни `routine`/`finykCalendarTick`.
  describe("SQLite read-tick (logic-09)", () => {
    afterEach(() => {
      clearFizrukSqliteCache();
      clearFinykSqliteCache();
    });

    it("перебудовує події Фізрука після прогріву кешу", () => {
      // Стабільні params: інакше нова `routine` на кожному рендері сама
      // інвалідує useMemo, і тест не перевіряє залежність від тіків.
      const params = buildParams({
        timeState: mkTimeState({ timeMode: "today" }),
      });
      const { result } = renderHook(() => useRoutineDerivedData(params));
      expect(result.current.events.some((e) => e.fizruk)).toBe(false);

      act(() => {
        __setFizrukSqliteCacheForTests({
          monthlyPlan: {
            reminderEnabled: false,
            reminderHour: 8,
            reminderMinute: 0,
            days: { "2026-06-04": { templateId: "t1" } },
          },
          workoutTemplates: [
            {
              id: "t1",
              name: "Ноги",
              exerciseIds: [],
              groups: [],
              updatedAt: "2026-06-01T00:00:00.000Z",
            },
          ],
        });
        notifyFizrukSqliteCacheRefresh();
      });
      expect(result.current.events.filter((e) => e.fizruk)).toHaveLength(1);
    });

    it("перебудовує події підписок Фініка після прогріву кешу", () => {
      // Стабільні params: інакше нова `routine` на кожному рендері сама
      // інвалідує useMemo, і тест не перевіряє залежність від тіків.
      const params = buildParams({
        timeState: mkTimeState({ timeMode: "today" }),
      });
      const { result } = renderHook(() => useRoutineDerivedData(params));
      expect(result.current.events.some((e) => e.finykSub)).toBe(false);

      act(() => {
        __setFinykSqliteStateCacheForTests({
          subscriptions: [
            { id: "s1", name: "Netflix", billingDay: 4 },
          ] as never[],
        });
        notifyFinykSqliteCacheRefresh();
      });
      expect(result.current.events.filter((e) => e.finykSub)).toHaveLength(1);
    });
  });
});
