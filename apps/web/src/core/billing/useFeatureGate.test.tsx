/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const { usePlanMock } = vi.hoisted(() => ({
  usePlanMock: vi.fn(),
}));

vi.mock("./usePlan", () => ({
  usePlan: () => usePlanMock(),
}));

import { useFeatureGate } from "./useFeatureGate";

describe("useFeatureGate", () => {
  beforeEach(() => {
    usePlanMock.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("grants access when user is on Pro", () => {
    usePlanMock.mockReturnValue({
      plan: "pro",
      isPro: true,
      isLoading: false,
      subscription: null,
    });

    const { result } = renderHook(() => useFeatureGate("multi-currency"));

    expect(result.current.canAccess).toBe(true);
    expect(result.current.featureId).toBe("multi-currency");
    expect(result.current.paywallSurface).toBe("other");
    expect(result.current.paywallOpen).toBe(false);

    let allowed = false;
    act(() => {
      allowed = result.current.requireAccess();
    });
    expect(allowed).toBe(true);
    expect(result.current.paywallOpen).toBe(false);
  });

  it("opens paywall and denies access for free users", () => {
    usePlanMock.mockReturnValue({
      plan: "free",
      isPro: false,
      isLoading: false,
      subscription: null,
    });

    const { result } = renderHook(() => useFeatureGate("analytics-export-pdf"));

    expect(result.current.canAccess).toBe(false);
    expect(result.current.paywallSurface).toBe("csv_export");

    let allowed = true;
    act(() => {
      allowed = result.current.requireAccess();
    });
    expect(allowed).toBe(false);
    expect(result.current.paywallOpen).toBe(true);
  });

  it("maps ai-photo-analysis to unlimited_ai_photo surface", () => {
    usePlanMock.mockReturnValue({
      plan: "free",
      isPro: false,
      isLoading: false,
      subscription: null,
    });

    const { result } = renderHook(() => useFeatureGate("ai-photo-analysis"));
    expect(result.current.paywallSurface).toBe("unlimited_ai_photo");
  });

  it("closePaywall resets paywallOpen", () => {
    usePlanMock.mockReturnValue({
      plan: "free",
      isPro: false,
      isLoading: false,
      subscription: null,
    });

    const { result } = renderHook(() => useFeatureGate("multi-currency"));

    act(() => {
      result.current.requireAccess();
    });
    expect(result.current.paywallOpen).toBe(true);

    act(() => {
      result.current.closePaywall();
    });
    expect(result.current.paywallOpen).toBe(false);
  });
});
