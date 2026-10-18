// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import { apiQueryKeys } from "@sergeant/api-client/react";
import { http, HttpResponse } from "msw";
import { STORAGE_KEYS } from "@sergeant/shared";
import { server } from "../../../test/msw/server";
import { HubSpendHero } from "../../../core/hub/HubSpendHero";
import { useHubStorageBump } from "../../../core/hub/useHubStorageBump";
import { LOCAL_ANON_USER_ID } from "../../../core/auth/localIdentity";
import {
  createTestSqlite,
  type TestSqliteHandle,
} from "../lib/sqliteWriter/__tests__/testSqlite";
import { writeMonoTransactions } from "../lib/monoMirror";
import {
  clearFinykMonoMirrorCache,
  getCachedFinykMonoMirrorState,
} from "../lib/monoMirrorReader";
import { clearFinykSqliteCache } from "../lib/sqliteReader";
import { __resetFinykMonoMirrorBootForTests } from "../lib/monoMirrorBoot";
import { __resetFinykSqliteReadBootForTests } from "../lib/sqliteReadBoot";
import { __resetFinykDualWriteBootForTests } from "../lib/dualWriteBoot";
import { webhookTxToNormalized } from "./monoTxNormalize";
import type { MonoTransactionDto } from "@shared/api";
import FinykBootCluster from "./FinykBootCluster";
import { useMonobankWebhook } from "./useMonobankWebhook";
import { finykKeys } from "@shared/lib/api/queryKeys";
import { kyivMonthRangeIso } from "../lib/monthWindow";

const runtime = vi.hoisted(() => ({
  userId: "hub-user" as string | null,
  db: null as TestSqliteHandle | null,
}));
vi.mock("../../../core/auth/useLocalUserId", () => ({
  useLocalUserId: () => runtime.userId,
}));
vi.mock("../../../core/db/sqlite", () => ({
  getSqliteDb: async () => ({ migrationClient: () => runtime.db!.client }),
}));

