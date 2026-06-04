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
import { renderHook } from "@testing-library/react";
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
    it("returns tag names sorted alphabetically", () => {
      const routine = mkRoutine({
        tags: [
          { id: "t1", name: "Zumba" },
          { id: "t2", name: "Yoga" },
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
  });

  describe("canBulkMark", () => {
    it("is false when no habits exist", () => {
      const { result } = renderHook(() => useRoutineDerivedData(buildParams()));
      expect(result.current.canBulkMark).toBe(false);
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
});
