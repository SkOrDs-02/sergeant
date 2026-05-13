import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MonoAccountDto, MonoTransactionDto } from "@sergeant/shared";

import { useAuth } from "../auth/AuthContext";
import { finykKeys } from "@shared/lib/api/queryKeys";
import {
  useActivationV2,
  type ActivationInput,
  type UseActivationV2Options,
} from "./useActivationV2";

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
 *   - `budgetsCreated` — TODO (see follow-up note below).
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
 * NOTE — budgets data source is not yet plumbed into React Query
 * (the `finyk/budgets` page reads from SQLite directly). Until that
 * lands, `budgetsCreated` stays at `0` and the predicate cannot flip
 * for real users. The wire-up infrastructure is in place so the
 * follow-up PR only needs to plumb the budgets count into this
 * adapter — the evaluator + capture pipeline already work end-to-end
 * for the other two conditions, and the unit test suite covers the
 * full happy path on mocked input.
 */
export function useActivationV2Boot(options: UseActivationV2Options = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [cacheTick, setCacheTick] = useState(0);

  // Subscribe to the React Query cache so we re-evaluate when the
  // source queries (`monoWebhookAccounts`, `monoWebhookTransactions`)
  // change. The QueryCache emits on every query state transition;
  // we coalesce all of them into a monotonic tick — the actual
  // snapshot read happens in the `useMemo` below.
  useEffect(() => {
    const cache = queryClient.getQueryCache();
    return cache.subscribe(() => {
      setCacheTick((t) => t + 1);
    });
  }, [queryClient]);

  const input = useMemo<ActivationInput | null>(() => {
    if (!user) return null;
    const signedUpAt = parseSignedUpAt(user.createdAt);
    if (signedUpAt === null) return null;

    const monoAccounts =
      queryClient.getQueryData<MonoAccountDto[]>(
        finykKeys.monoWebhookAccounts,
      ) ?? [];
    const monoAccountsConnected = monoAccounts.length;

    const categorizedTransactions = countCategorizedTransactions(queryClient);

    // TODO(2026-05-13): plumb budget count from `apps/web/src/modules/
    // finyk/pages/budgets/Budgets.tsx` (currently reads from SQLite
    // directly without a React Query mirror). Tracked in audit P1-2
    // follow-up. Activation cannot fire until this is wired.
    const budgetsCreated = 0;

    return {
      signedUpAt,
      evaluatedAt: Date.now(),
      monoAccountsConnected,
      categorizedTransactions,
      budgetsCreated,
    };
    // `cacheTick` is the dependency that forces a recompute on cache
    // changes — the actual values come from `queryClient.getQueryData`
    // inside the memo body. Listing it explicitly keeps the lint rule
    // honest about what triggers the re-evaluation.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional `cacheTick` trigger; see comment above
  }, [user, queryClient, cacheTick]);

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
    queryKey: ["finyk", "mono", "webhook-tx"] as const,
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
