/**
 * Overlay tests for `useDailyLog` (Stage 12 / PR
 * #057f-tombstone-mobile-stage12 — mobile).
 *
 * Verifies that the hook reads from the SQLite warm cache
 * (`getCachedFizrukSqliteState()`) once it has been refreshed at
 * least once. Cold cache (`refreshedAt === null`) yields an empty
 * list. Adding a daily-log entry no longer writes to MMKV — the
 * dual-write trigger is fire-and-forget and never throws.
 */
import { act, renderHook } from "@testing-library/react-native";

import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance } from "@/lib/storage";

import {
  notifyFizrukSqliteCacheRefresh,
  __resetFizrukSqliteReadGateForTests,
} from "../../lib/sqliteReadGate";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
  getCachedFizrukSqliteState,
} from "../../lib/sqliteReader";
import { useDailyLog } from "../useDailyLog";

beforeEach(() => {
  _getMMKVInstance().clearAll();
  clearFizrukSqliteCache();
  __resetFizrukSqliteReadGateForTests();
});

describe("useDailyLog — SQLite read overlay (Stage 12)", () => {
  it("does NOT overlay when the cache is cold (refreshedAt === null)", () => {
    expect(getCachedFizrukSqliteState().refreshedAt).toBeNull();

    const { result } = renderHook(() => useDailyLog());

    expect(result.current.entries).toEqual([]);
    expect(result.current.latest).toBeNull();
  });

  it("overlays entries from the SQLite warm cache", () => {
    __setFizrukSqliteCacheForTests({
      dailyLog: [
        {
          id: "dl-old",
          at: "2026-01-01T00:00:00.000Z",
          weightKg: null,
          sleepHours: 7,
          energyLevel: null,
          mood: null,
          note: "",
        },
        {
          id: "dl-new",
          at: "2026-02-01T00:00:00.000Z",
          weightKg: 80,
          sleepHours: 8,
          energyLevel: null,
          mood: null,
          note: "",
        },
      ],
    });

    const { result } = renderHook(() => useDailyLog());

    // Sorted descending by `at`.
    expect(result.current.entries.map((e) => e.id)).toEqual([
      "dl-new",
      "dl-old",
    ]);
    expect(result.current.latest?.id).toBe("dl-new");
  });

  it("re-overlays after notifyFizrukSqliteCacheRefresh fires", () => {
    __setFizrukSqliteCacheForTests({
      dailyLog: [
        {
          id: "dl-1",
          at: "2026-01-01T00:00:00.000Z",
          weightKg: null,
          sleepHours: null,
          energyLevel: null,
          mood: null,
          note: "",
        },
      ],
    });

    const { result } = renderHook(() => useDailyLog());
    expect(result.current.entries.map((e) => e.id)).toEqual(["dl-1"]);

    __setFizrukSqliteCacheForTests({
      dailyLog: [
        {
          id: "dl-2",
          at: "2026-02-01T00:00:00.000Z",
          weightKg: null,
          sleepHours: null,
          energyLevel: null,
          mood: null,
          note: "",
        },
      ],
    });
    act(() => {
      notifyFizrukSqliteCacheRefresh();
    });

    expect(result.current.entries.map((e) => e.id)).toEqual(["dl-2"]);
  });

  it("addEntry no longer writes to MMKV (Stage 12 tombstone)", () => {
    const { result } = renderHook(() => useDailyLog());

    act(() => {
      result.current.addEntry({ note: "first" });
    });

    // Stage 12 tombstone — no MMKV write at all.
    expect(_getMMKVInstance().contains(STORAGE_KEYS.FIZRUK_DAILY_LOG)).toBe(
      false,
    );
    // …but in-memory state still updates so the UI renders the entry.
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]?.note).toBe("first");
  });

  it("deleteEntry on an unknown id is a no-op (state stays referentially identical)", () => {
    __setFizrukSqliteCacheForTests({
      dailyLog: [
        {
          id: "dl-1",
          at: "2026-01-01T00:00:00.000Z",
          weightKg: null,
          sleepHours: null,
          energyLevel: null,
          mood: null,
          note: "",
        },
      ],
    });

    const { result } = renderHook(() => useDailyLog());
    const before = result.current.entries;

    act(() => {
      result.current.deleteEntry("does-not-exist");
    });

    expect(result.current.entries).toBe(before);
  });
});
