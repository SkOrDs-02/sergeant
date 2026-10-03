// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetModuleFirstSeen, useModuleFirstRun } from "./useModuleFirstRun";
import {
  __resetStorageReadyForTests,
  markStorageBooting,
  markStorageReady,
} from "../db/storageReady";

/**
 * Storage key namespace lives in `useModuleFirstRun.ts` (private), so
 * we hard-code the legacy verbatim form here. This is intentional: any
 * accidental rename in source must trip these tests, since live users
 * already have the v1 keys in their localStorage and a silent change
 * would re-trigger the first-run banner for everyone.
 */
function firstSeenKey(moduleId: string): string {
  return `sergeant.onboarding.module_first_seen.${moduleId}.v1`;
}

describe("useModuleFirstRun", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Storage starts "ready" (optimistic default) for every existing case so
    // the synchronous assertions below hold; the cold-boot case arms the gate
    // explicitly.
    __resetStorageReadyForTests();
  });
  afterEach(() => {
    window.localStorage.clear();
    __resetStorageReadyForTests();
  });

  it("returns firstRun=true on first mount when no flag is stored", () => {
    const { result } = renderHook(() => useModuleFirstRun("nutrition"));
    expect(result.current.firstRun).toBe(true);
  });

  it("returns firstRun=false when the legacy flag is already set", () => {
    window.localStorage.setItem(firstSeenKey("finyk"), "1");
    const { result } = renderHook(() => useModuleFirstRun("finyk"));
    expect(result.current.firstRun).toBe(false);
  });

  it("markSeen() persists the flag and flips firstRun to false", () => {
    const { result } = renderHook(() => useModuleFirstRun("routine"));
    expect(result.current.firstRun).toBe(true);

    act(() => {
      result.current.markSeen();
    });

    expect(result.current.firstRun).toBe(false);
    expect(window.localStorage.getItem(firstSeenKey("routine"))).toBe("1");
  });

  it("holds firstRun=false until the persistent store is ready, then resolves (cold-boot race)", () => {
    // Hard reload: the SQLite warm-cache is still booting, so the seen flag is
    // unreadable. The hook must NOT report first-run yet — otherwise a returning
    // user is routed to the module's first-run surface (e.g. /finyk/transactions
    // → /finyk/budgets). It resolves once the gate flips ready.
    markStorageBooting();
    const { result } = renderHook(() => useModuleFirstRun("nutrition"));
    expect(result.current.firstRun).toBe(false);

    act(() => {
      markStorageReady();
    });
    // No seen flag stored → genuine first run, now safe to surface.
    expect(result.current.firstRun).toBe(true);
  });

  it("stays firstRun=false for a returning user across the boot→ready transition", () => {
    // Seen flag IS present (returning user): the hook must resolve to false the
    // moment storage is ready — never flip true mid cold-boot.
    window.localStorage.setItem(firstSeenKey("finyk"), "1");
    markStorageBooting();
    const { result } = renderHook(() => useModuleFirstRun("finyk"));
    expect(result.current.firstRun).toBe(false);

    act(() => {
      markStorageReady();
    });
    expect(result.current.firstRun).toBe(false);
  });

  it("re-evaluates firstRun when moduleId changes", () => {
    window.localStorage.setItem(firstSeenKey("finyk"), "1");
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useModuleFirstRun(id),
      { initialProps: { id: "finyk" as string | null } },
    );
    expect(result.current.firstRun).toBe(false);

    rerender({ id: "nutrition" });
    expect(result.current.firstRun).toBe(true);
  });

  it("treats a null moduleId as a no-op (firstRun=false, markSeen no-ops)", () => {
    const { result } = renderHook(() => useModuleFirstRun(null));
    expect(result.current.firstRun).toBe(false);
    act(() => {
      result.current.markSeen();
    });
    expect(window.localStorage.length).toBe(0);
  });

  it("does not snap firstRun back when the seen flag is mutated mid-session", () => {
    const { result, rerender } = renderHook(() =>
      useModuleFirstRun("nutrition"),
    );
    expect(result.current.firstRun).toBe(true);

    // External edit (e.g. another tab clearing the flag during a
    // session) must NOT yank the editor surface back open. The hook's
    // intent is "evaluate once on mount per moduleId" — see the
    // jsdoc on `useModuleFirstRun` for the rationale.
    act(() => {
      result.current.markSeen();
    });
    expect(result.current.firstRun).toBe(false);

    window.localStorage.removeItem(firstSeenKey("nutrition"));
    rerender();
    expect(result.current.firstRun).toBe(false);
  });

  it("markSeen() survives a hard reload that races the async SQLite write-back (A7)", () => {
    // The warm-cache write-back to OPFS is fire-and-forget; a reload right
    // after dismiss can lose it. markSeen must ALSO write the durable
    // localStorage mirror that bootstrapKvStore re-seeds from, so a fresh
    // mount (simulating post-reload) still reads the flag → banner stays gone.
    const { result } = renderHook(() => useModuleFirstRun("finyk"));
    act(() => {
      result.current.markSeen();
    });
    // Raw localStorage (the durable mirror) must hold the flag even though the
    // hook wrote through the KV-store path.
    expect(window.localStorage.getItem(firstSeenKey("finyk"))).toBe("1");

    // Fresh mount = a new page load; no in-memory hook state carries over.
    const { result: reloaded } = renderHook(() => useModuleFirstRun("finyk"));
    expect(reloaded.current.firstRun).toBe(false);
  });

  it("resetModuleFirstSeen() wipes every module's flag", () => {
    for (const id of ["finyk", "fizruk", "routine", "nutrition"]) {
      window.localStorage.setItem(firstSeenKey(id), "1");
    }
    resetModuleFirstSeen();
    for (const id of ["finyk", "fizruk", "routine", "nutrition"]) {
      expect(window.localStorage.getItem(firstSeenKey(id))).toBeNull();
    }
  });
});
