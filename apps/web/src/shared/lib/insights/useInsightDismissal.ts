/**
 * Sergeant Design System — useInsightDismissal hook (PR-7a).
 *
 * @lifecycle experimental (introduced 2026-05; promoted to active after PR-8)
 * @see docs/design/design/redesign-v2/governance.md § AI surfaces
 *
 * Centralizes the localStorage-backed "already dismissed" tracking for
 * <InsightCard>. Listens to `storage` events so cross-tab dismissal
 * propagates immediately (user dismisses an insight on tab A; tab B's
 * card hides without reload).
 *
 * Storage namespace: `sergeant.v2.insights.dismissed`. Decoupled from
 * v1 storage keys so a future cleanup migration doesn't accidentally
 * re-show every insight.
 *
 * Dismissal lasts until the end of the CURRENT personal day (device-local,
 * ADR-0078; owner decision 2026-10-01), not forever. Value is a JSON object
 * `{ [insightId]: dismissedAtMs }`. The previous format — a bare array of
 * ids with no timestamp — is a legacy permanent entry and counts as
 * expired (see `dismissedToday.ts`).
 *
 * `safeReadStringLS` / `safeWriteLS` are reused so the hook degrades
 * gracefully when localStorage is unavailable (private browsing, quota
 * exhausted, SSR pre-hydration).
 */

import { useCallback, useEffect, useState } from "react";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import {
  dismissalsOfToday,
  isDismissedToday,
  type DismissalMap,
} from "./dismissedToday";
import type { InsightId } from "./types";

const DISMISSED_KEY = "sergeant.v2.insights.dismissed";

function parseDismissed(raw: string | null): DismissalMap {
  if (!raw) return {};
  try {
    return dismissalsOfToday(JSON.parse(raw));
  } catch {
    return {};
  }
}

export interface UseInsightDismissalResult {
  /** True iff `id` was dismissed in this browser TODAY (device-local day). */
  isDismissed: (id: InsightId) => boolean;
  /** Hide `id` until the end of today (persists immediately + notifies other tabs). */
  dismiss: (id: InsightId) => void;
  /** Un-hide the given ids (the hub's «показати» for today's dismissed cards). */
  restore: (ids: readonly InsightId[]) => void;
  /** Clear all dismissals — used by settings "Reset insights" action. */
  clear: () => void;
}

export function useInsightDismissal(): UseInsightDismissalResult {
  const [dismissed, setDismissed] = useState<DismissalMap>(() =>
    parseDismissed(safeReadStringLS(DISMISSED_KEY)),
  );

  // Cross-tab sync — when another tab writes to the storage key, mirror
  // its state here so a dismissed-in-tab-A insight disappears from tab-B
  // without a page reload. `storage` events do NOT fire in the same tab
  // that wrote them — only other tabs receive them, exactly the semantics
  // we want.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent) => {
      if (e.key !== DISMISSED_KEY) return;
      setDismissed(parseDismissed(e.newValue));
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // Звіряємо з ПОТОЧНОЮ добою на кожен виклик, а не лише на парсі: застосунок,
  // відкритий через північ, мусить повернути вчорашні відкидання без перезавантаження.
  const isDismissed = useCallback(
    (id: InsightId): boolean => isDismissedToday(dismissed[id]),
    [dismissed],
  );

  const dismiss = useCallback((id: InsightId) => {
    setDismissed((prev) => {
      if (isDismissedToday(prev[id])) return prev;
      // Заодно викидаємо прострочені id, щоб сховище не росло.
      const next = { ...dismissalsOfToday(prev), [id]: Date.now() };
      safeWriteLS(DISMISSED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const restore = useCallback((ids: readonly InsightId[]) => {
    setDismissed((prev) => {
      if (!ids.some((id) => id in prev)) return prev;
      const next = dismissalsOfToday(prev);
      for (const id of ids) delete next[id];
      safeWriteLS(DISMISSED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setDismissed({});
    safeWriteLS(DISMISSED_KEY, "{}");
  }, []);

  return { isDismissed, dismiss, restore, clear };
}
