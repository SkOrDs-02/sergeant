/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import type { ActivationInput, ActivationResult } from "@sergeant/insights";

const { evaluateMock, trackEventMock } = vi.hoisted(() => ({
  evaluateMock: vi.fn<(input: ActivationInput) => ActivationResult>(),
  trackEventMock: vi.fn(),
}));

vi.mock("@sergeant/insights", async () => {
  const actual =
    await vi.importActual<typeof import("@sergeant/insights")>(
      "@sergeant/insights",
    );
  return {
    ...actual,
    evaluateActivationV2: (input: ActivationInput) => evaluateMock(input),
  };
});

vi.mock("../observability/analytics", async () => {
  const shared = await import("@sergeant/shared");
  return {
    ANALYTICS_EVENTS: shared.ANALYTICS_EVENTS,
    trackEvent: (name: string, payload?: unknown) =>
      trackEventMock(name, payload),
  };
});

import { useActivationV2 } from "./useActivationV2";
import { ANALYTICS_EVENTS } from "@sergeant/shared";

const HOUR_MS = 60 * 60 * 1000;

const ACTIVATED_INPUT: ActivationInput = {
  signedUpAt: 0,
  evaluatedAt: 24 * HOUR_MS,
  monoAccountsConnected: 1,
  categorizedTransactions: 7,
  budgetsCreated: 2,
};

const ACTIVATED_RESULT: ActivationResult = {
  activated: true,
  hoursElapsed: 24,
  conditions: {
    monoConnected: true,
    transactionsCategorized: true,
    budgetCreated: true,
    withinWindow: true,
  },
};

const NOT_ACTIVATED_RESULT: ActivationResult = {
  activated: false,
  hoursElapsed: 24,
  conditions: {
    monoConnected: true,
    transactionsCategorized: false,
    budgetCreated: true,
    withinWindow: true,
  },
};

describe("useActivationV2 (web-side capture — initiative 0010 Phase 5 / audit P1-2)", () => {
  beforeEach(() => {
    evaluateMock.mockReset();
    trackEventMock.mockReset();
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null and never fires the event when input is null (snapshot not yet collected)", () => {
    const { result } = renderHook(() => useActivationV2(null));
    expect(result.current).toBeNull();
    expect(evaluateMock).not.toHaveBeenCalled();
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("fires ACTIVATION_V2_HIT exactly once with the canonical payload when activation flips to true", () => {
    evaluateMock.mockReturnValue(ACTIVATED_RESULT);

    const { result, rerender } = renderHook(
      ({ input }: { input: ActivationInput | null }) => useActivationV2(input),
      { initialProps: { input: ACTIVATED_INPUT } },
    );

    expect(result.current).toEqual(ACTIVATED_RESULT);
    expect(trackEventMock).toHaveBeenCalledTimes(1);
    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.ACTIVATION_V2_HIT,
      {
        time_to_activate_hours: 24,
        mono_connected: true,
        transactions_categorized: 7,
        budgets_set: 2,
      },
    );

    // Re-renders with the same activated input must not double-fire —
    // idempotency held by the `sergeant.activation_v2_fired` flag.
    rerender({ input: { ...ACTIVATED_INPUT } });
    expect(trackEventMock).toHaveBeenCalledTimes(1);
  });

  it("does not fire when the evaluator returns activated=false", () => {
    evaluateMock.mockReturnValue(NOT_ACTIVATED_RESULT);

    renderHook(() => useActivationV2(ACTIVATED_INPUT));

    expect(evaluateMock).toHaveBeenCalledTimes(1);
    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("respects the persisted `sergeant.activation_v2_fired` flag from a prior session", () => {
    window.localStorage.setItem(
      "sergeant.activation_v2_fired",
      JSON.stringify(true),
    );
    evaluateMock.mockReturnValue(ACTIVATED_RESULT);

    renderHook(() => useActivationV2(ACTIVATED_INPUT));

    expect(trackEventMock).not.toHaveBeenCalled();
  });

  it("forwards the A/B variant tag to the payload when supplied", () => {
    evaluateMock.mockReturnValue(ACTIVATED_RESULT);

    renderHook(() =>
      useActivationV2(ACTIVATED_INPUT, { variant: "vibe_picks" }),
    );

    expect(trackEventMock).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.ACTIVATION_V2_HIT,
      expect.objectContaining({ variant: "vibe_picks" }),
    );
  });
});
