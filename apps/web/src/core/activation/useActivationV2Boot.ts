import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MonoAccountDto, MonoTransactionDto } from "@sergeant/shared";

import { useAuth } from "../auth/AuthContext";
import { finykKeys } from "@shared/lib/api/queryKeys";
import {
  useActivationV2,
  type ActivationInput,
  type UseActivationV2Options,
} from "./useActivationV2";
import { safeReadLS, webKVStore } from "@shared/lib/storage/storage";
import { getCachedFinykSqliteState } from "../../modules/finyk/lib/sqliteReader";

/**
 * Wire-up adapter for `useActivationV2` (audit
 * `docs/audits/2026-05-13-revenue-monetization-roast.md` § P1-2).
 *
 * Collects the activation snapshot from the data the app already has
 * on hand:
 *
 *   - `signedUpAt` — from the authenticated user's `createdAt`
 *     (Better Auth ISO-8601 string, hydrated by `AuthProvider` via
 *     `/api/v1/me`).
 *   - `monoAccountsConnected` — count of webhook-backed Mono accounts
 *     in the React Query cache (`finykKeys.monoWebhookAccounts`).
 *   - `categorizedTransactions` — count of cached Mono webhook
 *     transactions with a non-null `categorySlug`.
 *   - `budgetsCreated` — count from the Finyk SQLite warm cache, falling
 *     back to the `finyk_budgets` KV slot before SQLite refresh.
 *
 * The Boot subscribes to the React Query cache so the snapshot is
 * recomputed whenever any of the source queries change. The
 * underlying `useActivationV2` hook holds fire-once idempotency
 * through a localStorage flag, so re-evaluating on every cache tick
 * is safe.
 *
 * Returns `null` until the authenticated user is known — we cannot
 * compute `hoursElapsed` without `signedUpAt`, and there is no
 * activation funnel to capture for an anonymous visitor.
 *
 * Budgets are not mirrored into React Query today, so this adapter listens
 * to the KV slot and reads the SQLite warm cache directly. That keeps the
 * activation predicate able to flip without waiting for a new budgets query.
 */
export function useActivationV2Boot(options: UseActivationV2Options = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [cacheTick, setCacheTick] = useState(0);
  const [evaluatedAt, setEvaluatedAt] = useState(() => Date.now());
  const tickTimerRef = useRef<number | null>(null);

  const scheduleCacheTick = useCallback((): void => {
    if (tickTimerRef.current !== null) return;
    tickTimerRef.current = window.setTimeout(() => {
      tickTimerRef.current = null;
      setEvaluatedAt(Date.now());
      setCacheTick((t) => t + 1);
    }, 0);
  }, []);

  useEffect(() => {
    return () => {
      if (tickTimerRef.current !== null) {
        window.clearTimeout(tickTimerRef.current);
        tickTimerRef.current = null;
      }
    };
  }, []);

  // Subscribe to the React Query cache so we re-evaluate when the
  // source queries (`monoWebhookAccounts`, `monoWebhookTransactions`)
  // change. The QueryCache emits on every query *and observer* transition;
  // we coalesce the data-affecting ones into a monotonic tick — the actual
  // snapshot read happens in the `useMemo` below.
  //
  // CRITICAL: filter to events that can actually change the activation
  // snapshot — `added` / `removed` (a source query appeared/disappeared)
  // and `updated` (its data/state changed). The cache ALSO emits
  // `observerOptionsUpdated` every time any `useQuery` re-renders with a
  // fresh options object — and bumping `cacheTick` on that event creates a
  // self-sustaining render loop: cacheTick → RootLayout re-render → every
  // `useQuery` re-runs `observer.setOptions()` → `observerOptionsUpdated`
  // → cacheTick → … (~2000 renders/sec). That loop emits continuous
  // DefaultLane updates that perpetually preempt React Router 7's
  // navigation transition, so a clicked module route never commits (URL
  // changes, view stays on Hub). Observer-only events (`observerAdded`,
  // `observerRemoved`, `observerResultsUpdated`, `observerOptionsUpdated`)
  // never change the activation inputs, so they are ignored here.
  useEffect(() => {
    const cache = queryClient.getQueryCache();
    return cache.subscribe((event) => {
      if (
        event.type === "added" ||
        event.type === "removed" ||
        event.type === "updated"
      ) {
        scheduleCacheTick();
      }
    });
  }, [queryClient, scheduleCacheTick]);

  useEffect(() => {
    return webKVStore.onChange("finyk_budgets", () => {
      scheduleCacheTick();
    });
  }, [scheduleCacheTick]);

  const input = useMemo<ActivationInput | null>(() => {
    void cacheTick; // external cache invalidation tick
    if (!user) return null;
    const signedUpAt = parseSignedUpAt(user.createdAt);
    if (signedUpAt === null) return null;

    const monoAccounts =
      queryClient.getQueryData<MonoAccountDto[]>(
        finykKeys.monoWebhookAccounts,
      ) ?? [];
    const monoAccountsConnected = monoAccounts.length;

    const categorizedTransactions = countCategorizedTransactions(queryClient);

    const budgetsCreated = countBudgetsCreated();

    return {
      signedUpAt,
      evaluatedAt,
      monoAccountsConnected,
      categorizedTransactions,
      budgetsCreated,
    };
  }, [user, queryClient, cacheTick, evaluatedAt]);

  return useActivationV2(input, options);
}

function parseSignedUpAt(createdAt: string | null | undefined): number | null {
  if (!createdAt) return null;
  const ts = new Date(createdAt).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function countCategorizedTransactions(
  queryClient: ReturnType<typeof useQueryClient>,
): number {
  // `monoWebhookTransactions(...)` keys are parameterised by date
  // range, so we sum across every cached bucket. Duplicate
  // transactions (same id observed in overlapping windows) are
  // deduped through a Set on `id`.
  const cache = queryClient.getQueryCache();
  const seen = new Set<string>();
  let count = 0;
  // The `findAll({ queryKey })` matcher is a prefix match in
  // TanStack Query; we walk every cache entry whose key starts with
  // `["finyk", "mono", "webhook-tx"]` (the live webhook txn
  // buckets — date-bounded keys collapse under this prefix).
  for (const query of cache.findAll({
    queryKey: finykKeys.monoWebhookTransactionsPrefix,
  })) {
    const data = query.state.data as MonoTransactionDto[] | undefined;
    if (!Array.isArray(data)) continue;
    for (const tx of data) {
      if (!tx || typeof tx !== "object") continue;
      const id = tx.monoTxId;
      if (typeof id !== "string") continue;
      if (seen.has(id)) continue;
      seen.add(id);
      if (tx.categorySlug !== null && tx.categorySlug !== undefined) {
        count += 1;
      }
    }
  }
  return count;
}

function countBudgetsCreated(): number {
  const sqliteCache = getCachedFinykSqliteState();
  if (sqliteCache.refreshedAt !== null) {
    return sqliteCache.budgets.length;
  }
  // The registered `STORAGE_KEYS.FINYK_BUDGETS` constant is banned here by
  // `no-restricted-syntax` (retired cloud-sync key, PR #039), and the finyk
  // SQLite wrapper isn't reachable from this core boot hook — so the raw
  // literal is the accepted fallback (burn-down 2026-Q3).
  // eslint-disable-next-line sergeant-design/no-raw-storage-key -- see comment above
  const localBudgets = safeReadLS<unknown[]>("finyk_budgets", []);
  return Array.isArray(localBudgets) ? localBudgets.length : 0;
}
