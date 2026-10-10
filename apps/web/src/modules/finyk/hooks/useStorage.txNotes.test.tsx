// @vitest-environment jsdom
// Нотатки до операцій переживають перезавантаження (аудит 2026-10-01, data-27):
// весь ланцюг `useStorage` -> `setTxNote` -> діф -> SQLite-писар -> outbox ->
// читач -> overlay нового монтування, на справжньому SQLite. LS при цьому
// нотаток НЕ пише: джерело правди - таблиця `finyk_tx_notes`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

vi.mock("../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
import { enqueueOutboxUpsert } from "../../../core/syncEngine/enqueueOutboxUpsert.js";

// Контекст дуалрайту реєструємо вручну (на реальному SQLite), бут-хуки глушимо.
vi.mock("./useFinykDualWriteBoot", () => ({
  useFinykDualWriteBoot: () => {},
}));
vi.mock("./useFinykSqliteReadBoot", () => ({
  useFinykSqliteReadBoot: () => {},
}));
vi.mock("./useFinykMonoMirrorBoot", () => ({
  useFinykMonoMirrorBoot: () => {},
}));

import {
  __clearFinykDualWriteContextForTests,
  registerFinykDualWriteContext,
} from "../lib/sqliteWriter/index.js";
import {
  clearFinykSqliteCache,
  getCachedFinykSqliteState,
  refreshFinykSqliteState,
} from "../lib/sqliteReader";
import {
  __resetFinykSqliteReadGateForTests,
  notifyFinykSqliteCacheRefresh,
} from "../lib/sqliteReadGate";
import {
  createTestSqlite,
  type TestSqliteHandle,
} from "../lib/sqliteWriter/__tests__/testSqlite.js";
import { useStorage } from "./useStorage";

const USER = "u-notes";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/finyk/transactions"]}>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

let handle: TestSqliteHandle;
let tick = 0;

beforeEach(async () => {
  localStorage.clear();
  handle = await createTestSqlite();
  __clearFinykDualWriteContextForTests();
  clearFinykSqliteCache();
  __resetFinykSqliteReadGateForTests();
  vi.mocked(enqueueOutboxUpsert).mockClear();
  tick = 0;
  registerFinykDualWriteContext({
    getUserId: () => USER,
    getMigrationClient: async () => handle.client,
    // Строго зростаючий годинник: кожен запис - новіший за попередній.
    getNow: () =>
      new Date(Date.UTC(2026, 9, 10, 10, 0, 0) + 1000 * ++tick).toISOString(),
  });
});

afterEach(() => {
  handle.close();
  __clearFinykDualWriteContextForTests();
  clearFinykSqliteCache();
  localStorage.clear();
});

const noteRows = () =>
  handle.client.all<{
    transaction_id: string;
    note: string;
    deleted_at: string | null;
  }>(`SELECT transaction_id, note, deleted_at FROM finyk_tx_notes`);

async function warmCache(): Promise<void> {
  await refreshFinykSqliteState(handle.client, USER);
  act(() => notifyFinykSqliteCacheRefresh());
}

describe("нотатки до операцій переживають reload", () => {
  it("setTxNote -> SQLite + outbox; новий mount після reload бачить нотатку; порожня = видалення", async () => {
    await warmCache();

    const first = renderHook(() => useStorage(), { wrapper });
    await waitFor(() => expect(first.result.current.storageReady).toBe(true));

    act(() => first.result.current.setTxNote("tx-1", "  кава з Олею  "));
    await waitFor(() =>
      expect(getCachedFinykSqliteState().txNotes).toEqual({
        "tx-1": "кава з Олею",
      }),
    );
    first.unmount();

    // У БД - рядок, у чергу синку - insert; LS нотаток не пишеться.
    expect(await noteRows()).toEqual([
      { transaction_id: "tx-1", note: "кава з Олею", deleted_at: null },
    ]);
    const noteCalls = vi
      .mocked(enqueueOutboxUpsert)
      .mock.calls.filter(([, input]) => input.table === "finyk_tx_notes");
    expect(noteCalls.map(([, input]) => [input.op, input.row])).toEqual([
      [
        "insert",
        { user_id: USER, transaction_id: "tx-1", note: "кава з Олею" },
      ],
    ]);
    expect(localStorage.getItem("finyk_tx_notes")).toBeNull();

    // «Перезавантаження»: кеш і гейт чисті, SQLite лишається.
    clearFinykSqliteCache();
    __resetFinykSqliteReadGateForTests();
    const second = renderHook(() => useStorage(), { wrapper });
    expect(second.result.current.txNotes).toEqual({});
    await refreshFinykSqliteState(handle.client, USER);
    act(() => notifyFinykSqliteCacheRefresh());
    await waitFor(() =>
      expect(second.result.current.txNotes).toEqual({ "tx-1": "кава з Олею" }),
    );

    // Порожня нотатка = soft-delete і tombstone-оп у черзі.
    act(() => second.result.current.setTxNote("tx-1", "   "));
    await waitFor(() =>
      expect(getCachedFinykSqliteState().txNotes).toEqual({}),
    );
    const rows = await noteRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deleted_at).not.toBeNull();
    const ops = vi
      .mocked(enqueueOutboxUpsert)
      .mock.calls.filter(([, input]) => input.table === "finyk_tx_notes")
      .map(([, input]) => input.op);
    expect(ops).toEqual(["insert", "delete"]);
    second.unmount();
  });
});
