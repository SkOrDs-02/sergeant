/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { STORAGE_KEYS } from "@sergeant/shared";
import { useFinykHubPreview } from "./useFinykHubPreview";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useFinykHubPreview", () => {
  it("reports hasMonoData=false when the tx cache is empty", async () => {
    const { result } = renderHook(() => useFinykHubPreview(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.hasMonoData).toBe(false);
  });

  it("reports hasMonoData=true when the cache holds transactions", async () => {
    localStorage.setItem(
      STORAGE_KEYS.FINYK_TX_CACHE,
      JSON.stringify({ txs: [{ id: "t1" }] }),
    );
    const { result } = renderHook(() => useFinykHubPreview(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.data?.hasMonoData).toBe(true));
  });

  it("reports false when txs is present but empty", async () => {
    localStorage.setItem(
      STORAGE_KEYS.FINYK_TX_CACHE,
      JSON.stringify({ txs: [] }),
    );
    const { result } = renderHook(() => useFinykHubPreview(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.hasMonoData).toBe(false);
  });

  it("re-derives the preview after a cross-tab storage event for the tx-cache key", async () => {
    const { result } = renderHook(() => useFinykHubPreview(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.data?.hasMonoData).toBe(false));

    localStorage.setItem(
      STORAGE_KEYS.FINYK_TX_CACHE,
      JSON.stringify({ txs: [{ id: "t1" }] }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", { key: STORAGE_KEYS.FINYK_TX_CACHE }),
    );

    await waitFor(() => expect(result.current.data?.hasMonoData).toBe(true));
  });

  it("ignores storage events for unrelated keys", async () => {
    const { result } = renderHook(() => useFinykHubPreview(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.data?.hasMonoData).toBe(false));

    localStorage.setItem(
      STORAGE_KEYS.FINYK_TX_CACHE,
      JSON.stringify({ txs: [{ id: "t1" }] }),
    );
    // An unrelated key must NOT trigger invalidation, so the stale cached
    // value (false) is retained.
    window.dispatchEvent(
      new StorageEvent("storage", { key: "some_other_key" }),
    );

    // Give any (unexpected) refetch a tick; value should stay false.
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.data?.hasMonoData).toBe(false);
  });
});
