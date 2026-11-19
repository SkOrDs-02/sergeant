/** @vitest-environment jsdom */
/**
 * С-3 (а), рішення власника 2026-11-18 (OD-30): «звіту за минулий тиждень
 * немає» означає «немає ніде». Серверна копія звіту лежить у памʼяті коуча
 * (`GET /api/coach/memory`, запис із `weekKey`), і автогенерація спершу
 * читає її, а знайдений звіт кладе в сховище пристрою тим самим шляхом,
 * що й генерація.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { getMemoryMock } = vi.hoisted(() => ({ getMemoryMock: vi.fn() }));

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    coachApi: { ...actual.coachApi, getMemory: getMemoryMock },
  };
});

import {
  SERVER_DIGEST_READ_TIMEOUT_MS,
  adoptServerDigest,
  readServerDigest,
  serverDigestFromMemory,
} from "./digestServerCopy";
import {
  loadDigest,
  useDigestHistory,
  useWeeklyDigest,
} from "./useWeeklyDigest";

const WEEK = "2026-11-09";

const block = (summary: string) => ({
  summary,
  comment: `${summary}: коментар`,
  recommendations: [`${summary}: порада`],
});

const entry = {
  weekKey: WEEK,
  weekRange: "9–15 лист.",
  generatedAt: "2026-11-16T09:00:03.000Z",
  finyk: block("Витрати 12 920 ₴"),
  fizruk: null,
  nutrition: null,
  routine: block("Звички 80 %"),
  overallRecommendations: ["Запиши одне тренування"],
  correlations: ["сон ↔ витрати"],
};

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  localStorage.clear();
  getMemoryMock.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("serverDigestFromMemory", () => {
  it("відновлює повний звіт тижня без втрат (без службових кореляцій)", () => {
    const digest = serverDigestFromMemory(
      { weeklyDigests: [{ ...entry, weekKey: "2026-11-02" }, entry] },
      WEEK,
    );
    expect(digest).toEqual({
      weekKey: WEEK,
      weekRange: "9–15 лист.",
      generatedAt: entry.generatedAt,
      finyk: entry.finyk,
      fizruk: null,
      nutrition: null,
      routine: entry.routine,
      overallRecommendations: entry.overallRecommendations,
    });
  });

  it("немає запису за тиждень або памʼяті взагалі → null", () => {
    expect(serverDigestFromMemory(null, WEEK)).toBeNull();
    expect(serverDigestFromMemory({ weeklyDigests: [] }, WEEK)).toBeNull();
    expect(
      serverDigestFromMemory(
        { weeklyDigests: [{ ...entry, weekKey: "2026-11-02" }] },
        WEEK,
      ),
    ).toBeNull();
  });

  it("запис, з якого картку чесно не відмалювати, вважається відсутнім", () => {
    // Блок модуля без `comment` / `recommendations` (форма звіту зламана).
    expect(
      serverDigestFromMemory(
        { weeklyDigests: [{ ...entry, finyk: { summary: "лише підсумок" } }] },
        WEEK,
      ),
    ).toBeNull();
    // Жодного модуля: картка показала б порожній стан замість звіту.
    expect(
      serverDigestFromMemory(
        {
          weeklyDigests: [
            { ...entry, finyk: null, routine: null, fizruk: null },
          ],
        },
        WEEK,
      ),
    ).toBeNull();
  });
});

describe("readServerDigest", () => {
  it("читає памʼять коуча й повертає звіт тижня", async () => {
    getMemoryMock.mockResolvedValue({
      ok: true,
      memory: { weeklyDigests: [entry] },
    });
    const digest = await readServerDigest(makeClient(), WEEK);
    expect(digest?.weekKey).toBe(WEEK);
    expect(getMemoryMock).toHaveBeenCalledTimes(1);
  });

  it("помилка читання кидається далі (вирішує викликач)", async () => {
    getMemoryMock.mockRejectedValue(new Error("503"));
    await expect(readServerDigest(makeClient(), WEEK)).rejects.toThrow();
  });

  it("завислий запит обривається таймаутом", async () => {
    vi.useFakeTimers();
    getMemoryMock.mockReturnValue(new Promise(() => {}));
    const pending = readServerDigest(makeClient(), WEEK);
    const assertion = expect(pending).rejects.toThrow(/timeout/);
    await vi.advanceTimersByTimeAsync(SERVER_DIGEST_READ_TIMEOUT_MS);
    await assertion;
  });
});

describe("adoptServerDigest → картка бачить серверний звіт", () => {
  it("кладе звіт у сховище тим самим шляхом, що генерація, і історія його показує", async () => {
    const client = makeClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const history = renderHook(() => useDigestHistory(), { wrapper });
    await waitFor(() => expect(history.result.current.data).toEqual([]));

    const digest = serverDigestFromMemory({ weeklyDigests: [entry] }, WEEK)!;
    adoptServerDigest(client, digest);

    expect(loadDigest(WEEK)).toEqual(digest);
    await waitFor(() =>
      expect(history.result.current.data?.map((h) => h.weekKey)).toEqual([
        WEEK,
      ]),
    );
    // Те, що читає `WeeklyDigestCard` для обраного тижня.
    const card = renderHook(() => useWeeklyDigest(WEEK), { wrapper });
    expect(card.result.current.digest).toEqual(digest);
  });
});
