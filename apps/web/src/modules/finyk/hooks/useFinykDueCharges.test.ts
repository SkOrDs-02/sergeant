// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "@finyk/lib/sqliteReader";
import { notifyFinykSqliteCacheRefresh } from "@finyk/lib/sqliteReadGate";
import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "@finyk/lib/monoMirrorReader";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { useFinykDueCharges } from "./useFinykDueCharges";

type Seed = Parameters<typeof __setFinykSqliteStateCacheForTests>[0];

// 29 липня 2026, полудень за Києвом.
const NOW = new Date("2026-07-29T09:00:00Z");

describe("useFinykDueCharges (хаб, OD-26 Ф-4 (а))", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    clearFinykSqliteCache();
    clearFinykMonoMirrorCache();
    vi.useRealTimers();
  });

  it("порожній стан: холодні кеші — порожній список", () => {
    const { result } = renderHook(() => useFinykDueCharges());
    expect(result.current).toEqual([]);
  });

  it("читає підписки й борги з кешу SQLite, а суму підписки з банківського дзеркала", () => {
    __setFinykMonoMirrorCacheForTests({
      transactions: [
        {
          id: "mono-1",
          amount: -25_000,
          // 30 червня: минулий цикл сплачено, наступне списання 30 липня.
          time: Date.parse("2026-06-30T10:00:00+03:00") / 1000,
          description: "NETFLIX.COM",
        } as Transaction,
      ],
    });
    __setFinykSqliteStateCacheForTests({
      subscriptions: [
        { id: "s1", name: "Netflix", billingDay: 30, keyword: "netflix" },
      ],
      manualDebts: [
        {
          id: "d1",
          name: "Кредит",
          totalAmount: 1_500,
          dueDate: "2026-07-29",
        },
      ],
    } as unknown as Seed);

    const { result } = renderHook(() => useFinykDueCharges());

    expect(
      result.current.map((c) => [c.id, c.daysLeft, c.amountMinor]),
    ).toEqual([
      ["debt-d1", 0, 150_000],
      ["sub-s1", 1, 25_000],
    ]);
  });

  it("перечитує кеш після оновлення SQLite", () => {
    const { result } = renderHook(() => useFinykDueCharges());
    expect(result.current).toEqual([]);

    act(() => {
      __setFinykSqliteStateCacheForTests({
        manualDebts: [
          { id: "d1", name: "Кредит", totalAmount: 100, dueDate: "2026-07-30" },
        ],
      } as unknown as Seed);
      notifyFinykSqliteCacheRefresh();
    });

    expect(result.current.map((c) => c.id)).toEqual(["debt-d1"]);
  });
});
