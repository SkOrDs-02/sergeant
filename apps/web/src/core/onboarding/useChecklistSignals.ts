/**
 * Last validated: 2026-08-07
 * Status: Active
 */
/**
 * Real-data evidence for the module onboarding checklist (web).
 *
 * Wraps the shared, KV-only `deriveChecklistSignals` and overlays the
 * one step whose truth lives on the server rather than in storage:
 * Finyk's "Підключити Monobank".
 *
 * AI-CONTEXT: the KV half is deliberately free of module-internal
 * imports. Reading budgets or workouts from the module SQLite readers
 * would be more precise, but those pull `drizzle-orm` onto the Hub's
 * eager chunk and the critical-path budget is 280 kB (AGENTS.md
 * § Performance budgets). Quick-stats snapshots carry the same facts and
 * the Hub already reads them.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  deriveChecklistSignals,
  type ChecklistSignals,
  type DashboardModuleId,
} from "@sergeant/shared";
import { monoWebhookApi, type MonoSyncState } from "@shared/api";
import { webKVStore } from "@shared/lib/storage/storage";
import { finykKeys } from "@shared/lib/api/queryKeys";
import { useHubStorageBump } from "../hub/useHubStorageBump";

/** Matches `useModuleRouteLoader`'s prefetch so the two calls dedupe. */
const STALE_TIME_MS = 30_000;

/**
 * Positive-only evidence per step id for `moduleId`.
 *
 * Recomputed whenever a module writes its quick-stats snapshot — those
 * writers emit `hubBus "storageUpdated"`, which `useHubStorageBump`
 * turns into a counter. Without the bump the signals would be frozen at
 * mount and a step completed in this same session would not tick.
 */
export function useChecklistSignals(
  moduleId: DashboardModuleId,
): ChecklistSignals {
  const bump = useHubStorageBump();

  // Server-side truth for "Підключити Monobank" — no local trace exists,
  // and the connection survives a reinstall, which is exactly the case
  // the tap-only checklist got wrong. Scoped to Finyk so the other three
  // modules never pay for the request.
  const monoQuery = useQuery<MonoSyncState>({
    queryKey: finykKeys.monoSyncState,
    queryFn: ({ signal }) => monoWebhookApi.syncState({ signal }),
    staleTime: STALE_TIME_MS,
    enabled: moduleId === "finyk",
    // A failed probe must not read as "not connected": it leaves the step
    // to its tap-recorded state rather than asserting a false negative.
    retry: false,
  });

  const monoConnected =
    monoQuery.data != null &&
    (monoQuery.data.status === "active" || monoQuery.data.accountsCount > 0);

  return useMemo(() => {
    // `bump` is the re-read trigger, not an input: the signals live in
    // storage, so the memo has to be invalidated whenever a module
    // rewrites its snapshot. Same idiom as the Hub's other storage
    // consumers (`useHubStorageBump`).
    void bump;
    const signals: Record<string, boolean | undefined> = {
      ...deriveChecklistSignals(webKVStore, moduleId),
    };
    if (moduleId === "finyk" && monoConnected) {
      signals["connect_bank"] = true;
    }
    return signals;
  }, [moduleId, monoConnected, bump]);
}
