// @vitest-environment jsdom
/**
 * `useTrainingProgram` після data-39: активна програма живе в SQLite
 * (`fizruk_programs`) і їде в sync через dual-write, а не в localStorage.
 *
 * Мокається лише межа dual-write (`triggerFizrukDualWrite`); diff рахується
 * справжнім `diffFizrukDualWriteOps`, як у sqlite-writer-а.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/sqliteWriter/index", () => ({
  triggerFizrukDualWrite: vi.fn(),
  isFizrukDualWriteRegistered: vi.fn(() => true),
}));

import {
  isFizrukDualWriteRegistered,
  triggerFizrukDualWrite,
} from "../lib/sqliteWriter/index";
import { diffFizrukDualWriteOps } from "../lib/sqliteWriter/diff/index";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../lib/sqliteReader";
import {
  __resetFizrukSqliteReadGateForTests,
  notifyFizrukSqliteCacheRefresh,
} from "../lib/sqliteReadGate";
import { useTrainingProgram } from "./useTrainingProgram";

const LEGACY_LS_KEY = "fizruk_active_program_id_v1";

function allOps() {
  return vi
    .mocked(triggerFizrukDualWrite)
    .mock.calls.flatMap(([prev, next]) => diffFizrukDualWriteOps(prev, next));
}

describe("useTrainingProgram", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(triggerFizrukDualWrite).mockClear();
    __resetFizrukSqliteReadGateForTests();
    __setFizrukSqliteCacheForTests({ programs: null });
  });
  afterEach(() => {
    clearFizrukSqliteCache();
    __resetFizrukSqliteReadGateForTests();
  });

  it("exposes the built-in program list and no active program by default", () => {
    const { result } = renderHook(() => useTrainingProgram());
    expect(result.current.programs.length).toBeGreaterThan(0);
    expect(result.current.activeProgramId).toBeNull();
    expect(result.current.activeProgram).toBeNull();
  });

  it("activateProgram('ppl') emits a programs-set op for fizruk_programs, not an LS write", () => {
    const { result } = renderHook(() => useTrainingProgram());
    act(() => result.current.activateProgram("ppl"));

    expect(result.current.activeProgramId).toBe("ppl");
    expect(result.current.activeProgram?.id).toBe("ppl");
    expect(allOps()).toEqual([
      { kind: "programs-set", programs: { activeProgramId: "ppl" } },
    ]);
    expect(localStorage.getItem(LEGACY_LS_KEY)).toBeNull();
  });

  it("returns the active program from the SQLite cache after localStorage is wiped", () => {
    __setFizrukSqliteCacheForTests({ programs: { activeProgramId: "ppl" } });
    localStorage.clear();

    const { result } = renderHook(() => useTrainingProgram());

    expect(result.current.activeProgramId).toBe("ppl");
    expect(result.current.activeProgram?.id).toBe("ppl");
  });

  it("picks up an active program that arrives through a pull (cache refresh tick)", () => {
    const { result } = renderHook(() => useTrainingProgram());
    expect(result.current.activeProgramId).toBeNull();

    // Pull-оп `fizruk_programs` з іншого пристрою -> refreshCachesAfterPull
    // оновлює кеш і сповіщає гейт.
    __setFizrukSqliteCacheForTests({
      programs: { activeProgramId: "upper_lower" },
    });
    act(() => notifyFizrukSqliteCacheRefresh());

    expect(result.current.activeProgramId).toBe("upper_lower");
    expect(result.current.activeProgram?.id).toBe("upper_lower");
  });

  it("pull that clears the program on another device clears it here too", () => {
    __setFizrukSqliteCacheForTests({ programs: { activeProgramId: "ppl" } });
    const { result } = renderHook(() => useTrainingProgram());
    expect(result.current.activeProgramId).toBe("ppl");

    __setFizrukSqliteCacheForTests({ programs: { activeProgramId: null } });
    act(() => notifyFizrukSqliteCacheRefresh());

    expect(result.current.activeProgramId).toBeNull();
  });

  it("deactivates by emitting a programs-set op with a null id", () => {
    __setFizrukSqliteCacheForTests({ programs: { activeProgramId: "ppl" } });
    const { result } = renderHook(() => useTrainingProgram());
    act(() => result.current.deactivateProgram());

    expect(result.current.activeProgramId).toBeNull();
    expect(result.current.activeProgram).toBeNull();
    expect(allOps()).toEqual([
      { kind: "programs-set", programs: { activeProgramId: null } },
    ]);
  });

  it("activateProgram(null) clears an active program", () => {
    const { result } = renderHook(() => useTrainingProgram());
    act(() => result.current.activateProgram("ppl"));
    act(() => result.current.activateProgram(null));
    expect(result.current.activeProgramId).toBeNull();
  });

  it("an explicit choice evicts the legacy LS key so a cleared choice cannot resurrect", () => {
    localStorage.setItem(LEGACY_LS_KEY, "full_body");
    const { result } = renderHook(() => useTrainingProgram());
    act(() => result.current.deactivateProgram());
    expect(localStorage.getItem(LEGACY_LS_KEY)).toBeNull();
  });

  it("guest without a dual-write context keeps the choice in LS (the trigger is a no-op)", () => {
    vi.mocked(isFizrukDualWriteRegistered).mockReturnValue(false);
    try {
      const { result } = renderHook(() => useTrainingProgram());
      act(() => result.current.activateProgram("ppl"));
      expect(localStorage.getItem(LEGACY_LS_KEY)).toBe("ppl");
      act(() => result.current.deactivateProgram());
      expect(localStorage.getItem(LEGACY_LS_KEY)).toBeNull();
    } finally {
      vi.mocked(isFizrukDualWriteRegistered).mockReturnValue(true);
    }
  });

  it("pre-warm: a cold cache falls back to the legacy LS key until the boot drain runs", () => {
    clearFizrukSqliteCache();
    localStorage.setItem(LEGACY_LS_KEY, "full_body");
    const { result } = renderHook(() => useTrainingProgram());
    expect(result.current.activeProgramId).toBe("full_body");
  });

  it("a warm cache without a row wins over a stale LS key", () => {
    localStorage.setItem(LEGACY_LS_KEY, "full_body");
    const { result } = renderHook(() => useTrainingProgram());
    expect(result.current.activeProgramId).toBeNull();
  });
});
