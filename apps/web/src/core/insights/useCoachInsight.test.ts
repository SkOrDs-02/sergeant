// @vitest-environment jsdom
/**
 * Focused unit-тести для `useCoachInsight`.
 *
 * Стратегія:
 * - Мокаємо зовнішні залежності (coachApi, storage, finyk stats) щоб тести
 *   залишались fast і детермінованими.
 * - Перевіряємо три surface-и hook-а:
 *     1. Fetch path — `fetchCoachInsight` читає memory + будує snapshot + POST.
 *     2. Cache path — LS-кеш `hub_coach_insight_cache_v1` заповнюється після
 *        успішного fetch і повертається як initialData при свіжому ключі.
 *     3. Refresh path — `refresh()` інвалідує `coachKeys.all` і викликає refetch.
 * - Хук тестується через реальний QueryClient з `renderHook`; немає shallow
 *   render або snapshot-only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockGetMemory = vi.fn<() => Promise<unknown>>();
const mockPostInsight = vi.fn<() => Promise<unknown>>();

vi.mock("@shared/api", () => ({
  coachApi: {
    getMemory: (...args: unknown[]) => mockGetMemory(...(args as [])),
    postInsight: (...args: unknown[]) => mockPostInsight(...(args as [])),
  },
  isApiError: (err: unknown): boolean =>
    typeof err === "object" && err !== null && "kind" in err,
}));

const mockSafeReadLS = vi.fn<(key: string) => unknown>();
const mockSafeWriteLS = vi.fn<(key: string, value: unknown) => void>();

vi.mock("@shared/lib/storage/storage", () => ({
  safeReadLS: (...args: unknown[]) => mockSafeReadLS(...(args as [string])),
  safeWriteLS: (...args: unknown[]) =>
    mockSafeWriteLS(...(args as [string, unknown])),
  safeReadStringLS: vi.fn(() => null),
}));

vi.mock("@finyk/lib/lsStats", () => ({
  readFinykStatsContext: () => ({
    txs: [],
    excludedTxIds: new Set<string>(),
    txSplits: {},
    txCategories: {},
    customCategories: [],
  }),
}));

vi.mock("@sergeant/finyk-domain", () => ({
  calcFinykPeriodAggregate: () => ({
    totalSpent: 0,
    totalIncome: 0,
    txCount: 0,
    byCategory: {},
  }),
}));

vi.mock("@shared/lib/api/queryKeys", () => ({
  coachKeys: {
    all: ["coach"],
    insight: (key: string) => ["coach", "insight", key],
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // `retryDelay: 0` — хук задає власний `retry`-predicate, що перекриває
      // глобальний `retry: false`; без нуль-затримки RQ-backoff (~1с) лишає
      // query у `loading` довше за вікно `waitFor` і retry-тести флакають.
      queries: { retry: false, retryDelay: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("useCoachInsight", () => {
  let qc: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    qc = makeQueryClient();
    // Default: no cached insight in LS
    mockSafeReadLS.mockReturnValue(null);
  });

  afterEach(() => {
    qc.clear();
  });

  it("returns the fetched insight string on success", async () => {
    mockGetMemory.mockResolvedValue({ memory: "coach memory text" });
    mockPostInsight.mockResolvedValue({ insight: "Your weekly insight" });

    const { useCoachInsight } = await import("./useCoachInsight");

    const { result } = renderHook(() => useCoachInsight(), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.insight).toBe("Your weekly insight");
    expect(result.current.error).toBeNull();
  });

  it("returns null insight and surfaces error message on API failure", async () => {
    mockGetMemory.mockResolvedValue({ memory: null });
    mockPostInsight.mockRejectedValue(new Error("Network error"));

    const { useCoachInsight } = await import("./useCoachInsight");

    const { result } = renderHook(() => useCoachInsight(), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.insight).toBeNull();
    expect(result.current.error).toMatch(/Network error/);
  });

  it("returns initialData from LS cache when date matches today", async () => {
    // Встановлюємо today key детерміновано
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    mockSafeReadLS.mockImplementation((key: string) => {
      if (key === "hub_coach_insight_cache_v1") {
        return { date: todayKey, text: "Cached insight for today" };
      }
      return null;
    });

    // API should NOT be called when cache is fresh
    mockGetMemory.mockResolvedValue({ memory: null });
    mockPostInsight.mockResolvedValue({ insight: "Fresh insight" });

    const { useCoachInsight } = await import("./useCoachInsight");

    const { result } = renderHook(() => useCoachInsight(), {
      wrapper: makeWrapper(qc),
    });

    // With staleTime: Infinity and initialData, the query should not fire
    // Expect the cached value immediately
    await waitFor(() => {
      expect(result.current.insight).toBe("Cached insight for today");
    });
  });

  it("writes successful fetch result to LS cache", async () => {
    mockGetMemory.mockResolvedValue({ memory: null });
    mockPostInsight.mockResolvedValue({ insight: "New insight to cache" });

    const { useCoachInsight } = await import("./useCoachInsight");

    const { result } = renderHook(() => useCoachInsight(), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => {
      expect(result.current.insight).toBe("New insight to cache");
    });

    expect(mockSafeWriteLS).toHaveBeenCalledWith(
      "hub_coach_insight_cache_v1",
      expect.objectContaining({ text: "New insight to cache" }),
    );
  });

  it("refresh() calls refetch (API called at least once)", async () => {
    mockGetMemory.mockResolvedValue({ memory: null });
    mockPostInsight.mockResolvedValue({ insight: "Insight" });

    const { useCoachInsight } = await import("./useCoachInsight");

    const { result } = renderHook(() => useCoachInsight(), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.insight).toBe("Insight"));

    const callCountBefore = mockPostInsight.mock.calls.length;

    // `refresh()` invalidates coachKeys.all + calls refetch()
    await result.current.refresh();

    // Verify the API was called again (refetch triggered a new queryFn run)
    await waitFor(() =>
      expect(mockPostInsight.mock.calls.length).toBeGreaterThan(
        callCountBefore,
      ),
    );
  });

  it("memory fetch failure is non-fatal — insight still generated", async () => {
    mockGetMemory.mockRejectedValue(new Error("memory unavailable"));
    mockPostInsight.mockResolvedValue({ insight: "Insight without memory" });

    const { useCoachInsight } = await import("./useCoachInsight");

    const { result } = renderHook(() => useCoachInsight(), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.insight).toBe("Insight without memory");
    expect(result.current.error).toBeNull();
  });

  it("does NOT retry on 429 (rate-limit / quota) — single attempt", async () => {
    mockGetMemory.mockResolvedValue({ memory: null });
    const rateLimited = Object.assign(new Error("Too Many Requests"), {
      kind: "http",
      status: 429,
    });
    mockPostInsight.mockRejectedValue(rateLimited);

    const { useCoachInsight } = await import("./useCoachInsight");

    const { result } = renderHook(() => useCoachInsight(), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.insight).toBeNull();
    expect(mockPostInsight).toHaveBeenCalledTimes(1);
  });

  it("retries once on a transient network error", async () => {
    mockGetMemory.mockResolvedValue({ memory: null });
    const network = Object.assign(new Error("Failed to fetch"), {
      kind: "network",
    });
    mockPostInsight.mockRejectedValue(network);

    const { useCoachInsight } = await import("./useCoachInsight");

    const { result } = renderHook(() => useCoachInsight(), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.insight).toBeNull();
    expect(mockPostInsight).toHaveBeenCalledTimes(2);
  });
});
