// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { INTERNAL_TRANSFER_ID } from "@sergeant/finyk-domain/constants";

const { state, writeSnapshotMock } = vi.hoisted(() => ({
  state: {
    sqliteTick: 0,
    monoTick: 0,
    sqlite: {
      refreshedAt: null as string | null,
      txCategories: {} as Record<string, string | undefined>,
      hiddenTransactions: [] as string[],
      receivables: [] as Array<{ linkedTxIds?: string[] }>,
      excludedStatTxIds: null as string[] | null,
      manualExpenses: [],
      txSplits: {},
      monthlyPlan: null as {
        income: string | number;
        expense: string | number;
        savings: string | number;
      } | null,
    },
    mono: {
      refreshedAt: null as string | null,
      transactions: [] as Array<{ id: string; amount: number; time: number }>,
    },
  },
  writeSnapshotMock: vi.fn(),
}));

vi.mock("../lib/sqliteReadGate", () => ({
  useFinykSqliteReadTick: () => state.sqliteTick,
}));
vi.mock("../lib/monoMirrorGate", () => ({
  useFinykMonoMirrorTick: () => state.monoTick,
}));
vi.mock("../lib/sqliteReader", () => ({
  getCachedFinykSqliteState: () => state.sqlite,
}));
vi.mock("../lib/monoMirrorReader", () => ({
  getVisibleFinykMonoMirrorState: () => state.mono,
}));
vi.mock("./useFinykQuickStatsWriter", () => ({
  writeFinykQuickStatsSnapshot: writeSnapshotMock,
}));

import { useFinykQuickStatsBoot } from "./useFinykQuickStatsBoot";

describe("useFinykQuickStatsBoot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.sqliteTick = 0;
    state.monoTick = 0;
    state.sqlite.refreshedAt = null;
    state.sqlite.txCategories = {};
    state.sqlite.hiddenTransactions = [];
    state.sqlite.receivables = [];
    state.sqlite.excludedStatTxIds = null;
    state.sqlite.manualExpenses = [];
    state.sqlite.txSplits = {};
    state.sqlite.monthlyPlan = null;
    state.mono.refreshedAt = null;
    state.mono.transactions = [];
  });

  it("waits for both canonical caches before rebuilding the Hub snapshot", () => {
    const { rerender } = renderHook(() => useFinykQuickStatsBoot());
    expect(writeSnapshotMock).not.toHaveBeenCalled();

    state.sqlite.refreshedAt = "2026-07-29T09:00:00.000Z";
    state.sqliteTick += 1;
    rerender();
    expect(writeSnapshotMock).not.toHaveBeenCalled();

    state.mono.refreshedAt = "2026-07-29T09:00:01.000Z";
    state.mono.transactions = [
      { id: "purchase", amount: -10_000, time: 1 },
      { id: "transfer", amount: -50_000, time: 2 },
    ];
    state.sqlite.txCategories = { transfer: INTERNAL_TRANSFER_ID };
    state.sqlite.monthlyPlan = { income: 0, expense: 5_000, savings: 0 };
    state.monoTick += 1;
    rerender();

    expect(writeSnapshotMock).toHaveBeenCalledTimes(1);
    const input = writeSnapshotMock.mock.calls[0]?.[0] as {
      excludedTxIds: Set<string>;
      planExpense: number;
      transactions: Array<{ id: string }>;
    };
    expect(input.transactions.map((item) => item.id)).toEqual([
      "purchase",
      "transfer",
    ]);
    expect(input.excludedTxIds).toEqual(new Set(["transfer"]));
    expect(input.planExpense).toBe(5_000);
  });
});
