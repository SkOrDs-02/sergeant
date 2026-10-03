/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { BillingAccess } from "@sergeant/shared";

const { usePlanMock } = vi.hoisted(() => ({
  usePlanMock: vi.fn(),
}));

vi.mock("./usePlan", () => ({
  usePlan: () => usePlanMock(),
}));

import { useFeatureGate } from "./useFeatureGate";

const RESETS = "2026-06-14T21:00:00.000Z";

function access(
  state: BillingAccess["state"],
  overrides: Partial<BillingAccess["meters"]> = {},
): BillingAccess {
  const free = state === "free";
  return {
    state,
    trialEndsAt: null,
    graceEndsAt: null,
    features: {
      "export.pdf": !free,
      "ai.photo": true,
      "nutrition.weekPlan": !free,
    },
    meters: {
      aiActions: { used: 0, limit: free ? 20 : null, resetsAt: RESETS },
      aiPhoto: { used: 0, limit: free ? 3 : null, resetsAt: RESETS },
      finykVision: { used: 0, limit: free ? 5 : null, resetsAt: RESETS },
      ...overrides,
    },
  };
}

describe("useFeatureGate", () => {
  beforeEach(() => {
    usePlanMock.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("відкриває Premium-фічу, коли знімок каже, що вона доступна (trial)", () => {
    usePlanMock.mockReturnValue({ access: access("trial") });

    const { result } = renderHook(() => useFeatureGate("export.pdf"));

    expect(result.current.canAccess).toBe(true);
    expect(result.current.featureId).toBe("export.pdf");
    expect(result.current.paywallSurface).toBe("csv_export");

    let allowed = false;
    act(() => {
      allowed = result.current.requireAccess();
    });
    expect(allowed).toBe(true);
    expect(result.current.paywallOpen).toBe(false);
  });

  it("Free: закрита фіча відкриває пейвол", () => {
    usePlanMock.mockReturnValue({ access: access("free") });

    const { result } = renderHook(() => useFeatureGate("nutrition.weekPlan"));

    expect(result.current.canAccess).toBe(false);
    expect(result.current.paywallSurface).toBe("week_plan");

    let allowed = true;
    act(() => {
      allowed = result.current.requireAccess();
    });
    expect(allowed).toBe(false);
    expect(result.current.paywallOpen).toBe(true);
  });

  it("Free: фото відкрите, доки тижневий лічильник не вичерпано", () => {
    usePlanMock.mockReturnValue({
      access: access("free", {
        aiPhoto: { used: 2, limit: 3, resetsAt: RESETS },
      }),
    });
    const { result, rerender } = renderHook(() => useFeatureGate("ai.photo"));
    expect(result.current.canAccess).toBe(true);
    expect(result.current.paywallSurface).toBe("unlimited_ai_photo");

    usePlanMock.mockReturnValue({
      access: access("free", {
        aiPhoto: { used: 3, limit: 3, resetsAt: RESETS },
      }),
    });
    rerender();
    expect(result.current.canAccess).toBe(false);
  });

  it("без знімка діє правило Free з реєстру", () => {
    usePlanMock.mockReturnValue({ access: null });
    expect(
      renderHook(() => useFeatureGate("ai.photo")).result.current.canAccess,
    ).toBe(true);
    expect(
      renderHook(() => useFeatureGate("export.pdf")).result.current.canAccess,
    ).toBe(false);
  });

  it("openPaywall і closePaywall керують станом модалки", () => {
    usePlanMock.mockReturnValue({ access: access("free") });
    const { result } = renderHook(() => useFeatureGate("ai.finykVision"));
    expect(result.current.paywallSurface).toBe("finyk_vision");

    act(() => {
      result.current.openPaywall();
    });
    expect(result.current.paywallOpen).toBe(true);

    act(() => {
      result.current.closePaywall();
    });
    expect(result.current.paywallOpen).toBe(false);
  });
});
