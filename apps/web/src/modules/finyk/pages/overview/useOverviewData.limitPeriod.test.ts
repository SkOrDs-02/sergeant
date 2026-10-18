// @vitest-environment jsdom
/**
 * Ліміти на Огляді × період і глибина історії (аудит 2026-10-01, logic-07).
 *
 * Огляд рахував `calcLimitCategorySpent` по київському МІСЯЦЮ для будь-якого
 * ліміту, тож тижневий/разовий ліміт бачив витрати всього місяця, а
 * `realTx` після мережі тримає лише поточний місяць. Тепер `budgetAlerts` це
 * `calcLimitUsages` по історії `realTx` + дзеркала, як на Плануванні.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "../../lib/monoMirrorReader";
import { useOverviewData } from "./useOverviewData";
import type { UseOverviewDataParams } from "./useOverviewData";

function mkTx(
  id: string,
  amountUah: number,
  iso: string,
): Record<string, unknown> {
  return {
    id,
    amount: -amountUah * 100,
    time: Math.floor(new Date(iso).getTime() / 1000),
    date: iso.slice(0, 10),
    description: "",
    mcc: 0,
    categoryId: "other",
    type: "expense",
    source: "mono",
    accountId: "mono-1",
    manual: false,
    _source: "mono",
    _accountId: "mono-1",
    _manual: false,
  };
}

function buildMono(
  realTx: Record<string, unknown>[],
): UseOverviewDataParams["mono"] {
  return {
    realTx,
    loadingTx: false,
    clientInfo: null,
    accounts: [],
    transactions: [],
    syncState: "idle" as const,
    lastUpdated: null,
    error: null,
    refresh: vi.fn(),
    privatTotal: 0,
  } as unknown as UseOverviewDataParams["mono"];
}

function buildStorage(
  budgets: unknown[],
  txCategories: Record<string, string>,
): UseOverviewDataParams["storage"] {
  return {
    budgets,
    subscriptions: [],
    manualDebts: [],
    receivables: [],
    hiddenAccounts: [],
    excludedTxIds: new Set<string>(),
    monthlyPlan: null,
    networthHistory: [],
    saveNetworthSnapshot: vi.fn(),
    txCategories,
    txSplits: {},
    manualAssets: [],
    customCategories: [],
    manualExpenses: [],
  } as unknown as UseOverviewDataParams["storage"];
}

const WEEKLY = (limit: number) => ({
  id: "b-week",
  type: "limit",
  categoryId: "transport",
  limit,
  period: "week",
});

describe("useOverviewData: період і історія лімітів", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    clearFinykMonoMirrorCache();
    vi.useRealTimers();
  });

  it("тижневий ліміт 1000 ₴: у тижні 200 ₴, у місяці 2900 ₴ - алерту нема", () => {
    // Ср 17.06.2026, тиждень з пн 15.06.
    vi.setSystemTime(new Date("2026-06-17T09:00:00Z"));
    const realTx = [
      mkTx("w1", 200, "2026-06-16T10:00:00+03:00"),
      mkTx("m1", 2700, "2026-06-03T10:00:00+03:00"),
    ];
    const cats = { w1: "transport", m1: "transport" };
    const { result } = renderHook(() =>
      useOverviewData({
        mono: buildMono(realTx),
        storage: buildStorage([WEEKLY(1000)], cats),
      }),
    );
    expect(result.current.budgetAlerts).toHaveLength(0);
  });

  it("тижневий ліміт: алерт з тижневою сумою, а не місячною", () => {
    vi.setSystemTime(new Date("2026-06-17T09:00:00Z"));
    const realTx = [
      mkTx("w1", 700, "2026-06-16T10:00:00+03:00"),
      mkTx("m1", 2200, "2026-06-03T10:00:00+03:00"),
    ];
    const cats = { w1: "transport", m1: "transport" };
    const { result } = renderHook(() =>
      useOverviewData({
        mono: buildMono(realTx),
        storage: buildStorage([WEEKLY(1000)], cats),
      }),
    );
    expect(result.current.budgetAlerts).toHaveLength(1);
    const [usage] = result.current.budgetAlerts;
    expect(usage?.spent).toBe(700);
    expect(usage?.pctRaw).toBe(70);
    expect(usage?.overLimit).toBe(false);
  });

  it("тиждень на межі місяців: 1650 ₴ з дзеркала за 28-30.09 + 200 ₴ жовтня з мережі = перевищення", () => {
    // Чт 01.10.2026, тиждень з пн 28.09; мережа несе лише жовтень.
    vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
    __setFinykMonoMirrorCacheForTests({
      transactions: [
        mkTx("s1", 1000, "2026-09-28T10:00:00+03:00"),
        mkTx("s2", 400, "2026-09-29T10:00:00+03:00"),
        mkTx("s3", 250, "2026-09-30T10:00:00+03:00"),
        // Дубль мережевого запису: рахується раз.
        mkTx("o1", 200, "2026-10-01T08:00:00+03:00"),
      ] as unknown as Transaction[],
    });
    const realTx = [mkTx("o1", 200, "2026-10-01T08:00:00+03:00")];
    const cats = {
      s1: "transport",
      s2: "transport",
      s3: "transport",
      o1: "transport",
    };
    const { result } = renderHook(() =>
      useOverviewData({
        mono: buildMono(realTx),
        storage: buildStorage([WEEKLY(1000)], cats),
      }),
    );
    expect(result.current.budgetAlerts).toHaveLength(1);
    const [usage] = result.current.budgetAlerts;
    expect(usage?.spent).toBe(1850);
    expect(usage?.overLimit).toBe(true);
  });
});
