/**
 * Overlay tests for `useFizrukWorkouts` (Stage 8 PR #057f-flag —
 * mobile).
 *
 * Verifies the SQLite read overlay swaps in
 * `getCachedFizrukSqliteState()` once the cache has been refreshed at
 * least once. The `feature.fizruk.sqlite_v2.read_sqlite` flag was
 * dropped — overlay читання тепер unconditional, тому "flag off" кейс
 * прибрано. Cold-cache (`refreshedAt === null`) залишається single
 * gating condition.
 */
import { act, renderHook } from "@testing-library/react-native";

import type { Workout } from "@sergeant/fizruk-domain/domain";

import { _getMMKVInstance } from "@/lib/storage";

import {
  notifyFizrukSqliteCacheRefresh,
  __resetFizrukSqliteReadGateForTests,
} from "../../lib/sqliteReadGate";
import {
  clearFizrukSqliteCache,
  getCachedFizrukSqliteState,
} from "../../lib/sqliteReader";
import { useFizrukWorkouts } from "../useFizrukWorkouts";

/**
 * Force the cache into a "warm" state with the given workouts. We
 * can't call the real `refreshFizrukSqliteState()` here without a
 * SQLite client, but we don't need to — the overlay only reads
 * `getCachedFizrukSqliteState()`. Mutating the underlying object via
 * the live reference keeps `cache.refreshedAt` non-null and exposes
 * the workouts to the next overlay render.
 */
function seedCache(workouts: Workout[]): void {
  const live = getCachedFizrukSqliteState() as {
    workouts: Workout[];
    customExercises: unknown[];
    measurements: unknown[];
    refreshedAt: string | null;
  };
  live.workouts = workouts;
  live.customExercises = [];
  live.measurements = [];
  live.refreshedAt = new Date().toISOString();
}

function makeWorkout(id: string, startedAt: string): Workout {
  return {
    id,
    startedAt,
    endedAt: null,
    note: "",
    items: [],
    groups: [],
    warmup: null,
    cooldown: null,
  };
}

beforeEach(() => {
  _getMMKVInstance().clearAll();
  clearFizrukSqliteCache();
  __resetFizrukSqliteReadGateForTests();
});

describe("useFizrukWorkouts — SQLite read overlay (Stage 8 PR #057f-flag)", () => {
  it("does NOT overlay when the cache is cold (refreshedAt === null)", () => {
    // Cache is cold (default state).
    expect(getCachedFizrukSqliteState().refreshedAt).toBeNull();

    const { result } = renderHook(() => useFizrukWorkouts());

    // Empty MMKV → empty workouts. Overlay refused to swap because
    // `refreshedAt === null` (boot has not run / cache not warm).
    expect(result.current.workouts).toEqual([]);
  });

  it("overlays SQLite workouts on render when cache is warm", () => {
    seedCache([
      makeWorkout("w-recent", "2026-01-02T00:00:00Z"),
      makeWorkout("w-older", "2026-01-01T00:00:00Z"),
    ]);

    const { result } = renderHook(() => useFizrukWorkouts());

    const ids = result.current.workouts.map((w) => w.id);
    expect(ids).toEqual(["w-recent", "w-older"]);
  });

  it("re-overlays after notifyFizrukSqliteCacheRefresh fires (cache update)", () => {
    seedCache([makeWorkout("w-1", "2026-01-01T00:00:00Z")]);

    const { result } = renderHook(() => useFizrukWorkouts());
    expect(result.current.workouts.map((w) => w.id)).toEqual(["w-1"]);

    seedCache([
      makeWorkout("w-2", "2026-01-02T00:00:00Z"),
      makeWorkout("w-3", "2026-01-03T00:00:00Z"),
    ]);
    act(() => {
      notifyFizrukSqliteCacheRefresh();
    });

    const ids = result.current.workouts.map((w) => w.id);
    expect(ids.sort()).toEqual(["w-2", "w-3"]);
  });
});
