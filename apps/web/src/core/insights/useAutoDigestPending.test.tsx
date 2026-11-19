/** @vitest-environment jsdom */
/**
 * С-3 (а), рішення власника 2026-11-18: поки автогенерація чи читання
 * серверної копії звіту за минулий тиждень у польоті, картка показує стан
 * очікування. Джерело — сам React Query (ключ мутації генерації і ключ
 * читання памʼяті коуча з фабрик), без другого прапорця.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError, coachApi, weeklyDigestApi } from "@shared/api";
import { coachKeys } from "@shared/lib/api/queryKeys";
import { useAutoDigestPending, useWeeklyDigest } from "./useWeeklyDigest";

const WEEK = "2026-11-09";
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-18T09:00:00"));
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const REPORT = {
  finyk: { summary: "s", comment: "c", recommendations: [] },
  fizruk: null,
  nutrition: null,
  routine: null,
  overallRecommendations: [],
};

function both() {
  return renderHook(
    () => ({
      pending: useAutoDigestPending(WEEK),
      digest: useWeeklyDigest(WEEK),
    }),
    { wrapper },
  );
}

describe("useAutoDigestPending", () => {
  it("генерація в польоті → true; успіх → false і звіт на місці", async () => {
    const gen = deferred<{ report: typeof REPORT; generatedAt: string }>();
    vi.spyOn(weeklyDigestApi, "generate").mockReturnValue(gen.promise as never);
    vi.spyOn(coachApi, "postMemory").mockResolvedValue({ ok: true });
    const { result } = both();
    expect(result.current.pending).toBe(false);

    let run!: Promise<unknown>;
    act(() => {
      run = result.current.digest.autoGenerate();
    });
    await waitFor(() => expect(result.current.pending).toBe(true));

    await act(async () => {
      gen.resolve({ report: REPORT, generatedAt: "2026-11-18T07:00:00Z" });
      await run;
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.digest.digest?.weekKey).toBe(WEEK);
  });

  it("«замало даних» → false, звіту немає", async () => {
    vi.spyOn(weeklyDigestApi, "generate").mockRejectedValue(
      new ApiError({
        kind: "http",
        message: "замало даних",
        status: 422,
        body: { code: "INSUFFICIENT_DATA" },
        url: "/api/weekly-digest",
      }),
    );
    const { result } = both();
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.digest.autoGenerate();
    });
    expect(outcome).toBe("insufficient");
    expect(result.current.pending).toBe(false);
    expect(result.current.digest.digest).toBeNull();
  });

  it("помилка мережі → false, звіту немає", async () => {
    vi.spyOn(weeklyDigestApi, "generate").mockRejectedValue(new Error("net"));
    const { result } = both();
    await act(async () => {
      await result.current.digest.autoGenerate();
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.digest.digest).toBeNull();
  });

  it("читання серверної копії (памʼять коуча) в польоті → true", async () => {
    const read = deferred<{ memory: null }>();
    const { result } = both();
    let fetching!: Promise<unknown>;
    act(() => {
      fetching = client.fetchQuery({
        queryKey: coachKeys.memory,
        queryFn: () => read.promise,
      });
    });
    await waitFor(() => expect(result.current.pending).toBe(true));
    await act(async () => {
      read.resolve({ memory: null });
      await fetching;
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
  });

  it("генерація ІНШОГО тижня стан не вмикає", async () => {
    const gen = deferred<never>();
    vi.spyOn(weeklyDigestApi, "generate").mockReturnValue(gen.promise);
    const { result } = renderHook(
      () => ({
        pending: useAutoDigestPending(WEEK),
        current: useWeeklyDigest("2026-11-16"),
      }),
      { wrapper },
    );
    act(() => {
      void result.current.current.autoGenerate();
    });
    await act(async () => {});
    expect(result.current.pending).toBe(false);
  });
});
