// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

// The composition root pulls in SQLite/auth/mirror boot side-effects we do
// not want in a unit test — stub them to no-ops.
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
});

describe("useStorage composition root", () => {
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
