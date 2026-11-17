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
 *   • soft-auth hero на вебі не виграє ніколи (рішення власника
 *     2026-11-17: його текст переїхав у `LocalOnlyDataBanner`)
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  useOnboardingState,
  type OnboardingStateStorage,
  type UseOnboardingStateOptions,
} from "./useOnboardingState";

function makeStorage(
  overrides: Partial<OnboardingStateStorage> = {},
): OnboardingStateStorage {
  return {
    isFirstActionPending: vi.fn(() => false),
    clearFirstActionPending: vi.fn(),
    ...overrides,
  };
}

const BASE: UseOnboardingStateOptions = {
  hasRealEntry: false,
  todayFocusAvailable: false,
  reengagementEligible: false,
};

describe("useOnboardingState", () => {
  it("reads storage flags exactly once on mount", () => {
    const storage = makeStorage({
      isFirstActionPending: vi.fn(() => true),
    });

    const { rerender } = renderHook(
      (props: UseOnboardingStateOptions) => useOnboardingState(props, storage),
      { initialProps: BASE },
    );

    rerender({ ...BASE, todayFocusAvailable: true });
    rerender({ ...BASE, reengagementEligible: true });

    expect(storage.isFirstActionPending).toHaveBeenCalledTimes(1);
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

  it("clears the first-action slot after the first real entry appears", () => {
    const storage = makeStorage({
      isFirstActionPending: vi.fn(() => true),
    });

    const { result, rerender } = renderHook(
      (props: UseOnboardingStateOptions) => useOnboardingState(props, storage),
      { initialProps: { ...BASE, todayFocusAvailable: true } },
    );

    expect(result.current.showFirstAction).toBe(true);

    rerender({ ...BASE, hasRealEntry: true, todayFocusAvailable: true });

    expect(storage.clearFirstActionPending).toHaveBeenCalledTimes(1);
    expect(result.current.showFirstAction).toBe(false);
    expect(result.current.hero).toBe("today-focus");
  });

  // Рішення власника 2026-11-17: текст `SoftAuthPromptCard` переїхав у
  // `LocalOnlyDataBanner`, картку прибрано. Раніше анонім без записів на
  // 3-й день FTUX (банер тоді мовчить) отримував картку «Синхронізація
  // записів» без жодного запису; тепер soft-auth не виграє ніде.
  it("soft-auth не стає героєм навіть для аноніма за колишніми порогами", () => {
    const { result } = renderHook(() =>
      useOnboardingState(
        { ...BASE, hasRealEntry: true, todayFocusAvailable: true },
        makeStorage(),
      ),
    );

    expect(result.current.candidates).not.toContain("soft-auth");
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
          todayFocusAvailable: true,
        },
        storage,
      ),
    );

    expect(result.current.hero).toBe("reengagement");
    expect(result.current.showReengagement).toBe(true);
    // A completed first real entry clears the first-action candidate.
    expect(result.current.candidates).toEqual(["reengagement", "today-focus"]);
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
