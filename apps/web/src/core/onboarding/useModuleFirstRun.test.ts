// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetModuleFirstSeen, useModuleFirstRun } from "./useModuleFirstRun";

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
  });
  afterEach(() => {
    window.localStorage.clear();
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
