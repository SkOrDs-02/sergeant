/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { finykKeys } from "@shared/lib/api/queryKeys";

const {
  useActivationV2Mock,
  authState,
  finykCacheState,
  onChangeMock,
  safeReadLSMock,
} = vi.hoisted(() => ({
  useActivationV2Mock: vi.fn(),
  authState: { user: null as { createdAt: string } | null },
  finykCacheState: {
    cache: { refreshedAt: null as string | null, budgets: [] as unknown[] },
  },
  onChangeMock: vi.fn(() => () => {}),
  safeReadLSMock: vi.fn((): unknown[] => []),
}));

vi.mock("../auth/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("./useActivationV2", () => ({ useActivationV2: useActivationV2Mock }));
vi.mock("@shared/lib/storage/storage", () => ({
  safeReadLS: safeReadLSMock,
  webKVStore: { onChange: onChangeMock },
}));
vi.mock("../../modules/finyk/lib/sqliteReader", () => ({
  getCachedFinykSqliteState: () => finykCacheState.cache,
}));

import { useActivationV2Boot } from "./useActivationV2Boot";

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function lastInput() {
  return useActivationV2Mock.mock.calls.at(-1)?.[0];
}

describe("useActivationV2Boot", () => {
  let qc: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = null;
    finykCacheState.cache = { refreshedAt: null, budgets: [] };
    safeReadLSMock.mockReturnValue([]);
    onChangeMock.mockReturnValue(() => {});
    qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it("yields a null snapshot when there is no authenticated user", () => {
    renderHook(() => useActivationV2Boot(), { wrapper: makeWrapper(qc) });
    expect(lastInput()).toBeNull();
  });

  it("yields a null snapshot when createdAt is unparseable", () => {
    authState.user = { createdAt: "not-a-date" };
    renderHook(() => useActivationV2Boot(), { wrapper: makeWrapper(qc) });
    expect(lastInput()).toBeNull();
  });

  it("builds the activation snapshot from cache data", () => {
    authState.user = { createdAt: "2026-06-23T00:00:00.000Z" };
    qc.setQueryData(finykKeys.monoWebhookAccounts, [
      { id: "a1" },
      { id: "a2" },
    ]);
    qc.setQueryData(
      [...finykKeys.monoWebhookTransactionsPrefix, "2026-01"],
      [
        { monoTxId: "t1", categorySlug: "food" },
        { monoTxId: "t2", categorySlug: null },
        { monoTxId: "t1", categorySlug: "food" }, // dup id — deduped
      ],
    );
    finykCacheState.cache = {
      refreshedAt: "2026-06-23T00:00:00.000Z",
      budgets: [{ id: "b1" }, { id: "b2" }, { id: "b3" }],
    };

    renderHook(() => useActivationV2Boot(), { wrapper: makeWrapper(qc) });
    const input = lastInput();
    expect(input).toMatchObject({
      monoAccountsConnected: 2,
      categorizedTransactions: 1,
      budgetsCreated: 3,
    });
    expect(typeof input.signedUpAt).toBe("number");
  });

  it("falls back to the finyk_budgets LS slot before SQLite refresh", () => {
    authState.user = { createdAt: "2026-06-23T00:00:00.000Z" };
    finykCacheState.cache = { refreshedAt: null, budgets: [] };
    safeReadLSMock.mockReturnValue([{ id: "b1" }, { id: "b2" }]);
    renderHook(() => useActivationV2Boot(), { wrapper: makeWrapper(qc) });
    expect(lastInput().budgetsCreated).toBe(2);
  });

  it("subscribes to the finyk_budgets KV slot", () => {
    authState.user = { createdAt: "2026-06-23T00:00:00.000Z" };
    renderHook(() => useActivationV2Boot(), { wrapper: makeWrapper(qc) });
    expect(onChangeMock).toHaveBeenCalledWith(
      "finyk_budgets",
      expect.any(Function),
    );
  });

  it("recomputes the snapshot when the query cache changes", async () => {
    authState.user = { createdAt: "2026-06-23T00:00:00.000Z" };
    renderHook(() => useActivationV2Boot(), { wrapper: makeWrapper(qc) });
    const before = useActivationV2Mock.mock.calls.length;
    qc.setQueryData(finykKeys.monoWebhookAccounts, [{ id: "a1" }]);
    await waitFor(() =>
      expect(useActivationV2Mock.mock.calls.length).toBeGreaterThan(before),
    );
  });
});
