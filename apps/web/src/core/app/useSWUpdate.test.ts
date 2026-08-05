// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import React from "react";

/**
 * E3 — useSWUpdate defer-while-busy regression tests.
 *
 * Verifies:
 *  1. When Hub is idle and no mutations are in-flight, the update-prompt
 *     fires immediately on `pwa-update-ready`.
 *  2. When Hub is streaming the prompt is deferred until streaming stops.
 *  3. When mutations are in-flight the prompt is deferred until they finish.
 *  4. Hard 10-minute timeout forces the prompt even if Hub is still busy (R5).
 *  5. Prompt does not fire twice even after multiple re-renders.
 */

// --- Mock streamingStore ------------------------------------------------
const mockIsHubStreaming = vi.fn(() => false);
vi.mock("../hub/streamingStore", () => ({
  isHubStreaming: () => mockIsHubStreaming(),
  setHubStreaming: vi.fn(),
}));

// --- Mock useToast -------------------------------------------------------
const mockToastInfo = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({
    info: mockToastInfo,
    success: mockToastSuccess,
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

// Import AFTER mocks are registered.
import { useSWUpdate } from "./useSWUpdate";

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function makeMutationCache(pendingCount = 0) {
  const mutations = Array.from({ length: pendingCount }, () => ({
    state: { status: "pending" as const },
  }));
  return {
    getAll: () => mutations,
  };
}

/**
 * `applyUpdate` спершу читає реєстрацію SW, тож між кліком і рішенням
 * «слати SKIP_WAITING чи перезавантажуватись» лежить кілька мікротасків.
 * Таймери в цьому suite фейкові, тому чекати можна лише на них.
 */
async function flushMicrotasks(ticks = 5): Promise<void> {
  for (let i = 0; i < ticks; i += 1) await Promise.resolve();
}

/**
 * Підміняє `navigator.serviceWorker` і `window.location.reload` на час одного
 * тесту. jsdom не має SW-реєстрації взагалі, а `location.reload` там —
 * неімплементована навігація, тож обидва треба стабити явно.
 */
function stubServiceWorker({ waiting }: { waiting: boolean }) {
  const reloadSpy = vi.fn();
  const originalLocation = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, reload: reloadSpy },
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: vi
        .fn()
        .mockResolvedValue({ waiting: waiting ? {} : null }),
    },
  });
  return {
    reloadSpy,
    restore() {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: undefined,
      });
    },
  };
}

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

// -------------------------------------------------------------------------
// Suite
// -------------------------------------------------------------------------

