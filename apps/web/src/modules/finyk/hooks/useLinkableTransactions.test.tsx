// @vitest-environment jsdom
/**
 * Пікер привʼязки має свій діапазон транзакцій — саме тому, що
 * `useMonobankWebhook` навмисно тягне лише поточний місяць. Тести
 * фіксують дві речі, на яких попередня версія і зламалася: діапазон
 * реально ширший за місяць, а опції періоду беруться з календаря.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

type Range = { from: string; to: string };
const fetchAllMonoTransactions = vi.fn(async (_params: Range) => []);
vi.mock("./monoTransactionsLoader", () => ({
  fetchAllMonoTransactions: (params: Range) => fetchAllMonoTransactions(params),
}));

import {
  buildMonthOptions,
  useLinkableTransactions,
  LINKABLE_MONTHS_BACK,
} from "./useLinkableTransactions";

const KYIV = new Date("2026-08-03T09:00:00Z");

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  fetchAllMonoTransactions.mockClear();
});

describe("buildMonthOptions", () => {
  // Опції залежать від «сьогодні» за Києвом — час фіксуємо лише тут;
  // хук-тести чекають на асинхронний запит і з fake-таймерами зависають.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(KYIV);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("будує опції з календаря, найновіші зверху", () => {
    const options = buildMonthOptions(4);
    expect(options).toEqual(["2026-08", "2026-07", "2026-06", "2026-05"]);
  });

  it("коректно переходить через межу року", () => {
    vi.setSystemTime(new Date("2026-01-10T09:00:00Z"));
    expect(buildMonthOptions(3)).toEqual(["2026-01", "2025-12", "2025-11"]);
  });

  it("за замовчуванням дає два роки історії", () => {
    expect(buildMonthOptions()).toHaveLength(LINKABLE_MONTHS_BACK);
  });
});

describe("useLinkableTransactions", () => {
  it("дефолтний діапазон — 90 днів, а не поточний місяць", async () => {
    renderHook(
      () =>
        useLinkableTransactions({
          month: "",
          enabled: true,
          now: KYIV.getTime(),
        }),
      { wrapper },
    );
    await waitFor(() => expect(fetchAllMonoTransactions).toHaveBeenCalled());
    const params = fetchAllMonoTransactions.mock.calls[0]?.[0] as Range;
    const spanDays =
      (new Date(params.to).getTime() - new Date(params.from).getTime()) /
      86_400_000;
    expect(Math.round(spanDays)).toBe(90);
  });

  it("вибір місяця запитує саме той місяць", async () => {
    renderHook(
      () => useLinkableTransactions({ month: "2026-05", enabled: true }),
      { wrapper },
    );
    await waitFor(() => expect(fetchAllMonoTransactions).toHaveBeenCalled());
    const params = fetchAllMonoTransactions.mock.calls[0]?.[0] as Range;
    expect(params.from).toContain("2026-05-01");
    expect(params.to).toContain("2026-06-01");
  });

  it("зливає базу з підвантаженим діапазоном без дублікатів", async () => {
    const base = [
      { id: "a", amount: -100, time: 2 },
      { id: "b", amount: -200, time: 1 },
    ];
    const { result } = renderHook(
      () =>
        useLinkableTransactions({
          month: "",
          enabled: true,
          base: base as never,
        }),
      { wrapper },
    );
    await waitFor(() => expect(fetchAllMonoTransactions).toHaveBeenCalled());
    expect(result.current.transactions.map((t) => t.id)).toEqual(["a", "b"]);
  });
});
