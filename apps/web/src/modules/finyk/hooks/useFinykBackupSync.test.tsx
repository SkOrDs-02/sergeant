// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("../hubRoutineSync", () => ({
  notifyFinykRoutineCalendarSync: vi.fn(),
}));

const downloadJsonMock = vi.fn();
vi.mock("@sergeant/shared", async () => {
  const actual =
    await vi.importActual<typeof import("@sergeant/shared")>(
      "@sergeant/shared",
    );
  return {
    ...actual,
    downloadJson: (...args: unknown[]) => downloadJsonMock(...args),
    toLocalISODate: () => "2026-06-23",
  };
});

import { notifyFinykRoutineCalendarSync } from "../hubRoutineSync";
import { useFinykBackupSync } from "./useFinykBackupSync";
import { FINYK_BACKUP_VERSION } from "../lib/finykBackup";
import type { FinykStorageSlots } from "./useFinykStorageSlots";

function makeSlots(initial: Partial<Record<string, unknown>> = {}) {
  const state: Record<string, unknown> = {
    budgets: [],
    subscriptions: [],
    manualAssets: [],
    manualDebts: [],
    receivables: [],
    hiddenAccounts: [],
    hiddenTxIds: [],
    monthlyPlan: { income: "", expense: "", savings: "" },
    txCategories: {},
    txSplits: {},
    monoDebtLinkedTxIds: {},
    networthHistory: [],
    customCategories: [],
    dismissedRecurring: [],
    ...initial,
  };
  const setter = (key: string) => (next: unknown) => {
    state[key] =
      typeof next === "function"
        ? (next as (prev: unknown) => unknown)(state[key])
        : next;
  };
  const slots = {
    budgets: state["budgets"],
    setBudgets: setter("budgets"),
    subscriptions: state["subscriptions"],
    setSubscriptions: setter("subscriptions"),
    manualAssets: state["manualAssets"],
    setManualAssets: setter("manualAssets"),
    manualDebts: state["manualDebts"],
    setManualDebts: setter("manualDebts"),
    receivables: state["receivables"],
    setReceivables: setter("receivables"),
    hiddenAccounts: state["hiddenAccounts"],
    setHiddenAccounts: setter("hiddenAccounts"),
    hiddenTxIds: state["hiddenTxIds"],
    setHiddenTxIds: setter("hiddenTxIds"),
    monthlyPlan: state["monthlyPlan"],
    setMonthlyPlan: setter("monthlyPlan"),
    txCategories: state["txCategories"],
    setTxCategories: setter("txCategories"),
    txSplits: state["txSplits"],
    setTxSplits: setter("txSplits"),
    monoDebtLinkedTxIds: state["monoDebtLinkedTxIds"],
    setMonoDebtLinkedTxIds: setter("monoDebtLinkedTxIds"),
    networthHistory: state["networthHistory"],
    setNetworthHistory: setter("networthHistory"),
    customCategories: state["customCategories"],
    setCustomCategories: setter("customCategories"),
    dismissedRecurring: state["dismissedRecurring"],
    setDismissedRecurring: setter("dismissedRecurring"),
  } as unknown as FinykStorageSlots;
  return { slots, state };
}

function render(slots: FinykStorageSlots, initialEntries = ["/finyk/assets"]) {
  const toast = { success: vi.fn(() => 1), error: vi.fn(() => 2) };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );
  const { result } = renderHook(() => useFinykBackupSync(slots, toast), {
    wrapper,
  });
  return { result, toast };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("applyData", () => {
  it("applies every present field and notifies the calendar sync", () => {
    const { slots, state } = makeSlots();
    const { result } = render(slots);
    result.current.applyData({
      budgets: [{ id: "b" }],
      subscriptions: [{ id: "s" }],
      manualAssets: [{ id: "a" }],
      manualDebts: [{ id: "d" }],
      receivables: [{ id: "r" }],
      hiddenAccounts: ["h"],
      hiddenTxIds: ["t"],
      monthlyPlan: { income: "1", expense: "2", savings: "3" },
      txCategories: { tx: "c" },
      txSplits: { tx: [] },
      monoDebtLinkedTxIds: { acc: ["t"] },
      networthHistory: [{ month: "2026-01", networth: 5 }],
      customCategories: [{ id: "cus", label: "X" }],
      dismissedRecurring: ["k"],
    } as never);

    expect(state["budgets"]).toEqual([{ id: "b" }]);
    expect(state["txCategories"]).toEqual({ tx: "c" });
    expect(state["dismissedRecurring"]).toEqual(["k"]);
    expect(notifyFinykRoutineCalendarSync).toHaveBeenCalled();
  });
});

describe("exportData", () => {
  it("calls downloadJson with a versioned snapshot", async () => {
    const { slots } = makeSlots({ budgets: [{ id: "b1" }] });
    const { result } = render(slots);
    await result.current.exportData();
    expect(downloadJsonMock).toHaveBeenCalledWith(
      "finyk-backup-2026-06-23.json",
      expect.objectContaining({
        version: FINYK_BACKUP_VERSION,
        budgets: [{ id: "b1" }],
      }),
    );
  });
});

describe("importData", () => {
  function fileFrom(text: string): Blob {
    return new Blob([text], { type: "application/json" });
  }

  it("resolves true and applies a valid backup", async () => {
    const { slots, state } = makeSlots();
    const { result, toast } = render(slots);
    const ok = await result.current.importData(
      fileFrom(JSON.stringify({ version: 1, budgets: [{ id: "x" }] })),
    );
    expect(ok).toBe(true);
    expect(state["budgets"]).toEqual([{ id: "x" }]);
    expect(toast.success).toHaveBeenCalled();
  });

  it("resolves false and toasts an error on malformed JSON", async () => {
    const { slots } = makeSlots();
    const { result, toast } = render(slots);
    const ok = await result.current.importData(fileFrom("{not json"));
    expect(ok).toBe(false);
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("generateSyncLink / loadFromUrl", () => {
  it("round-trips a sync link", () => {
    const exporter = makeSlots({
      budgets: [{ id: "b" }],
      txCategories: { tx: "c" },
    });
    const { result: exportRes } = render(exporter.slots);
    const link = exportRes.current.generateSyncLink();
    expect(link).toContain("?sync=");

    const encoded = new URL(link).searchParams.get("sync")!;
    const importer = makeSlots();
    const { result: importRes } = render(importer.slots, [
      `/finyk/assets?sync=${encodeURIComponent(encoded)}`,
    ]);
    const loaded = importRes.current.loadFromUrl();
    expect(loaded).toBe(true);
    expect(importer.state["budgets"]).toEqual([{ id: "b" }]);
    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({ search: "" }),
      { replace: true },
    );
  });

  it("returns false when no sync param is present", () => {
    const { slots } = makeSlots();
    const { result } = render(slots, ["/finyk/assets"]);
    expect(result.current.loadFromUrl()).toBe(false);
  });

  it("returns false on corrupt sync payload", () => {
    const { slots } = makeSlots();
    const { result } = render(slots, ["/finyk/assets?sync=%%%bad"]);
    expect(result.current.loadFromUrl()).toBe(false);
  });
});