describe("useSWUpdate — defer-while-busy", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    mockIsHubStreaming.mockReturnValue(false);
    mockToastInfo.mockReset();
    mockToastSuccess.mockReset();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Default: no pending mutations.
    vi.spyOn(queryClient, "getMutationCache").mockReturnValue(
      makeMutationCache(0) as ReturnType<QueryClient["getMutationCache"]>,
    );

    // Reset window state.
    delete window.__pwaUpdateReady;
    delete window.__pwaUpdateSW;
  });

  afterEach(() => {
    vi.useRealTimers();
    queryClient.clear();
  });

  it("shows toast immediately when Hub is idle and no mutations", () => {
    renderHook(() => useSWUpdate(), {
      wrapper: makeWrapper(queryClient),
    });

    act(() => {
      window.dispatchEvent(new Event("pwa-update-ready"));
    });

    expect(mockToastInfo).toHaveBeenCalledOnce();
    expect(mockToastInfo).toHaveBeenCalledWith(
      "Доступна нова версія",
      15000,
      expect.objectContaining({ label: "Оновити" }),
    );
  });

  it("defers toast while Hub is streaming, shows after stream ends", () => {
    mockIsHubStreaming.mockReturnValue(true);

    renderHook(() => useSWUpdate(), {
      wrapper: makeWrapper(queryClient),
    });

    act(() => {
      window.dispatchEvent(new Event("pwa-update-ready"));
    });

    // Still streaming — toast must NOT have fired.
    expect(mockToastInfo).not.toHaveBeenCalled();

    // Hub goes idle.
    mockIsHubStreaming.mockReturnValue(false);

    // Advance the poll interval (1 s) so the poller fires.
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(mockToastInfo).toHaveBeenCalledOnce();
  });

  it("defers toast while mutations are in-flight, shows after they finish", () => {
    // Mutations running.
    vi.spyOn(queryClient, "getMutationCache").mockReturnValue(
      makeMutationCache(1) as ReturnType<QueryClient["getMutationCache"]>,
    );

    renderHook(() => useSWUpdate(), {
      wrapper: makeWrapper(queryClient),
    });

    act(() => {
      window.dispatchEvent(new Event("pwa-update-ready"));
    });

    expect(mockToastInfo).not.toHaveBeenCalled();

    // Mutations finish.
    vi.spyOn(queryClient, "getMutationCache").mockReturnValue(
      makeMutationCache(0) as ReturnType<QueryClient["getMutationCache"]>,
    );

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(mockToastInfo).toHaveBeenCalledOnce();
  });

  it("R5 — hard 10-min timeout forces prompt even while Hub stays busy", () => {
    mockIsHubStreaming.mockReturnValue(true);

    renderHook(() => useSWUpdate(), {
      wrapper: makeWrapper(queryClient),
    });

    act(() => {
      window.dispatchEvent(new Event("pwa-update-ready"));
    });

    expect(mockToastInfo).not.toHaveBeenCalled();

    // Hub stays streaming the entire time.
    // Advance just under 10 minutes → still deferred.
    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1_000 - 1);
    });
    expect(mockToastInfo).not.toHaveBeenCalled();

    // Cross the 10-minute boundary → force-shown.
    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(mockToastInfo).toHaveBeenCalledOnce();
  });

  it("does not show the toast twice after multiple re-renders", () => {
    const { rerender } = renderHook(() => useSWUpdate(), {
      wrapper: makeWrapper(queryClient),
    });

    act(() => {
      window.dispatchEvent(new Event("pwa-update-ready"));
    });

    expect(mockToastInfo).toHaveBeenCalledOnce();

    rerender();
    rerender();

    expect(mockToastInfo).toHaveBeenCalledTimes(1);
  });

  it("shows offline-ready toast on pwa-offline-ready", () => {
    renderHook(() => useSWUpdate(), {
      wrapper: makeWrapper(queryClient),
    });

    act(() => {
      window.dispatchEvent(new Event("pwa-offline-ready"));
    });

    expect(mockToastSuccess).toHaveBeenCalledWith(
      "Додаток готовий до роботи офлайн",
      4000,
    );
  });

  it("shows toast immediately when __pwaUpdateReady is already set at mount", () => {
    window.__pwaUpdateReady = true;

    renderHook(() => useSWUpdate(), {
      wrapper: makeWrapper(queryClient),
    });

    expect(mockToastInfo).toHaveBeenCalledOnce();
  });

  it("applyUpdate calls window.__pwaUpdateSW when available", async () => {
    const mockUpdateSW = vi.fn();
    window.__pwaUpdateSW = mockUpdateSW;
    const { reloadSpy, restore } = stubServiceWorker({ waiting: true });

    const { result } = renderHook(() => useSWUpdate(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.applyUpdate();
      await flushMicrotasks();
    });

    expect(mockUpdateSW).toHaveBeenCalledWith(true);
    // Waiting-воркер є — reload зробить сам `vite-plugin-pwa` на
    // `controlling`, тож дублювати його тут не можна.
    expect(reloadSpy).not.toHaveBeenCalled();

    restore();
    delete window.__pwaUpdateSW;
  });

  // Регресія: плашку піднімає не лише SW-шлях, а й build-id hard-floor
  // (`autoUpdate.ts`) — а він спрацьовує саме тоді, коли waiting-воркера
  // немає. `updateSW()` у цьому стані шле `SKIP_WAITING` в нікуди і reload не
  // відбувається, тож кнопка «Оновити» не робила рівно нічого.
  it("applyUpdate falls back to a reload when no waiting worker exists", async () => {
    const mockUpdateSW = vi.fn();
    window.__pwaUpdateSW = mockUpdateSW;
    const { reloadSpy, restore } = stubServiceWorker({ waiting: false });

    const { result } = renderHook(() => useSWUpdate(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.applyUpdate();
      await flushMicrotasks();
    });

    expect(mockUpdateSW).toHaveBeenCalledWith(true);
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    restore();
    delete window.__pwaUpdateSW;
  });

  it("applyUpdate reloads when the pwa register hook is missing entirely", () => {
    delete window.__pwaUpdateSW;
    const { reloadSpy, restore } = stubServiceWorker({ waiting: false });

    const { result } = renderHook(() => useSWUpdate(), {
      wrapper: makeWrapper(queryClient),
    });

    act(() => {
      result.current.applyUpdate();
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    restore();
  });
});
