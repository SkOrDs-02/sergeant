/**
 * Overlay tests for `useWellbeing` (Stage 12.5 / PR
 * #057f2-tombstone-mobile-stage12-5 — mobile).
 *
 * Verifies that the hook reads from the SQLite warm cache
 * (`getCachedFizrukSqliteState()`) once it has been refreshed at least
 * once. Cold cache (`refreshedAt === null`) yields an empty list.
 * Upserting an entry no longer writes to MMKV — the dual-write trigger
 * is fire-and-forget and never throws.
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
import { useWellbeing } from "../useWellbeing";

beforeEach(() => {
  _getMMKVInstance().clearAll();
  clearFizrukSqliteCache();
  __resetFizrukSqliteReadGateForTests();
});

describe("useWellbeing — SQLite read overlay (Stage 12.5)", () => {
  it("does NOT overlay when the cache is cold (refreshedAt === null)", () => {
    expect(getCachedFizrukSqliteState().refreshedAt).toBeNull();

    const { result } = renderHook(() => useWellbeing());

    expect(result.current.entries).toEqual([]);
  });

  it("overlays entries from the SQLite warm cache (sorted desc)", () => {
    __setFizrukSqliteCacheForTests({
      wellbeing: [
        {
          date: "2026-01-01",
          mood: 3,
          energy: 4,
          sleepQuality: null,
          sleepHours: 7,
          notes: "ok",
          updatedAt: "2026-01-01T08:00:00.000Z",
        },
        {
          date: "2026-02-01",
          mood: 5,
          energy: 5,
          sleepQuality: 4,
          sleepHours: 8,
          notes: "great",
          updatedAt: "2026-02-01T08:00:00.000Z",
        },
      ],
    });

    const { result } = renderHook(() => useWellbeing());

    expect(result.current.entries.map((e) => e.date)).toEqual([
      "2026-02-01",
      "2026-01-01",
    ]);
  });

  it("re-overlays after notifyFizrukSqliteCacheRefresh fires", () => {
    __setFizrukSqliteCacheForTests({
      wellbeing: [
        {
          date: "2026-01-01",
          mood: 3,
          energy: null,
          sleepQuality: null,
          sleepHours: null,
          notes: "",
          updatedAt: "2026-01-01T08:00:00.000Z",
        },
      ],
    });

    const { result } = renderHook(() => useWellbeing());
    expect(result.current.entries.map((e) => e.date)).toEqual(["2026-01-01"]);

    __setFizrukSqliteCacheForTests({
      wellbeing: [
        {
          date: "2026-02-01",
          mood: null,
          energy: null,
          sleepQuality: null,
          sleepHours: null,
          notes: "",
          updatedAt: "2026-02-01T08:00:00.000Z",
        },
      ],
    });
    act(() => {
      notifyFizrukSqliteCacheRefresh();
    });

    expect(result.current.entries.map((e) => e.date)).toEqual(["2026-02-01"]);
  });

  it("upsertForDate no longer writes to MMKV (Stage 12.5 tombstone)", () => {
    const { result } = renderHook(() => useWellbeing());

    act(() => {
      result.current.upsertForDate("2026-03-01", { mood: 4, energy: 4 });
    });

    // Stage 12.5 tombstone — no MMKV write at all.
    expect(_getMMKVInstance().contains(STORAGE_KEYS.FIZRUK_WELLBEING)).toBe(
      false,
    );
    // …but in-memory state still updates so the UI renders it.
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]?.date).toBe("2026-03-01");
    expect(result.current.entries[0]?.mood).toBe(4);
  });

  it("upsertForDate is idempotent for deep-equal patches", () => {
    __setFizrukSqliteCacheForTests({
      wellbeing: [
        {
          date: "2026-04-01",
          mood: 4,
          energy: 4,
          sleepQuality: null,
          sleepHours: null,
          notes: "stable",
          updatedAt: "2026-04-01T08:00:00.000Z",
        },
      ],
    });
    const { result } = renderHook(() => useWellbeing());
    const before = result.current.entries;

    act(() => {
      result.current.upsertForDate("2026-04-01", {
        mood: 4,
        energy: 4,
        sleepQuality: null,
        sleepHours: null,
        notes: "stable",
      });
    });

    // Same reference — deep-equal patches don't bump the entry.
    expect(result.current.entries).toBe(before);
  });

  it("removeForDate on an unknown id is a no-op (state stays referentially identical)", () => {
    __setFizrukSqliteCacheForTests({
      wellbeing: [
        {
          date: "2026-05-01",
          mood: null,
          energy: null,
          sleepQuality: null,
          sleepHours: null,
          notes: "",
          updatedAt: "2026-05-01T08:00:00.000Z",
        },
      ],
    });
    const { result } = renderHook(() => useWellbeing());
    const before = result.current.entries;

    act(() => {
      result.current.removeForDate("does-not-exist");
    });

    expect(result.current.entries).toBe(before);
  });
});