const NOW = new Date("2026-10-15T12:00:00Z");
let client: QueryClient;
let requests: number;
let jarRequests: number;
let bankRows: MonoTransactionDto[];
function bankTx(id: string, amount: number): MonoTransactionDto {
  return {
    userId: "hub-user",
    originalMcc: null,
    categoryOverridden: false,
    source: "webhook",
    receivedAt: NOW.toISOString(),
    monoTxId: id,
    monoAccountId: "card",
    time: NOW.toISOString(),
    amount,
    description: "Крамниця",
    mcc: 5411,
    categorySlug: "food",
    operationAmount: amount,
    currencyCode: 980,
    commissionRate: null,
    cashbackAmount: null,
    balance: null,
    hold: null,
    comment: null,
    receiptId: null,
    invoiceId: null,
    counterEdrpou: null,
    counterIban: null,
    counterName: null,
  };
}
function Hub() {
  const bump = useHubStorageBump();
  return <HubSpendHero storageBump={bump} />;
}
function ScreenObserver() {
  const { transactions, clearTxCache } = useMonobankWebhook({
    writeMirror: false,
  });
  return (
    <>
      <output data-testid="bank-rows">{transactions.length}</output>
      <button onClick={() => void clearTxCache()}>
        Reload bank operations
      </button>
    </>
  );
}
function mountHub(withScreen = false) {
  return render(
    <QueryClientProvider client={client}>
      <FinykBootCluster />
      <Hub />
      {withScreen && <ScreenObserver />}
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  clearFinykMonoMirrorCache();
  clearFinykSqliteCache();
  __resetFinykMonoMirrorBootForTests();
  __resetFinykSqliteReadBootForTests();
  __resetFinykDualWriteBootForTests();
  runtime.userId = "hub-user";
  runtime.db = await createTestSqlite();
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0, gcTime: Infinity },
    },
  });
  client.setQueryData(apiQueryKeys.me.current(), {
    user: { id: runtime.userId },
  });
  requests = 0;
  jarRequests = 0;
  bankRows = [bankTx("cached", -10_000), bankTx("new", -40_000)];
  await writeMonoTransactions(runtime.db.client, runtime.userId, [
    webhookTxToNormalized(bankRows[0]!),
  ]);
  localStorage.setItem(
    STORAGE_KEYS.FINYK_QUICK_STATS,
    JSON.stringify({ todaySpent: 100, todayPoints: [] }),
  );
  server.use(
    http.get("*/api/v1/mono/sync-state", () =>
      HttpResponse.json({
        status: "active",
        webhookActive: true,
        lastEventAt: null,
        lastBackfillAt: null,
        accountsCount: 1,
      }),
    ),
    http.get("*/api/v1/mono/accounts", () => HttpResponse.json([])),
    http.get("*/api/v1/mono/jars", () => {
      jarRequests++;
      return HttpResponse.json([]);
    }),
    http.get("*/api/v1/mono/transactions", () => {
      requests++;
      return HttpResponse.json({ data: bankRows, nextCursor: null });
    }),
  );
});
afterEach(async () => {
  cleanup();
  await client.cancelQueries();
  client.clear();
  runtime.db?.close();
  runtime.db = null;
  focusManager.setFocused(undefined);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Hub bank freshness without mounting FinykApp", () => {
  it("replaces the persisted old total with server transactions on the Hub alone", async () => {
    mountHub();
    expect(screen.getByTestId("hub-spend-hero")).toHaveTextContent("100");
    await waitFor(() =>
      expect(screen.getByTestId("hub-spend-hero")).toHaveTextContent("500"),
    );
    expect(requests).toBe(1);
    expect(jarRequests).toBe(0);
    expect(getCachedFinykMonoMirrorState().transactions).toHaveLength(2);
    expect(
      screen.queryByRole("navigation", { name: "Розділи Фініка" }),
    ).not.toBeInTheDocument();
  });
  it("refreshes after returning to the tab even when the previous query is still fresh", async () => {
    mountHub();
    await waitFor(() =>
      expect(screen.getByTestId("hub-spend-hero")).toHaveTextContent("500"),
    );
    bankRows = [...bankRows, bankTx("after-focus", -20_000)];
    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));
    await waitFor(() =>
      expect(screen.getByTestId("hub-spend-hero")).toHaveTextContent("700"),
    );
    expect(requests).toBe(2);
  });
  it("revalidates a persisted query on startup even when its staleTime has not elapsed", async () => {
    const { from, to } = kyivMonthRangeIso(2026, 10);
    client.setQueryData(finykKeys.monoWebhookTransactions(`${from}|${to}`), [
      bankRows[0],
    ]);
    mountHub();
    await waitFor(() =>
      expect(screen.getByTestId("hub-spend-hero")).toHaveTextContent("500"),
    );
    expect(requests).toBe(1);
  });
  it("shares the bank request and leaves mirror persistence to the app boot", async () => {
    const writes = vi.spyOn(runtime.db!.client, "run");
    mountHub(true);
    await waitFor(() =>
      expect(screen.getByTestId("hub-spend-hero")).toHaveTextContent("500"),
    );
    expect(screen.getByTestId("bank-rows")).toHaveTextContent("2");
    expect(requests).toBe(1);
    expect(
      writes.mock.calls.filter(([sql]) =>
        sql.includes("INSERT INTO finyk_mono_transactions"),
      ),
    ).toHaveLength(2);
  });
  it("reloads active operations into the canonical mirror without deleting saved bank history or manual records", async () => {
    const manualJson = JSON.stringify({
      id: "manual-preserved",
      amount: 42,
      description: "Manual expense",
    });
    await runtime.db!.client.run(
      "INSERT INTO finyk_manual_expenses (id, user_id, data_json) VALUES (?, ?, ?)",
      ["manual-preserved", runtime.userId, manualJson],
    );
    mountHub(true);
    await waitFor(() =>
      expect(getCachedFinykMonoMirrorState().transactions).toHaveLength(2),
    );
    expect(requests).toBe(1);
    bankRows = [bankTx("after-recovery", -1_000)];
    fireEvent.click(
      screen.getByRole("button", { name: "Reload bank operations" }),
    );
    await waitFor(() =>
      expect(
        getCachedFinykMonoMirrorState().transactions.map((tx) => tx.id),
      ).toContain("after-recovery"),
    );
    expect(requests).toBe(2);
    expect(
      getCachedFinykMonoMirrorState().transactions.map((tx) => tx.id),
    ).toEqual(expect.arrayContaining(["cached", "new"]));
    expect(
      await runtime.db!.client.all(
        "SELECT data_json, deleted_at FROM finyk_manual_expenses WHERE id = ?",
        ["manual-preserved"],
      ),
    ).toEqual([{ data_json: manualJson, deleted_at: null }]);
  });

  it("keeps the last local total when the bank endpoint is unavailable", async () => {
    server.use(
      http.get("*/api/v1/mono/transactions", () => {
        requests++;
        return HttpResponse.json(
          { error: "temporarily unavailable" },
          { status: 503 },
        );
      }),
    );
    mountHub();
    await waitFor(() =>
      expect(
        client
          .getQueryCache()
          .findAll({ queryKey: finykKeys.monoWebhookTransactionsPrefix })[0]
          ?.state.status,
      ).toBe("error"),
    );
    expect(requests).toBeGreaterThan(0);
    expect(screen.getByTestId("hub-spend-hero")).toHaveTextContent("100");
    expect(getCachedFinykMonoMirrorState().transactions).toHaveLength(1);
  });
  it.each([null, LOCAL_ANON_USER_ID])(
    "does not request private bank endpoints for local identity %s",
    async (userId) => {
      runtime.userId = userId;
      client.removeQueries({ queryKey: apiQueryKeys.me.current() });
      await act(async () => {
        mountHub();
      });
      expect(requests).toBe(0);
    },
  );
});
