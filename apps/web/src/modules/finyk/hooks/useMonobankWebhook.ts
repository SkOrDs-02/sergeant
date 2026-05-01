import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  monoWebhookApi,
  isApiError,
  type MonoSyncState,
  type MonoAccountDto,
  type MonoTransactionDto,
} from "@shared/api";
import { finykKeys, hubKeys } from "@shared/lib/queryKeys";
import { authAwareRetry } from "@shared/lib/queryClient";
import { normalizeTransaction } from "@sergeant/finyk-domain/domain/transactions";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { CURRENCY } from "../constants";
import {
  trackEvent,
  ANALYTICS_EVENTS,
} from "../../../core/observability/analytics";
import { fetchAllMonoTransactions } from "./monoTransactionsLoader";
import { writeJSON, removeItem } from "../lib/finykStorage";

/**
 * Legacy localStorage keys still read by other surfaces (Hub previews,
 * Analytics, recommendations engine, daily/weekly digests, hubChat actions,
 * onboarding demo seed). The webhook hook keeps writing them as a
 * forward-compat shim so existing readers keep working without a coordinated
 * migration. Phase-out tracked under Monobank Roadmap follow-up — see
 * `docs/integrations/monobank-roadmap.md` (section A → B).
 */
const LEGACY_TX_CACHE_KEY = "finyk_tx_cache";
const LEGACY_TX_CACHE_LAST_GOOD_KEY = "finyk_tx_cache_last_good";
const LEGACY_INFO_CACHE_KEY = "finyk_info_cache";

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
  const now = new Date();
  const fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const toDate = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1,
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

  // Legacy-cache shim: mirror current-month transactions into
  // `finyk_tx_cache` (+ `_last_good`) so downstream readers (Hub, Analytics,
  // recommendations, coach, hubChat) keep working unchanged. Was previously
  // owned by `useMonobankLegacy()`. We invalidate the Hub finyk preview
  // here too — same place the legacy hook used to fan-out.
  useEffect(() => {
    if (transactions.length === 0) return;
    const payload = { txs: transactions, timestamp: Date.now() };
    if (writeJSON(LEGACY_TX_CACHE_KEY, payload)) {
      queryClient.invalidateQueries({ queryKey: hubKeys.preview("finyk") });
    }
    if (transactions.length >= 3) {
      writeJSON(LEGACY_TX_CACHE_LAST_GOOD_KEY, payload);
    }
  }, [transactions, queryClient]);

  // Legacy-cache shim: `finyk_info_cache` shape is `{ token, info }`. In
  // webhook-mode we have no client-side token (server holds it), so we leave
  // `token` empty — readers that conditionally branch on it will keep
  // working since they fall back to `rawCache?.info ?? rawCache`.
  useEffect(() => {
    if (!clientInfo) return;
    writeJSON(LEGACY_INFO_CACHE_KEY, { token: "", info: clientInfo });
  }, [clientInfo]);

  const lastUpdated: Date | null = useMemo(() => {
    if (syncStateData?.lastEventAt) {
      return new Date(syncStateData.lastEventAt);
    }
    if (txQuery.dataUpdatedAt) return new Date(txQuery.dataUpdatedAt);
    return null;
  }, [syncStateData?.lastEventAt, txQuery.dataUpdatedAt]);

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
        | "none"
        | "network"
        | "cache",
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
      if (!isConnected) return [];
      setLoadingHistory(true);
      try {
        const from = new Date(year, month, 1).toISOString();
        const to = new Date(year, month + 1, 1).toISOString();
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
      } catch {
        // Partial failure — keep existing historyTx
        return [];
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
        if (isApiError(e) && e.kind === "http" && e.isAuth) {
          setAuthError(
            e.serverMessage ||
              "Токен Monobank недійсний або закінчився. Оновіть токен.",
          );
        } else if (isApiError(e) && e.kind === "aborted") {
          setError("Monobank API не відповідає. Спробуйте пізніше.");
        } else {
          const msg =
            e instanceof Error && e.message ? e.message : "Помилка підключення";
          setError(msg);
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
      await queryClient.invalidateQueries({
        queryKey: finykKeys.monoSyncState,
      });
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
    removeItem(LEGACY_TX_CACHE_KEY);
    removeItem(LEGACY_TX_CACHE_LAST_GOOD_KEY);
    removeItem(LEGACY_INFO_CACHE_KEY);
    setError("");
    setAuthError("");
  }, [queryClient]);

  const clearTxCache = useCallback(() => {
    queryClient.removeQueries({
      queryKey: finykKeys.monoWebhookTransactions(),
    });
    removeItem(LEGACY_TX_CACHE_KEY);
    removeItem(LEGACY_TX_CACHE_LAST_GOOD_KEY);
    queryClient.invalidateQueries({ queryKey: hubKeys.preview("finyk") });
    setError("");
  }, [queryClient]);

  return {
    // Same shape as legacy useMonobank
    token: "",
    clientInfo,
    accounts,
    transactions,
    realTx: transactions,
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
