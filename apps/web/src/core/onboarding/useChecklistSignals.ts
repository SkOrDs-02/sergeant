/**
 * Last validated: 2026-09-11
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
 * the Hub already reads them. The one fact quick-stats cannot supply —
 * «чи взагалі є запис» — arrives through `webRealEntryProbe`, a registry
 * of counters the modules publish themselves, so it stays import-free too.
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
import { emitHubBus } from "@shared/lib/modules/hubBus";
import { finykKeys } from "@shared/lib/api/queryKeys";
import { useHubStorageBump } from "../hub/useHubStorageBump";
import { webRealEntryProbe } from "./realEntryProbe";

/** Matches `useModuleRouteLoader`'s prefetch so the two calls dedupe. */
const STALE_TIME_MS = 30_000;

/**
 * Web-only latch for Фінік's "Переглянути аналітику" checklist step
 * (F3 audit, 2026-09-11 — "дай чесний сигнал: факт відкриття екрана").
 *
 * `view_analytics` is pure navigation — unlike `add_expense`/`set_budget`,
 * there is no SQLite/quick-stats column proving "the user looked at their
 * spending chart" (`moduleChecklistSignals.ts` only reads facts that
 * already live in a KV/SQLite snapshot). The honest substitute the audit
 * settled on is the fact of a successful Hub-level navigation dispatch:
 * `HubHeroBlock` calls {@link markFinykAnalyticsViewed} right before
 * `openHubModuleWithAction("finyk", "view_analytics")` actually fires —
 * i.e. the flag can only be set alongside a real navigation dispatch
 * (module + action both valid), never a bare tap the Hub gate might have
 * dropped. It is written from ANY caller of that action (checklist,
 * search hit, quick action), not only the checklist row, so it stays an
 * honest "did this happen" fact rather than a checklist self-report.
 *
 * Not registered in `packages/shared/src/lib/storageKeys.ts` — that file
 * is outside this change's file boundary (Stage-4 F3 fix); follow-up:
 * promote to a `STORAGE_KEYS` entry once that file is in scope.
 */
const FINYK_ANALYTICS_VIEWED_KEY = "finyk_checklist_analytics_viewed_v1";

export function markFinykAnalyticsViewed(): void {
  webKVStore.setString(FINYK_ANALYTICS_VIEWED_KEY, "1");
  emitHubBus("storageUpdated", undefined);
}

/**
 * Читач тієї самої відмітки, що її ставить `markFinykAnalyticsViewed`.
 * Експортований симетрично до писаря: питання «чи людина вже відкривала
 * аналітику» — частина публічного контракту сигналу, а не деталь
 * реалізації. Дає змогу перевіряти НАСЛІДОК дії замість того, щоб
 * підміняти писаря моком і перевіряти власну підміну.
 */
export function hasViewedFinykAnalytics(): boolean {
  return webKVStore.getString(FINYK_ANALYTICS_VIEWED_KEY) === "1";
}

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
    // to whatever is already latched in storage rather than asserting a
    // false negative.
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
      ...deriveChecklistSignals(webKVStore, moduleId, webRealEntryProbe),
    };
    if (moduleId === "finyk") {
      if (monoConnected) {
        signals["connect_bank"] = true;
      }
      if (hasViewedFinykAnalytics()) {
        signals["view_analytics"] = true;
      }
    }
    return signals;
  }, [moduleId, monoConnected, bump]);
}
