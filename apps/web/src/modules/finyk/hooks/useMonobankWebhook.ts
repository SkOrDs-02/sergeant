import { useState, useMemo, useCallback, useEffect } from "react";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { logger } from "@shared/lib";
import {
  monoWebhookApi,
  isApiError,
  type MonoSyncState,
  type MonoAccountDto,
  type MonoTransactionDto,
} from "@shared/api";
import { messages } from "@shared/i18n/uk";
import { finykKeys, hubKeys } from "@shared/lib/api/queryKeys";
import { authAwareRetry } from "@shared/lib/api/queryClient";
import { normalizeTransaction } from "@sergeant/finyk-domain/domain/transactions";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { CURRENCY } from "../constants";
import {
  trackEvent,
  ANALYTICS_EVENTS,
} from "../../../core/observability/analytics";
import { fetchAllMonoTransactions } from "./monoTransactionsLoader";
import { apiQueryKeys } from "@sergeant/api-client/react";
import type { MeResponse } from "@sergeant/api-client";
import { getSqliteDb } from "../../../core/db/sqlite";
import { migrateFinyk } from "../lib/clientMigrate";
import {
  writeMonoTransactions,
  writeMonoAccounts,
  writeMonoAccountSnapshots,
} from "../lib/monoMirror";
import {
  getCachedFinykMonoMirrorState,
  refreshFinykMonoMirrorState,
} from "../lib/monoMirrorReader";
import {
  notifyFinykMonoMirrorRefresh,
  useFinykMonoMirrorTick,
} from "../lib/monoMirrorGate";

const SYNC_STATE_STALE = 30_000;
const ACCOUNTS_STALE = 5 * 60_000;
const TX_STALE = 60_000;

function webhookTxToNormalized(dto: MonoTransactionDto): Transaction {
  return normalizeTransaction(
    {
      id: dto.monoTxId,
      time: Math.floor(new Date(dto.time).getTime() / 1000),
      amount: dto.amount,
      description: dto.description ?? "",
      mcc: dto.mcc ?? 0,
      originalMcc: dto.originalMcc ?? undefined,
      hold: dto.hold ?? undefined,
      operationAmount: dto.operationAmount,
      currencyCode: dto.currencyCode,
      commissionRate: dto.commissionRate ?? undefined,
      cashbackAmount: dto.cashbackAmount ?? undefined,
      balance: dto.balance ?? undefined,
      comment: dto.comment ?? undefined,
      receiptId: dto.receiptId ?? undefined,
      invoiceId: dto.invoiceId ?? undefined,
      counterEdrpou: dto.counterEdrpou ?? undefined,
      counterIban: dto.counterIban ?? undefined,
      counterName: dto.counterName ?? undefined,
    },
    { source: "monobank", accountId: dto.monoAccountId },
  );
}

/**
 * Webhook-backed Monobank hook (Track C).
 *
 * Uses server-side DB endpoints instead of client-side Monobank API polling.
 * Returns the same shape as `useMonobank()` for drop-in compatibility.
 */
