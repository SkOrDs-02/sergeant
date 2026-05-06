/** @vitest-environment jsdom */
/**
 * Tests for the `useOnboardingState` React hook (PR-12). The pure
 * `resolveOnboardingHero` resolver is covered separately in
 * `packages/shared/src/lib/onboardingHero.test.ts`; this file focuses
 * on the React-glue behaviour:
 *
 *   • storage flags read once on mount via lazy initialisers
 *   • dismissals flip the in-render flag and persist via injected
 *     storage adapter
 *   • soft-auth threshold logic matches the legacy `HubDashboard`
 *     derivation byte-for-byte
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  SOFT_AUTH_AFTER_ENTRY_MIN_SESSION_DAYS,
  SOFT_AUTH_SESSION_DAYS_THRESHOLD,
  useOnboardingState,
  type OnboardingStateStorage,
  type UseOnboardingStateOptions,
} from "./useOnboardingState";

function makeStorage(
  overrides: Partial<OnboardingStateStorage> = {},
): OnboardingStateStorage {
  return {
    isFirstActionPending: vi.fn(() => false),
    isSoftAuthDismissed: vi.fn(() => false),
    clearFirstActionPending: vi.fn(),
    ...overrides,
  };
}

const BASE: UseOnboardingStateOptions = {
  user: null,
  hasRealEntry: false,
  sessionDays: 0,
  todayFocusAvailable: false,
  reengagementEligible: false,
  onShowAuth: () => {},
};

describe("useOnboardingState", () => {
  it("reads storage flags exactly once on mount", () => {
    const storage = makeStorage({
      isFirstActionPending: vi.fn(() => true),
      isSoftAuthDismissed: vi.fn(() => false),
    });

    const { rerender } = renderHook(
      (props: UseOnboardingStateOptions) => useOnboardingState(props, storage),
      { initialProps: BASE },
    );

    rerender({ ...BASE, sessionDays: 5 });
    rerender({ ...BASE, sessionDays: 7 });

    expect(storage.isFirstActionPending).toHaveBeenCalledTimes(1);
    expect(storage.isSoftAuthDismissed).toHaveBeenCalledTimes(1);
  });

  it("promotes first-action when FTUX is pending", () => {
    const storage = makeStorage({
      isFirstActionPending: vi.fn(() => true),
    });

    const { result } = renderHook(() =>
      useOnboardingState({ ...BASE, todayFocusAvailable: true }, storage),
    );

    expect(result.current.hero).toBe("first-action");
    expect(result.current.showFirstAction).toBe(true);
    expect(result.current.showSoftAuth).toBe(false);
    expect(result.current.showTodayFocus).toBe(false);
  });

  it("dismissFirstAction clears storage and flips the flag in-render", () => {
    const storage = makeStorage({
      isFirstActionPending: vi.fn(() => true),
    });

    const { result } = renderHook(() =>
      useOnboardingState({ ...BASE, todayFocusAvailable: true }, storage),
    );

    expect(result.current.showFirstAction).toBe(true);

    act(() => {
      result.current.dismissFirstAction();
    });

    expect(storage.clearFirstActionPending).toHaveBeenCalledTimes(1);
    expect(result.current.showFirstAction).toBe(false);
    // Today-focus takes the slot in the same tick.
    expect(result.current.hero).toBe("today-focus");
  });

  it("suppresses soft-auth when user is signed in", () => {
    const { result } = renderHook(() =>
      useOnboardingState(
        {
          ...BASE,
          user: {
            id: "u1",
            email: "u@example.com",
            name: null,
            image: null,
            emailVerified: false,
            createdAt: new Date().toISOString(),
          },
          hasRealEntry: true,
          sessionDays: 5,
        },
        makeStorage(),
      ),
    );

    expect(result.current.showSoftAuth).toBe(false);
  });

  it("suppresses soft-auth when user has dismissed it", () => {
    const storage = makeStorage({
      isSoftAuthDismissed: vi.fn(() => true),
    });

    const { result } = renderHook(() =>
      useOnboardingState(
        {
          ...BASE,
          hasRealEntry: true,
          sessionDays: SOFT_AUTH_SESSION_DAYS_THRESHOLD,
        },
        storage,
      ),
    );

    expect(result.current.showSoftAuth).toBe(false);
  });

  it("suppresses soft-auth when onShowAuth is missing", () => {
    const { result } = renderHook(() =>
      useOnboardingState(
        {
          ...BASE,
          hasRealEntry: false,
          sessionDays: SOFT_AUTH_SESSION_DAYS_THRESHOLD,
          onShowAuth: undefined,
        },
        makeStorage(),
      ),
    );

    expect(result.current.showSoftAuth).toBe(false);
  });

  it("fires soft-auth for cold users at the cold threshold", () => {
    const { result } = renderHook(() =>
      useOnboardingState(
        {
          ...BASE,
          hasRealEntry: false,
          sessionDays: SOFT_AUTH_SESSION_DAYS_THRESHOLD,
        },
        makeStorage(),
      ),
    );

    expect(result.current.showSoftAuth).toBe(true);
    expect(result.current.reason).toBe("soft-auth-due");
  });

  it("fires soft-auth earlier for post-first-entry users", () => {
    const { result } = renderHook(() =>
      useOnboardingState(
        {
          ...BASE,
          hasRealEntry: true,
          sessionDays: SOFT_AUTH_AFTER_ENTRY_MIN_SESSION_DAYS,
        },
        makeStorage(),
      ),
    );

    expect(result.current.showSoftAuth).toBe(true);
  });

  it("dismissSoftAuth clears the slot in-render", () => {
    const { result } = renderHook(() =>
      useOnboardingState(
        {
          ...BASE,
          hasRealEntry: true,
          sessionDays: SOFT_AUTH_AFTER_ENTRY_MIN_SESSION_DAYS,
          todayFocusAvailable: true,
        },
        makeStorage(),
      ),
    );

    expect(result.current.showSoftAuth).toBe(true);

    act(() => {
      result.current.dismissSoftAuth();
    });

    expect(result.current.showSoftAuth).toBe(false);
    expect(result.current.hero).toBe("today-focus");
  });

  it("reengagement wins over every other candidate", () => {
    const storage = makeStorage({
      isFirstActionPending: vi.fn(() => true),
    });

    const { result } = renderHook(() =>
      useOnboardingState(
        {
          ...BASE,
          reengagementEligible: true,
          hasRealEntry: true,
          sessionDays: SOFT_AUTH_SESSION_DAYS_THRESHOLD,
          todayFocusAvailable: true,
        },
        storage,
      ),
    );

    expect(result.current.hero).toBe("reengagement");
    expect(result.current.showReengagement).toBe(true);
    // All four contenders should still be reported.
    expect(result.current.candidates).toEqual([
      "reengagement",
      "first-action",
      "soft-auth",
      "today-focus",
    ]);
  });

  it("returns hero=null when no candidate is eligible", () => {
    const { result } = renderHook(() =>
      useOnboardingState(BASE, makeStorage()),
    );

    expect(result.current.hero).toBeNull();
    expect(result.current.reason).toBe("none");
    expect(result.current.candidates).toEqual([]);
  });
});
