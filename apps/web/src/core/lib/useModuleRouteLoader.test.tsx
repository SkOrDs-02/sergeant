// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";

const shouldPrefetch = vi.hoisted(() => vi.fn(() => true));
vi.mock("./connectionGate", () => ({
  shouldPrefetchOnConnection: shouldPrefetch,
}));

// Stub the api surface so prefetch queryFns never touch the network.
vi.mock("@shared/api", () => ({
  billingApi: { status: vi.fn(async () => ({ plan: "free" })) },
  pushApi: { getVapidPublic: vi.fn(async () => "vapid-key") },
  monoWebhookApi: { syncState: vi.fn(async () => ({ connected: false })) },
}));

import { useModuleRouteLoader } from "./useModuleRouteLoader";
import { billingKeys, pushKeys, finykKeys } from "@shared/lib/api/queryKeys";

let queryClient: QueryClient;
let prefetchSpy: ReturnType<typeof vi.spyOn>;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function prefetchedKeys(): unknown[][] {
  return prefetchSpy.mock.calls.map(
    (c: unknown[]) => (c[0] as { queryKey: unknown[] }).queryKey,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  shouldPrefetch.mockReturnValue(true);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Resolve to a no-op so fire-and-forget prefetches settle silently.
  prefetchSpy = vi
    .spyOn(queryClient, "prefetchQuery")
    .mockResolvedValue(undefined);
});
afterEach(() => {
  queryClient.clear();
});

describe("useModuleRouteLoader", () => {
  it("does nothing when there is no active module", () => {
    renderHook(() => useModuleRouteLoader(null), { wrapper });
    expect(prefetchSpy).not.toHaveBeenCalled();
  });

  it("skips all prefetches on a slow / save-data connection", () => {
    shouldPrefetch.mockReturnValue(false);
    renderHook(() => useModuleRouteLoader("fizruk"), { wrapper });
    expect(prefetchSpy).not.toHaveBeenCalled();
  });

  it("warms billing + vapid for a generic module (no finyk extras)", () => {
    renderHook(() => useModuleRouteLoader("fizruk"), { wrapper });
    const keys = prefetchedKeys();
    expect(keys).toContainEqual(billingKeys.status);
    expect(keys).toContainEqual(pushKeys.vapid);
    expect(keys).not.toContainEqual(finykKeys.monoSyncState);
    expect(prefetchSpy).toHaveBeenCalledTimes(2);
  });

  it("additionally warms mono sync-state for the finyk module", () => {
    renderHook(() => useModuleRouteLoader("finyk"), { wrapper });
    const keys = prefetchedKeys();
    expect(keys).toContainEqual(billingKeys.status);
    expect(keys).toContainEqual(pushKeys.vapid);
    expect(keys).toContainEqual(finykKeys.monoSyncState);
    expect(prefetchSpy).toHaveBeenCalledTimes(3);
  });

  it("re-runs the loader when the active module changes", () => {
    const { rerender } = renderHook(
      ({ mod }: { mod: "finyk" | "fizruk" }) => useModuleRouteLoader(mod),
      { wrapper, initialProps: { mod: "fizruk" } },
    );
    expect(prefetchSpy).toHaveBeenCalledTimes(2);
    rerender({ mod: "finyk" });
    expect(prefetchSpy).toHaveBeenCalledTimes(5); // 2 + 3
  });

  it("disables retry on the vapid prefetch (503-tolerant warm-up)", () => {
    renderHook(() => useModuleRouteLoader("nutrition"), { wrapper });
    const vapidKeyStr = JSON.stringify(pushKeys.vapid);
    const vapidCall = prefetchSpy.mock.calls.find(
      (c: unknown[]) =>
        JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey) ===
        vapidKeyStr,
    );
    expect(vapidCall).toBeDefined();
    expect((vapidCall![0] as { retry: unknown }).retry).toBe(false);
  });
});
