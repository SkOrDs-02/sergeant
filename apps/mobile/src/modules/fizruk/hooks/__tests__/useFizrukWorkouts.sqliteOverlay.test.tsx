/**
 * Overlay tests for `useFizrukWorkouts` (PR #029a — mobile).
 *
 * Verifies the SQLite read overlay swaps in `getCachedFizrukSqliteState()`
 * exactly when `feature.fizruk.sqlite_v2.read_sqlite` is on AND the
 * cache has been refreshed at least once. With the flag off, the hook
 * keeps reading from MMKV (verified via the existing
 * `useFizrukWorkouts.enqueue.test.ts`) and the cache is ignored even
 * if it has data.
 *
 * Mirrors the web vitest suite at
 * `apps/web/src/modules/fizruk/hooks/useWorkouts.sqliteOverlay.test.tsx`.
 */
import { act, renderHook } from "@testing-library/react-native";

import type { Workout } from "@sergeant/fizruk-domain/domain";

import { _getMMKVInstance } from "@/lib/storage";

const mockUseFlag = jest.fn<boolean, [string]>();

jest.mock("@/core/lib/featureFlags", () => {
  const actual = jest.requireActual("@/core/lib/featureFlags");
  return {
    ...actual,
    useFlag: (id: string) => mockUseFlag(id),
  };
});

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
  mockUseFlag.mockReset();
  mockUseFlag.mockReturnValue(false);
});

describe("useFizrukWorkouts — SQLite read overlay (PR #029a)", () => {
  it("does NOT overlay when the flag is off (returns MMKV state)", () => {
    mockUseFlag.mockReturnValue(false);

    seedCache([makeWorkout("w-from-sqlite", "2026-01-01T00:00:00Z")]);

    const { result } = renderHook(() => useFizrukWorkouts());

    // No MMKV write happened, so we expect the empty-array default.
    expect(result.current.workouts).toEqual([]);
  });

  it("does NOT overlay when the flag is on but the cache is cold (refreshedAt === null)", () => {
    mockUseFlag.mockReturnValue(true);

    // Cache is cold (default state).
    expect(getCachedFizrukSqliteState().refreshedAt).toBeNull();

    const { result } = renderHook(() => useFizrukWorkouts());

    // Empty MMKV → empty workouts. Overlay refused to swap because
    // `refreshedAt === null` (boot has not run / cache not warm).
    expect(result.current.workouts).toEqual([]);
  });

  it("overlays SQLite workouts on render when flag is on AND cache is warm", () => {
    mockUseFlag.mockReturnValue(true);

    seedCache([
      makeWorkout("w-recent", "2026-01-02T00:00:00Z"),
      makeWorkout("w-older", "2026-01-01T00:00:00Z"),
    ]);

    const { result } = renderHook(() => useFizrukWorkouts());

    const ids = result.current.workouts.map((w) => w.id);
    expect(ids).toEqual(["w-recent", "w-older"]);
  });

  it("re-overlays after notifyFizrukSqliteCacheRefresh fires (cache update)", () => {
    mockUseFlag.mockReturnValue(true);

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
