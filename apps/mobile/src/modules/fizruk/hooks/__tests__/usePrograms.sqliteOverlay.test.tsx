/**
 * Overlay tests for `usePrograms` (Stage 12.5 / PR
 * #057f2-tombstone-mobile-stage12-5 — mobile).
 *
 * Verifies that the hook reads from the SQLite warm cache
 * (`getCachedFizrukSqliteState()`) once it has been refreshed at least
 * once. Cold cache (`refreshedAt === null`) yields the default
 * `{ activeProgramId: null }` state. Activating a program no longer
 * writes to MMKV — the dual-write trigger is fire-and-forget and never
 * throws.
 */
import { act, renderHook } from "@testing-library/react-native";

import { PROGRAM_CATALOGUE } from "@sergeant/fizruk-domain/domain";
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
import { usePrograms } from "../usePrograms";

const CATALOGUE = PROGRAM_CATALOGUE;
const FIRST_ID = CATALOGUE[0]!.id;
const SECOND_ID = CATALOGUE[1]!.id;

beforeEach(() => {
  _getMMKVInstance().clearAll();
  clearFizrukSqliteCache();
  __resetFizrukSqliteReadGateForTests();
});

describe("usePrograms — SQLite read overlay (Stage 12.5)", () => {
  it("does NOT overlay when the cache is cold (refreshedAt === null)", () => {
    expect(getCachedFizrukSqliteState().refreshedAt).toBeNull();

    const { result } = renderHook(() => usePrograms());

    expect(result.current.activeProgramId).toBeNull();
    expect(result.current.activeProgram).toBeNull();
  });

  it("overlays active-program id from the SQLite warm cache", () => {
    __setFizrukSqliteCacheForTests({
      programs: { activeProgramId: FIRST_ID },
    });

    const { result } = renderHook(() => usePrograms(CATALOGUE));

    expect(result.current.activeProgramId).toBe(FIRST_ID);
    expect(result.current.activeProgram?.id).toBe(FIRST_ID);
  });

  it("re-overlays after notifyFizrukSqliteCacheRefresh fires", () => {
    __setFizrukSqliteCacheForTests({
      programs: { activeProgramId: FIRST_ID },
    });

    const { result } = renderHook(() => usePrograms(CATALOGUE));
    expect(result.current.activeProgramId).toBe(FIRST_ID);

    __setFizrukSqliteCacheForTests({
      programs: { activeProgramId: SECOND_ID },
    });
    act(() => {
      notifyFizrukSqliteCacheRefresh();
    });

    expect(result.current.activeProgramId).toBe(SECOND_ID);
  });

  it("activateProgram no longer writes to MMKV (Stage 12.5 tombstone)", () => {
    const { result } = renderHook(() => usePrograms(CATALOGUE));

    act(() => {
      result.current.activateProgram(FIRST_ID);
    });

    // Stage 12.5 tombstone — no MMKV write at all.
    expect(
      _getMMKVInstance().contains(STORAGE_KEYS.FIZRUK_ACTIVE_PROGRAM),
    ).toBe(false);
    // …but in-memory state still updates so the UI reflects it.
    expect(result.current.activeProgramId).toBe(FIRST_ID);
  });

  it("deactivateProgram clears the slot in memory without touching MMKV", () => {
    __setFizrukSqliteCacheForTests({
      programs: { activeProgramId: FIRST_ID },
    });

    const { result } = renderHook(() => usePrograms(CATALOGUE));
    expect(result.current.activeProgramId).toBe(FIRST_ID);

    act(() => {
      result.current.deactivateProgram();
    });

    expect(result.current.activeProgramId).toBeNull();
    expect(
      _getMMKVInstance().contains(STORAGE_KEYS.FIZRUK_ACTIVE_PROGRAM),
    ).toBe(false);
  });
});
