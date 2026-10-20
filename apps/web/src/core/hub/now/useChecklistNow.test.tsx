// @vitest-environment jsdom
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { resetAllChecklists, type DashboardModuleId } from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";
import { ToastProvider, useToast } from "@shared/hooks/useToast";

const { signalsMock } = vi.hoisted(() => ({ signalsMock: vi.fn() }));
vi.mock("../../onboarding/useChecklistSignals", () => ({
  useChecklistSignals: signalsMock,
}));

import { useChecklistNow } from "./useChecklistNow";

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

beforeEach(() => {
  resetAllChecklists(webKVStore);
  signalsMock.mockReset().mockReturnValue({});
});
afterEach(() => resetAllChecklists(webKVStore));

describe("useChecklistNow", () => {
  it("returns no steps and does not read signals for a closed checklist", () => {
    const { result } = renderHook(() => useChecklistNow(null), { wrapper });
    expect(result.current).toEqual({ open: [], done: [] });
    expect(signalsMock).toHaveBeenCalledWith("finyk");
  });

  it("latches steps as data proves them and moves them from open to done", async () => {
    signalsMock.mockReturnValue({ add_expense: true });
    const { result, rerender } = renderHook(() => useChecklistNow("finyk"), {
      wrapper,
    });
    await waitFor(() =>
      expect(result.current.done.map((step) => step.id)).toContain(
        "add_expense",
      ),
    );
    expect(result.current.open.map((step) => step.id)).not.toContain(
      "add_expense",
    );
    // A later loss of the live signal cannot undo the achieved onboarding step.
    signalsMock.mockReturnValue({});
    rerender();
    expect(result.current.done.map((step) => step.id)).toContain("add_expense");
  });

  it("switches module state and shows one completion toast on the transition", async () => {
    signalsMock.mockReturnValue({});
    const { result, rerender } = renderHook(
      ({ moduleId }) => [useChecklistNow(moduleId), useToast()] as const,
      {
        initialProps: { moduleId: "finyk" as DashboardModuleId },
        wrapper,
      },
    );
    signalsMock.mockReturnValue({
      add_expense: true,
      set_budget: true,
      connect_bank: true,
      view_analytics: true,
    });
    rerender({ moduleId: "finyk" });
    await waitFor(() => expect(result.current[0].done).toHaveLength(4));
    await waitFor(() =>
      expect(
        result.current[1].toasts.some((toast) =>
          String(toast.msg).includes("перші кроки виконано"),
        ),
      ).toBe(true),
    );
    rerender({ moduleId: "routine" });
    expect(
      result.current[0].open.length + result.current[0].done.length,
    ).toBeGreaterThan(0);
  });
});
