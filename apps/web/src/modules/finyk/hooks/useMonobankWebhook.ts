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
  type MonoJarDto,
  type MonoTransactionDto,
} from "@shared/api";
import { messages } from "@shared/i18n/uk";
import { finykKeys, hubKeys } from "@shared/lib/api/queryKeys";
import { authAwareRetry } from "@shared/lib/api/queryClient";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { webhookTxToNormalized } from "./monoTxNormalize";
import { CURRENCY } from "../constants";
import {
  trackEvent,
  ANALYTICS_EVENTS,
} from "../../../core/observability/analytics";
import { fetchAllMonoTransactions } from "./monoTransactionsLoader";
import { kyivMonthRangeIso } from "../lib/monthWindow";
import { apiQueryKeys } from "@sergeant/api-client/react";
import type { MeResponse } from "@sergeant/api-client";
import { getSqliteDb } from "../../../core/db/sqlite";
import { migrateFinyk } from "../lib/clientMigrate";
import { MonoNotConnectedError } from "../lib/monoBankErrors";
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

  // === Jars ("банки") ===
  // Separate query from `accounts` (own endpoint/table, migration 088) —
  // goal-progress auto-sync (docs/90-work/planning/specs/goal-progress-auto.md)
  // reads a linked jar's balance to compute a goal's saved amount.
  const jarsQuery = useQuery<MonoJarDto[]>({
    queryKey: finykKeys.monoWebhookJars,
    queryFn: ({ signal }) => monoWebhookApi.jars({ signal }),
    enabled: enabled && isConnected,
    staleTime: ACCOUNTS_STALE,
    refetchOnWindowFocus: false,
    retry: authAwareRetry(1),
  });
  // Shape-guard — той самий інваріант, що й для `accounts` нижче: `?? []`
  // рятує лише від `null`/`undefined`, а truthy не-масив (`{ ok: true }` від
  // dev-проксі, застарілого SW-кешу чи тестового моку) доїжджав до
  // `(jars ?? []).map` в `useAssetsState` і валив увесь рендер сторінки
  // «Активи» у `SectionErrorBoundary` з `TypeError: ... .map is not a
  // function`. Ловилось як фейл `tests/mobile/deep-route-viewport.spec.ts`
  // на FINYK_ASSETS (браузерний аудит 2026-08-05).
  const jars = Array.isArray(jarsQuery.data) ? jarsQuery.data : [];

  const webhookAccounts = accountsQuery.data;
  const accounts = useMemo(
    () =>
      // Shape-guard: `webhookAccounts` is typed `MonoAccountDto[]` (the
      // contracted `/api/mono/accounts` response) but nothing here actually
      // enforces that at runtime — `?? []` only rescues `null`/`undefined`.
      // A misbehaving intermediary (dev proxy, stale SW cache, test mock)
      // that hands back a truthy non-array (e.g. `{ ok: true }`) used to
      // reach `.filter` directly and crash this whole render with
      // `TypeError: ... .filter is not a function`, tripping the
      // `SectionErrorBoundary` around the Assets page. Same defensive
      // pattern as `usePrivatbank.ts`'s `Array.isArray(data) ? data : []`.
      (Array.isArray(webhookAccounts) ? webhookAccounts : [])
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
  // Real Kyiv month bounds (not a hardcoded +03:00 offset), so month
  // boundaries are correct year-round for users outside EET (§1.8).
  const { year: kyivYear, month: kyivMonth } = getKyivDateParts();
  const { from: fromDate, to: toDate } = kyivMonthRangeIso(kyivYear, kyivMonth);
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
      if (!isConnected) throw new MonoNotConnectedError();
      setLoadingHistory(true);
      try {
        // Kyiv-anchored month boundaries (consistent with the current-month
        // logic above) so historical drill-down isn't off-by-hours for users
        // outside EET. `month` is 0-based; shift to 1-based for `kyivMonthRangeIso`.
        const { from, to } = kyivMonthRangeIso(year, month + 1);
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

        // Backfill the SQLite mirror with this historical slice, same as
        // the current-month effect above. Without this, `fetchMonth` only
        // ever populated the in-memory `historyTx` state consumed by the
        // Operations page — any other reader of the mirror (Hub Reports'
        // "previous period" card, weekly digest, coach insights) stayed
        // blind to every month except whichever one happened to be "current"
        // when the current-month effect last ran, silently under-reporting
        // past months (founder report: Звіти showed "Минулий: 10 ₴" for
        // липень while Операції correctly listed thousands in spend).
        if (userId && normalized.length > 0) {
          try {
            const handle = await getSqliteDb();
            const client = handle.migrationClient();
            await migrateFinyk(client);
            await writeMonoTransactions(client, userId, normalized);
            await refreshFinykMonoMirrorState(client, userId);
            notifyFinykMonoMirrorRefresh();
          } catch (err) {
            logger.warn(
              "[finyk.monoMirror] write historical transactions failed",
              err instanceof Error ? err.message : err,
            );
          }
        }

        return normalized;
      } finally {
        setLoadingHistory(false);
      }
    },
    [isConnected, queryClient, userId],
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
        await queryClient.invalidateQueries({
          queryKey: finykKeys.monoWebhookJars,
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
        //
        // Два РІЗНИХ 401 приходять на цей шлях: наш власний session-gate
        // (анонім не має сесії) і `MONO_TOKEN_INVALID` від Mono. Без
        // розрізнення анонім із бездоганним токеном читав «Mono відхилив
        // токен» і йшов перегенеровувати справний токен.
        if (isApiError(e) && e.kind === "http" && e.status === 401) {
          const code =
            e.body && typeof e.body === "object"
              ? (e.body as { code?: unknown }).code
              : undefined;
          setAuthError(
            code === "MONO_TOKEN_INVALID"
              ? messages.finyk.monoConnectErrors.tokenRejected
              : messages.finyk.monoConnectErrors.accountRequired,
          );
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
    queryClient.removeQueries({ queryKey: finykKeys.monoWebhookJars });
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
    jars,
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
