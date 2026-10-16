import { notifyFinykMonoMirrorRefresh } from "../../modules/finyk/lib/monoMirrorGate";
// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "../../modules/finyk/lib/monoMirrorReader";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "../../modules/finyk/lib/sqliteReader";
import { notifyFinykSqliteCacheRefresh } from "../../modules/finyk/lib/sqliteReadGate";
import { useFinykHubPreview } from "./useFinykHubPreview";

const transaction: Transaction = {
  id: "bank",
  accountId: "card",
  amount: -100,
  time: 1_792_065_600,
  description: "Крамниця",
  date: "2026-10-15",
  categoryId: "food",
  type: "expense",
  source: "mono",
  mcc: 5411,
  manual: false,
  _source: "mono",
  _accountId: "card",
  _manual: false,
};
let client: QueryClient;
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  localStorage.clear();
  clearFinykMonoMirrorCache();
  clearFinykSqliteCache();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
  clearFinykMonoMirrorCache();
  clearFinykSqliteCache();
});

it("notifies chat and Routine when the canonical mirror hydrates, without a legacy cache shard", async () => {
  const { result } = renderHook(useFinykHubPreview, { wrapper: Wrapper });
  await waitFor(() => expect(result.current.data?.hasMonoData).toBe(false));
  const firstUpdate = result.current.dataUpdatedAt;
  act(() => {
    __setFinykMonoMirrorCacheForTests({ transactions: [transaction] });
    notifyFinykMonoMirrorRefresh();
  });
  await waitFor(() => expect(result.current.data?.hasMonoData).toBe(true));
  expect(result.current.dataUpdatedAt).toBeGreaterThan(firstUpdate);
  act(() => {
    __setFinykSqliteStateCacheForTests({ hiddenAccounts: ["card"] });
    notifyFinykSqliteCacheRefresh();
  });
  await waitFor(() => expect(result.current.data?.hasMonoData).toBe(false));
});
