// @vitest-environment jsdom
/**
 * Межа тижня для ГРОШЕЙ у знімку коуча — київська (рішення власника
 * 2026-10-01, `METRICS_VERSION` 17; ADR-0078). Раніше знімок різав «цей
 * тиждень» за понеділком пристрою (`deviceMondayStart`) і брав усе від нього,
 * тож поза Києвом сума в промпті коуча розходилась із дайджестом і «Тижнем у
 * цифрах». Звички, їжа й тренування лишаються на тижні телефона — їх цей файл
 * не чіпає (їхні кеші холодні, тож у знімку вони `null`).
 *
 * Знімок читаємо з `coachApi.postInsight`, як і `useCoachInsight.snapshot.test`
 * (чорна скринька). На відміну від нього, `@sergeant/finyk-domain` тут
 * справжній — перевіряється саме вікно, а не мок агрегатора; мокаються лише
 * мережа й вхід Фініка (cap vi.mock — `scripts/ci/check-vi-mock-cap.mjs`).
 *
 * Пояс пристрою перемикається прямо в тесті (Node перечитує `process.env.TZ` на
 * льоту), годинник — лише `Date` (`toFake`), щоб не чіпати таймери react-query.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

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

const sec = (iso: string): number => Math.floor(Date.parse(iso) / 1000);

// Тиждень пн 14.09 – нд 20.09.2026; «зараз» — середа 16.09 12:00Z. Київські
// межі тижня — [13.09 21:00Z, 20.09 21:00Z). Усе нижче — до «зараз».
const TXS = [
  // Нд 13.09 23:30 Київ — минулий тиждень; у Токіо (пн 00:00 JST =
  // 13.09 15:00Z) стара межа брала її в цей.
  { id: "sun-before", amount: -10_000, time: sec("2026-09-13T20:30:00Z") },
  // Пн 14.09 00:30 Київ — цей тиждень; у Нью-Йорку (пн 00:00 EDT = 14.09
  // 04:00Z) стара межа її губила.
  { id: "mon-early", amount: -20_000, time: sec("2026-09-13T21:30:00Z") },
  { id: "wed", amount: -160_000, time: sec("2026-09-16T09:00:00Z") },
];

vi.mock("@finyk/lib/lsStats", () => ({
  readFinykStatsContext: () => ({
    txs: TXS,
    excludedTxIds: new Set<string>(),
    txSplits: {},
    txCategories: {},
    customCategories: [],
  }),
}));

const ORIGINAL_TZ = process.env["TZ"];

/** Київ — еталон; решта — пристрої на різних боках від нього. */
const DEVICE_TZS = [
  "Europe/Kyiv",
  "UTC",
  "America/New_York", // позаду Києва на 7 год
  "Asia/Tokyo", // попереду на 6 год
] as const;

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe("useCoachInsight: гроші знімка — київський тиждень", () => {
  let qc: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    // Денний кеш поради (`hub_coach_insight_cache_v1`) інакше віддав би текст
    // першого прогону й `postInsight` не викликався б удруге.
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-16T12:00:00Z"));
    qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, retryDelay: 0, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    mockGetMemory.mockResolvedValue({ memory: null });
    mockPostInsight.mockResolvedValue({ insight: "ok" });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (ORIGINAL_TZ === undefined) delete process.env["TZ"];
    else process.env["TZ"] = ORIGINAL_TZ;
  });

  it.each(DEVICE_TZS)(
    "пристрій %s: витрати тижня = 200 + 1600 (нд 13.09 23:30 Київ — не тут, пн 00:30 — тут)",
    async (tz) => {
      process.env["TZ"] = tz;
      const { useCoachInsight } = await import("./useCoachInsight");
      const { result } = renderHook(() => useCoachInsight(), {
        wrapper: makeWrapper(qc),
      });

      await waitFor(() => expect(result.current.insight).toBe("ok"));

      const arg = mockPostInsight.mock.calls[0]![0] as {
        snapshot: {
          finyk: { totalSpent: number; txCount: number };
          dateContext: { dayOfWeekIso: number };
        };
      };
      expect(arg.snapshot.finyk.totalSpent).toBe(1800);
      expect(arg.snapshot.finyk.txCount).toBe(2);
      // День тижня в `dateContext` — як і раніше, за годинником пристрою
      // (середа в усіх чотирьох поясах), цим рішенням він не чіпався.
      expect(arg.snapshot.dateContext.dayOfWeekIso).toBe(3);
    },
  );
});
