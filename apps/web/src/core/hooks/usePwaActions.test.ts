/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ─── Collaborator mocks ───────────────────────────────────────────────────────

const { safeWriteLSMock, consumePwaActionMock } = vi.hoisted(() => ({
  safeWriteLSMock: vi.fn(),
  consumePwaActionMock: vi.fn(() => null as string | null),
}));

vi.mock("@shared/lib/storage/storage", () => ({
  safeWriteLS: safeWriteLSMock,
  safeReadStringLS: vi.fn(() => null),
  safeRemoveLS: vi.fn(),
}));

vi.mock("../app/pwaAction", () => ({
  PWA_ACTION_KEY: "pwa_pending_action",
  consumePwaAction: consumePwaActionMock,
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { usePwaActions, type PwaAction } from "./usePwaActions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function params(action?: string): URLSearchParams {
  const p = new URLSearchParams();
  if (action) p.set("action", action);
  return p;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("usePwaActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumePwaActionMock.mockReturnValue(null);
  });

  it("returns null pwaAction when no URL param and no stored action", () => {
    const { result } = renderHook(() => usePwaActions(params()));
    expect(result.current.pwaAction).toBeNull();
  });

  it("picks up a valid action from the URL search params", () => {
    const { result } = renderHook(() => usePwaActions(params("add_expense")));
    expect(result.current.pwaAction).toBe("add_expense");
  });

  it("writes valid URL action to localStorage via safeWriteLS", () => {
    renderHook(() => usePwaActions(params("start_workout")));
    expect(safeWriteLSMock).toHaveBeenCalledWith(
      "pwa_pending_action",
      "start_workout",
    );
  });

  it("ignores invalid URL param values", () => {
    const { result } = renderHook(() =>
      usePwaActions(params("unknown_action")),
    );
    expect(result.current.pwaAction).toBeNull();
  });

  it("falls back to consumed storage action when URL param is absent", () => {
    consumePwaActionMock.mockReturnValue("add_meal");
    const { result } = renderHook(() => usePwaActions(params()));
    expect(result.current.pwaAction).toBe("add_meal");
  });

  it("ignores an invalid storage action", () => {
    consumePwaActionMock.mockReturnValue("bogus");
    const { result } = renderHook(() => usePwaActions(params()));
    expect(result.current.pwaAction).toBeNull();
  });

  it("clearPwaAction sets pwaAction to null", () => {
    consumePwaActionMock.mockReturnValue("add_habit");
    const { result } = renderHook(() => usePwaActions(params()));
    expect(result.current.pwaAction).toBe("add_habit");
    act(() => {
      result.current.clearPwaAction();
    });
    expect(result.current.pwaAction).toBeNull();
  });

  it("setPwaAction updates pwaAction to the given value", () => {
    const { result } = renderHook(() => usePwaActions(params()));
    act(() => {
      result.current.setPwaAction("add_meal_photo" as PwaAction);
    });
    expect(result.current.pwaAction).toBe("add_meal_photo");
  });

  it("exposes the full set of valid actions", () => {
    const { result } = renderHook(() => usePwaActions(params()));
    expect(result.current.validActions.has("add_expense")).toBe(true);
    expect(result.current.validActions.has("start_workout")).toBe(true);
    expect(result.current.validActions.has("add_meal")).toBe(true);
    expect(result.current.validActions.has("add_meal_photo")).toBe(true);
    expect(result.current.validActions.has("add_habit")).toBe(true);
  });

  it("URL action takes precedence over stored action", () => {
    consumePwaActionMock.mockReturnValue("add_habit");
    const { result } = renderHook(() => usePwaActions(params("add_expense")));
    expect(result.current.pwaAction).toBe("add_expense");
  });
});
