// @vitest-environment jsdom
/**
 * Регресія: порада коуча («Сержант · Припущення») роздувала «Інше».
 *
 * Знімок тижня бакетив витрати за сирим `txCategories[id] || String(mcc)`:
 *   - ручна витрата (`mcc: 0`, категорія в `categoryId`) падала в ключ «0»
 *     і підписувалась «Інше»;
 *   - банківський рядок із невідомим MCC, але впізнаваним описом, не мав
 *     keyword-фолбека (на відміну від стрічки транзакцій і дайджесту);
 *   - користувацька категорія їхала в промпт сирим слагом (`cust_pets`).
 *
 * На відміну від `useCoachInsight.snapshot.test.ts`, фінікові читачі тут
 * НЕ підмінені: SQLite-кеш і Mono-дзеркало засіяні, тож тест проходить
 * реальний шлях `readFinykStatsContext` → `calcFinykPeriodAggregate`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "@finyk/lib/monoMirrorReader";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "@finyk/lib/sqliteReader";

const mockGetMemory = vi.fn<() => Promise<unknown>>();
const mockPostInsight = vi.fn<(arg: unknown) => Promise<unknown>>();

vi.mock("@shared/api", () => ({
  coachApi: {
    getMemory: () => mockGetMemory(),
    postInsight: (arg: unknown) => mockPostInsight(arg),
  },
  isApiError: (err: unknown): boolean =>
    typeof err === "object" && err !== null && "kind" in err,
}));

function noonSec(day: string): number {
  return Math.floor(Date.parse(`${day}T12:00:00.000Z`) / 1000);
}

// Четвер 2026-05-07; тиждень починається в понеділок 2026-05-04 (TZ у vitest = UTC).
const NOW = new Date("2026-05-07T12:00:00.000Z");

function seed(): void {
  __setFinykMonoMirrorCacheForTests({
    transactions: [
      // Невідомий MCC, але опис упізнаваний: keyword-фолбек → «Продукти».
      {
        id: "b-kw",
        amount: -20_000,
        time: noonSec("2026-05-05"),
        mcc: 9999,
        description: "Сільпо",
      },
      { id: "b-mcc", amount: -15_000, time: noonSec("2026-05-05"), mcc: 5411 },
      // Справді нерозпізнана витрата: єдине, що має лишитись в «Інше».
      {
        id: "b-unknown",
        amount: -5_000,
        time: noonSec("2026-05-06"),
        mcc: 9999,
        description: "Невідомий продавець",
      },
      // Банківська витрата, яку користувач віднесла до власної категорії.
      {
        id: "b-custom",
        amount: -7_000,
        time: noonSec("2026-05-06"),
        mcc: 9999,
        description: "Ветклініка",
      },
    ] as never[],
    accounts: [],
    refreshedAt: "2026-05-07T00:00:00.000Z",
  });
  __setFinykSqliteStateCacheForTests({
    txCategories: { "b-custom": "cust_pets" },
    customCategories: [{ id: "cust_pets", label: "Улюбленці" }] as never,
    manualExpenses: [
      {
        id: "m1",
        date: "2026-05-06",
        description: "Кава",
        amount: 80,
        category: "restaurant",
      },
      {
        id: "m2",
        date: "2026-05-06",
        description: "Ринок",
        amount: 120,
        category: "food",
      },
    ] as never,
    refreshedAt: "2026-05-07T00:00:00.000Z",
  });
}

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe("useCoachInsight — категорії знімка тижня", () => {
  let qc: QueryClient;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // Фейкаємо лише Date: react-query й waitFor лишаються на справжніх таймерах.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, retryDelay: 0, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    mockGetMemory.mockResolvedValue({ memory: null });
    mockPostInsight.mockResolvedValue({ insight: "ok" });
    seed();
  });

  afterEach(() => {
    qc.clear();
    clearFinykMonoMirrorCache();
    clearFinykSqliteCache();
    localStorage.clear();
    vi.useRealTimers();
  });

  it("ручні витрати, keyword-фолбек і користувацька категорія не падають в «Інше»", async () => {
    const { useCoachInsight } = await import("./useCoachInsight");
    const { result } = renderHook(() => useCoachInsight(), {
      wrapper: makeWrapper(qc),
    });
    await waitFor(() => expect(result.current.insight).toBe("ok"));

    const arg = mockPostInsight.mock.calls[0]![0] as {
      snapshot: {
        finyk: {
          totalSpent: number;
          topCategories: Array<{ name: string; amount: number }>;
        };
      };
    };
    const { totalSpent, topCategories } = arg.snapshot.finyk;

    // 200 + 150 + 50 + 70 (банк) + 80 + 120 (ручні).
    expect(totalSpent).toBe(670);
    expect(topCategories).toEqual([
      // b-kw 200 (keyword) + b-mcc 150 + m2 120 (ручна категорія `food`).
      { name: "Продукти", amount: 470 },
      // m1: ручна категорія `restaurant`, без жодного MCC.
      { name: "Кафе та ресторани", amount: 80 },
      // Підпис користувацької категорії, а не слаг `cust_pets`.
      { name: "Улюбленці", amount: 70 },
      // Лише справді нерозпізнана витрата. До фіксу тут було 450 грн.
      { name: "Інше", amount: 50 },
    ]);
  });
});