export function useMonobankWebhook({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  // PR #038 — read the authenticated user id straight from the React
  // Query cache instead of `useUser()` / `useAuth()`. The `me` cache is
  // hydrated by `AuthProvider` (web) / mobile app shell, so by the
  // time `useMonobankWebhook` renders inside FinykApp the entry is
  // there. Reading via `queryClient.getQueryData` keeps this hook
  // testable without forcing an `ApiClientProvider` / `AuthProvider`
  // wrapper into existing isolated unit tests.
  const meData =
    queryClient.getQueryData<MeResponse>(apiQueryKeys.me.current()) ?? null;
  const userId = meData?.user?.id ?? null;
  const mirrorTick = useFinykMonoMirrorTick();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState("");

  // === Sync state ===
  const syncStateQuery = useQuery<MonoSyncState>({
    queryKey: finykKeys.monoSyncState,
    queryFn: ({ signal }) => monoWebhookApi.syncState({ signal }),
    enabled,
    staleTime: SYNC_STATE_STALE,
    refetchOnWindowFocus: true,
    retry: authAwareRetry(1),
  });

  const syncStateData = syncStateQuery.data ?? null;
  const isConnected =
    syncStateData != null && syncStateData.status !== "disconnected";

  // === Accounts ===
  const accountsQuery = useQuery<MonoAccountDto[]>({
    queryKey: finykKeys.monoWebhookAccounts,
    queryFn: ({ signal }) => monoWebhookApi.accounts({ signal }),
    enabled: enabled && isConnected,
    staleTime: ACCOUNTS_STALE,
    refetchOnWindowFocus: false,
    retry: authAwareRetry(1),
  });

  const webhookAccounts = accountsQuery.data;
  const accounts = useMemo(
    () =>
      (webhookAccounts ?? [])
        .filter((a) => a.currencyCode === CURRENCY.UAH)
        .map((a) => ({
          id: a.monoAccountId,
          sendId: a.sendId ?? undefined,
          currencyCode: a.currencyCode,
          cashbackType: a.cashbackType ?? undefined,
          balance: a.balance ?? undefined,
          creditLimit: a.creditLimit ?? undefined,
          maskedPan: a.maskedPan,
          type: a.type ?? undefined,
          iban: a.iban ?? undefined,
        })),
    [webhookAccounts],
  );

  // ClientInfo-like object for UI compatibility
  const clientInfo = useMemo(() => {
    if (!isConnected || accounts.length === 0) return null;
    return {
      accounts,
      name: undefined as string | undefined,
    };
  }, [isConnected, accounts]);

  // === Current-month transactions ===
  // Use Kyiv date parts so month boundaries are correct for users outside EET.
  const { year: kyivYear, month: kyivMonth } = getKyivDateParts();
  const fromDate = new Date(
    `${kyivYear}-${String(kyivMonth).padStart(2, "0")}-01T00:00:00+03:00`,
  ).toISOString();
  const nextMonth = kyivMonth === 12 ? 1 : kyivMonth + 1;
  const nextYear = kyivMonth === 12 ? kyivYear + 1 : kyivYear;
  const toDate = new Date(
    `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+03:00`,
  ).toISOString();
  const txQueryKey = `${fromDate}|${toDate}`;

  const txQuery = useQuery<MonoTransactionDto[]>({
    queryKey: finykKeys.monoWebhookTransactions(txQueryKey),
    queryFn: ({ signal }) =>
      fetchAllMonoTransactions({ from: fromDate, to: toDate }, { signal }),
    enabled: enabled && isConnected,
    staleTime: TX_STALE,
    refetchOnWindowFocus: true,
    retry: authAwareRetry(2),
  });

  const transactions: Transaction[] = useMemo(() => {
    if (!txQuery.data) return [];
    return txQuery.data
      .map(webhookTxToNormalized)
      .sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  }, [txQuery.data]);

  const loadingTx = txQuery.isLoading && isConnected;

  // Invalidate Hub finyk preview and notify same-tab consumers when
  // new transactions arrive. All production readers now use the SQLite
  // mirror (Dual-write teardown Phase 3) — no LS shim needed.
  useEffect(() => {
    if (transactions.length === 0) return;
    queryClient.invalidateQueries({ queryKey: hubKeys.preview("finyk") });
    emitHubBus("storageUpdated", undefined);
  }, [transactions, queryClient]);

  // PR #038 — Mono cache mirror.
  //
  // Best-effort write into the SQLite mirror tables on every successful
  // Mono fetch. Runs alongside the LS shim above so the mirror stays
  // a strict superset of LS during the experiment. Failures are
  // swallowed — the LS write above remains the source-of-truth until
  // the read overlay flag is flipped on per-user.
  useEffect(() => {
    if (!userId || transactions.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const handle = await getSqliteDb();
        const client = handle.migrationClient();
        await migrateFinyk(client);
        if (cancelled) return;
        await writeMonoTransactions(client, userId, transactions);
        if (cancelled) return;
        await refreshFinykMonoMirrorState(client, userId);
        if (!cancelled) notifyFinykMonoMirrorRefresh();
      } catch (err) {
        logger.warn(
          "[finyk.monoMirror] write transactions failed",
          err instanceof Error ? err.message : err,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [transactions, userId]);

  useEffect(() => {
    if (!userId || accounts.length === 0) return;
    let cancelled = false;
    // eslint-disable-next-line no-restricted-syntax -- UTC wall-clock account-snapshot instant, not a Kyiv day boundary
    const snapshotAt = new Date().toISOString();
    void (async () => {
      try {
        const handle = await getSqliteDb();
        const client = handle.migrationClient();
        await migrateFinyk(client);
        if (cancelled) return;
        await writeMonoAccounts(client, userId, accounts);
        if (cancelled) return;
        await writeMonoAccountSnapshots(client, userId, accounts, snapshotAt);
        if (cancelled) return;
        await refreshFinykMonoMirrorState(client, userId);
        if (!cancelled) notifyFinykMonoMirrorRefresh();
      } catch (err) {
        logger.warn(
          "[finyk.monoMirror] write accounts failed",
          err instanceof Error ? err.message : err,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accounts, userId]);

  // Read overlay — when the network slice is empty (cold start, fetch
  // pending) and the flag is on, return the mirrored transactions so
  // the UI can paint cached data immediately. Live data wins as soon
  // as the first successful fetch lands.
  const overlayTransactions: Transaction[] = useMemo(() => {
    if (transactions.length > 0) return transactions;
    // `mirrorTick` is intentionally listed even though `useMemo`
    // doesn't reference it directly — bumping the tick is the signal
    // that `getCachedFinykMonoMirrorState()` returns a different
    // value than on the previous render. Without it the memo would
    // never re-evaluate after the first cold-start refresh.
    void mirrorTick;
    const cached = getCachedFinykMonoMirrorState();
    return cached.transactions.length > 0 ? cached.transactions : transactions;
  }, [transactions, mirrorTick]);

  // Narrow the memo inputs to the exact scalar fields it reads. Depending on
  // the optional-chained properties directly (rather than the whole
  // `syncStateData` object) keeps the inferred dependency identical to the
  // declared one, so the manual memoization survives React Compiler.
  const lastEventAt = syncStateData?.lastEventAt;
  const txDataUpdatedAt = txQuery.dataUpdatedAt;
  const lastUpdated: Date | null = useMemo(() => {
    if (lastEventAt) {
      return new Date(lastEventAt);
    }
    if (txDataUpdatedAt) return new Date(txDataUpdatedAt);
    return null;
  }, [lastEventAt, txDataUpdatedAt]);

  // === Sync state (UI-compatible shape) ===
  const syncState = useMemo(() => {
    if (!syncStateData) {
      return {
        status: "idle" as const,
        source: "none" as const,
        lastSuccess: null,
        lastError: "",
        accountsTotal: 0,
        accountsOk: 0,
      };
    }

    const statusMap: Record<
      string,
      "idle" | "loading" | "success" | "partial" | "error"
    > = {
      active: "success",
      pending: "loading",
      invalid: "error",
      disconnected: "idle",
    };

    return {
      status: statusMap[syncStateData.status] ?? "idle",
      source: (transactions.length > 0 ? "network" : "none") as
        "none" | "network" | "cache",
      lastSuccess: lastUpdated,
      lastError:
        syncStateData.status === "invalid"
          ? "Webhook connection is invalid. Please reconnect."
          : "",
      accountsTotal: syncStateData.accountsCount,
      accountsOk:
        syncStateData.status === "active" ? syncStateData.accountsCount : 0,
    };
  }, [syncStateData, transactions.length, lastUpdated]);

  // === Historical months ===
  const [historyTx, setHistoryTx] = useState<Transaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchMonth = useCallback(
    async (year: number, month: number): Promise<Transaction[]> => {
      // Surface "not connected" as a rejected promise so callers can
      // distinguish a missing-data state from a genuinely empty month.
      // Resolving to `[]` here would let consumers cache an empty array
      // for a month that simply hasn't been fetched yet.
      if (!isConnected) throw new Error("monobank not connected");
      setLoadingHistory(true);
      try {
        // Kyiv-anchored month boundaries (consistent with the current-month
        // logic above) so historical drill-down isn't off-by-hours for users
        // outside EET. `month` is 0-based; shift to 1-based for the ISO string.
        const m1 = month + 1;
        const from = new Date(
          `${year}-${String(m1).padStart(2, "0")}-01T00:00:00+03:00`,
        ).toISOString();
        const toYear = m1 === 12 ? year + 1 : year;
        const toMonth = m1 === 12 ? 1 : m1 + 1;
        const to = new Date(
          `${toYear}-${String(toMonth).padStart(2, "0")}-01T00:00:00+03:00`,
        ).toISOString();
        const key = `${from}|${to}`;

        const data = await queryClient.fetchQuery({
          queryKey: finykKeys.monoWebhookTransactions(key),
          queryFn: ({ signal }) =>
            fetchAllMonoTransactions({ from, to }, { signal }),
          staleTime: TX_STALE,
          retry: authAwareRetry(2),
        });

        const normalized = (data ?? [])
          .map(webhookTxToNormalized)
          .sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
        setHistoryTx(normalized);
        return normalized;
      } finally {
        setLoadingHistory(false);
      }
    },
    [isConnected, queryClient],
  );

  // === Connect ===
  const connect = useCallback(
    async (token: string, _forceRefresh?: boolean, _remember?: boolean) => {
      const clean = (token ?? "").trim();
      if (!clean) {
        setError("Введи токен");
        return;
      }
      setConnecting(true);
      setError("");
      setAuthError("");

      trackEvent(ANALYTICS_EVENTS.BANK_CONNECT_STARTED, {
        bank: "monobank",
        mode: "webhook",
      });

      try {
        const result = await monoWebhookApi.connect(clean, {
          signal: AbortSignal.timeout(30_000),
        });

        await queryClient.invalidateQueries({
          queryKey: finykKeys.monoSyncState,
        });
        await queryClient.invalidateQueries({
          queryKey: finykKeys.monoWebhookAccounts,
        });
        queryClient.invalidateQueries({
          queryKey: hubKeys.preview("finyk"),
        });

        trackEvent(ANALYTICS_EVENTS.BANK_CONNECT_SUCCESS, {
          bank: "monobank",
          mode: "webhook",
          accountsCount: result.accountsCount,
        });
      } catch (e) {
        // PR-32 (UX-roast 2026-Q2 / C7): differentiate Mono token-rejection
        // (HTTP 401 — server explicitly rejected this token) from any other
        // failure mode (offline, timeout, 403/5xx, DNS, etc.). The first
        // case is a copy-paste / expiry mistake the user can fix locally;
        // the second is connectivity that no token edit will repair.
        if (isApiError(e) && e.kind === "http" && e.status === 401) {
          setAuthError(messages.finyk.monoConnectErrors.tokenRejected);
        } else {
          setError(messages.finyk.monoConnectErrors.networkUnavailable);
        }
      } finally {
        setConnecting(false);
      }
    },
    [queryClient],
  );

  // === Refresh ===
  const refresh = useCallback(async () => {
    setError("");
    await queryClient.invalidateQueries({ queryKey: finykKeys.mono });
    await queryClient.invalidateQueries({
      queryKey: finykKeys.monoSyncState,
    });
  }, [queryClient]);

  // === Backfill ===
  const backfill = useCallback(async () => {
    try {
      await monoWebhookApi.backfill();
      // Refresh sync-state and progress simultaneously: the latter goes
      // from `idle`/`completed` to `running` server-side as soon as the
      // POST returns, so kicking the cache here lets the progress pill
      // animate in within the next render rather than after the next 30 s
      // sync-state refetch.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: finykKeys.monoSyncState,
        }),
        queryClient.invalidateQueries({
          queryKey: finykKeys.monoBackfillProgress,
        }),
      ]);
    } catch (e) {
      const msg =
        e instanceof Error && e.message ? e.message : "Помилка backfill";
      setError(msg);
    }
  }, [queryClient]);

  // === Disconnect ===
  const disconnect = useCallback(async () => {
    try {
      await monoWebhookApi.disconnect();
    } catch {
      // best-effort
    }
    queryClient.removeQueries({ queryKey: finykKeys.mono });
    queryClient.removeQueries({ queryKey: finykKeys.monoSyncState });
    queryClient.removeQueries({ queryKey: finykKeys.monoWebhookAccounts });
    queryClient.invalidateQueries({ queryKey: hubKeys.preview("finyk") });
    setError("");
    setAuthError("");
  }, [queryClient]);

  const clearTxCache = useCallback(() => {
    queryClient.removeQueries({
      queryKey: finykKeys.monoWebhookTransactions(),
    });
    queryClient.invalidateQueries({ queryKey: hubKeys.preview("finyk") });
    setError("");
  }, [queryClient]);

  return {
    // Same shape as legacy useMonobank
    token: "",
    clientInfo,
    accounts,
    transactions: overlayTransactions,
    realTx: overlayTransactions,
    connecting,
    loadingTx,
    error,
    lastUpdated,
    syncState,
    authError,
    setAuthError,
    connect,
    refresh,
    fetchMonth,
    historyTx,
    loadingHistory,
    clearTxCache,
    disconnect,
    // Webhook-specific
    webhookSyncState: syncStateData,
    backfill,
  };
}
