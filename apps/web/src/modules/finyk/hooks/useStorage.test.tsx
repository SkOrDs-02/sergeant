// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

// The composition root pulls in SQLite/auth/mirror boot side-effects we do
// not want in a unit test — stub them to no-ops.
const dualWriteBootSpy = vi.fn();
vi.mock("./useFinykDualWriteBoot", () => ({
  useFinykDualWriteBoot: () => dualWriteBootSpy(),
}));
vi.mock("./useFinykDualWriteSync", () => ({
  useFinykDualWriteSync: () => {},
}));
vi.mock("./useFinykSqliteReadBoot", () => ({
  useFinykSqliteReadBoot: () => {},
}));
vi.mock("./useFinykMonoMirrorBoot", () => ({
  useFinykMonoMirrorBoot: () => {},
}));

import { INTERNAL_TRANSFER_ID } from "../constants";
import { useStorage } from "./useStorage";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/finyk/assets"]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  dualWriteBootSpy.mockClear();
});

describe("useStorage composition root", () => {
  it("registers the dual-write context itself, not only via RootLayout", () => {
    // Regression: the only `useFinykDualWriteBoot` call site used to be
    // `RootLayout`'s `FinykBootGate`, which renders nothing while
    // `!user && !isDemoActive()`. `useFinykDualWriteSync` is then a
    // permanent no-op, so every expense an anonymous visitor added
    // reached the warm cache only and vanished on reload. Routine,
    // Fizruk and Nutrition all boot from their own shell too.
    renderHook(() => useStorage(), { wrapper });
    expect(dualWriteBootSpy).toHaveBeenCalled();
  });

  it("exposes the flat public contract", () => {
    const { result } = renderHook(() => useStorage(), { wrapper });
    for (const key of [
      "budgets",
      "subscriptions",
      "addManualExpense",
      "toggleHideAccount",
      "exportData",
      "excludedTxIds",
      "saveNetworthSnapshot",
      "showBalance",
    ]) {
      expect(result.current).toHaveProperty(key);
    }
    expect(result.current.excludedTxIds).toBeInstanceOf(Set);
  });

  it("includes internal-transfer tx ids in excludedTxIds", () => {
    const { result } = renderHook(() => useStorage(), { wrapper });
    act(() => {
      result.current.hideTx("hidden-1");
      result.current.overrideCategory("transfer-1", INTERNAL_TRANSFER_ID);
    });
    expect(result.current.excludedTxIds.has("hidden-1")).toBe(true);
    expect(result.current.excludedTxIds.has("transfer-1")).toBe(true);
  });

  it("excludes a manual entry whose own category is the internal transfer", () => {
    // Мапа `finyk_tx_cats` ключується банківськими id, тож ручний запис
    // ніс мітку переказу тільки в собі — і рахувався витратою скрізь,
    // крім дайджесту й коуча.
    const { result } = renderHook(() => useStorage(), { wrapper });
    act(() => {
      result.current.addManualExpense({
        id: "mx-1",
        amount: 1000,
        category: INTERNAL_TRANSFER_ID,
        kind: "income",
      });
    });
    expect(result.current.excludedTxIds.has("manual_mx-1")).toBe(true);
  });

  it("keeps debt-linked tx ids OUT of excludedTxIds (they stay visible in stats)", () => {
    // debtLinkedTxIds tracks mono-debt-linked transactions so they can be
    // surfaced under the "Борги та кредити" category — unlike
    // internal-transfer / hidden tx ids, they must NOT be filtered out of
    // the stats-facing excludedTxIds set.
    const { result } = renderHook(() => useStorage(), { wrapper });
    act(() => {
      result.current.toggleMonoDebtTx("acc-1", "debt-tx-1");
    });
    expect(result.current.debtLinkedTxIds.has("debt-tx-1")).toBe(true);
    expect(result.current.excludedTxIds.has("debt-tx-1")).toBe(false);
  });

  it("saveNetworthSnapshot appends a month entry to networthHistory", () => {
    const { result } = renderHook(() => useStorage(), { wrapper });
    act(() => {
      result.current.saveNetworthSnapshot(123456);
    });
    expect(result.current.networthHistory.length).toBeGreaterThan(0);
    const last =
      result.current.networthHistory[
        result.current.networthHistory.length - 1
      ]!;
    expect(last.networth).toBe(123456);
    expect(last.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it("saveNetworthSnapshot skips a same-day sub-1% change", () => {
    const { result } = renderHook(() => useStorage(), { wrapper });
    act(() => {
      result.current.saveNetworthSnapshot(100000);
    });
    const countAfterFirst = result.current.networthHistory.length;
    act(() => {
      // <1% change on the same day → ref guard short-circuits.
      result.current.saveNetworthSnapshot(100500);
    });
    expect(result.current.networthHistory.length).toBe(countAfterFirst);
  });
});
