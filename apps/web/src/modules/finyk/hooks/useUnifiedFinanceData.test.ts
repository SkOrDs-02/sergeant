// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useUnifiedFinanceData } from "./useUnifiedFinanceData";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

function tx(id: string, time: number): Transaction {
  return {
    id,
    time,
    date: "2026-06-05",
    amount: -1000,
    description: "x",
    mcc: 0,
  } as unknown as Transaction;
}

function makeMono(over: Record<string, unknown> = {}) {
  return {
    realTx: [],
    accounts: [],
    refresh: async () => {},
    error: "",
    syncState: { status: "success" },
    loadingTx: false,
    lastUpdated: null,
    ...over,
  } as never;
}

function makePrivat(over: Record<string, unknown> = {}) {
  return {
    connected: false,
    transactions: [],
    accounts: [],
    refresh: async () => {},
    error: "",
    syncState: { status: "idle" },
    loadingTx: false,
    lastUpdated: null,
    ...over,
  } as never;
}

describe("useUnifiedFinanceData", () => {
  it("merges and dedupes mono + privat transactions", () => {
    const mono = makeMono({ realTx: [tx("a", 200), tx("b", 100)] });
    const privat = makePrivat({
      connected: true,
      transactions: [tx("c", 300)],
    });
    const { result } = renderHook(() =>
      useUnifiedFinanceData({ mono, privat }),
    );
    const merged = result.current.mergedMono;
    expect(merged.realTx).toHaveLength(3);
    // sorted by time desc
    expect(merged.realTx[0]!.id).toBe("c");
  });

  it("sums privat UAH balances into privatTotal/totalBalance", () => {
    const mono = makeMono({ accounts: [{ id: "m1" }] });
    const privat = makePrivat({
      accounts: [
        { id: "p1", currency: "UAH", balance: 150000 },
        { id: "p2", currency: "USD", balance: 999999 },
      ],
    });
    const { result } = renderHook(() =>
      useUnifiedFinanceData({ mono, privat }),
    );
    // 150000 kopiykas / 100 = 1500 grn; USD account excluded from total.
    expect(result.current.mergedMono.privatTotal).toBe(1500);
    // 1 mono account + 2 privat accounts are all surfaced.
    expect(result.current.mergedMono.accounts).toHaveLength(3);
  });

  it("combines error strings from both sources", () => {
    const mono = makeMono({ error: "mono down" });
    const privat = makePrivat({ error: "privat down" });
    const { result } = renderHook(() =>
      useUnifiedFinanceData({ mono, privat }),
    );
    expect(result.current.mergedMono.error).toContain("mono down");
    expect(result.current.mergedMono.error).toContain("ПриватБанк");
  });

  it("escalates the combined sync status to error", () => {
    const mono = makeMono({ syncState: { status: "success" } });
    const privat = makePrivat({
      syncState: { status: "error" },
      loadingTx: false,
    });
    const { result } = renderHook(() =>
      useUnifiedFinanceData({ mono, privat }),
    );
    expect(result.current.mergedMono.syncState.status).toBe("error");
  });

  it("picks the most recent lastUpdated of the two", () => {
    const older = new Date(2026, 5, 1);
    const newer = new Date(2026, 5, 10);
    const mono = makeMono({ lastUpdated: older });
    const privat = makePrivat({ lastUpdated: newer });
    const { result } = renderHook(() =>
      useUnifiedFinanceData({ mono, privat }),
    );
    expect(result.current.mergedMono.lastUpdated!.getTime()).toBe(
      newer.getTime(),
    );
  });
});
