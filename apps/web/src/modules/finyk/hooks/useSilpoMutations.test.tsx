// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    silpoApi: {
      syncState: vi.fn(),
      sync: vi.fn(),
      disconnect: vi.fn(),
      wipe: vi.fn(),
      receipts: vi.fn(),
      receiptDetail: vi.fn(),
    },
  };
});

import { silpoApi } from "@shared/api";
import { silpoKeys, finykKeys } from "@shared/lib/api/queryKeys";
import {
  useSilpoSync,
  useSilpoDisconnect,
  useSilpoWipe,
} from "./useSilpoMutations";

const mockedSync = silpoApi.sync as unknown as ReturnType<typeof vi.fn>;
const mockedDisconnect = silpoApi.disconnect as unknown as ReturnType<
  typeof vi.fn
>;
const mockedWipe = silpoApi.wipe as unknown as ReturnType<typeof vi.fn>;

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("useSilpoMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("useSilpoSync invalidates sync-state and finyk keys on success", async () => {
    mockedSync.mockResolvedValue({
      status: "connected",
      offlinePulled: 1,
      onlinePulled: 0,
      receiptsInserted: 2,
      itemsInserted: 7,
      matched: 1,
      ambiguous: 0,
      unmatched: 1,
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useSilpoSync(), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedSync).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: silpoKeys.syncState,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: silpoKeys.all });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: finykKeys.mono });
  });

  it("useSilpoDisconnect removes the cached sync-state (mono-pattern)", async () => {
    mockedDisconnect.mockResolvedValue({ ok: true });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const removeSpy = vi.spyOn(client, "removeQueries");

    const { result } = renderHook(() => useSilpoDisconnect(), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedDisconnect).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith({ queryKey: silpoKeys.syncState });
  });

  it("useSilpoWipe invalidates every silpo-scoped cache entry", async () => {
    mockedWipe.mockResolvedValue({ ok: true, deletedReceipts: 3 });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useSilpoWipe(), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedWipe).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: silpoKeys.all });
    expect(result.current.data?.deletedReceipts).toBe(3);
  });
});
