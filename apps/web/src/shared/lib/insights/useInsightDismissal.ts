/**
 * Sergeant Design System — useInsightDismissal hook (PR-7a).
 *
 * @lifecycle experimental (introduced 2026-05; promoted to active after PR-8)
 * @see docs/design/redesign-v2.md § AI surfaces
 *
 * Centralizes the localStorage-backed "already dismissed" tracking for
 * <InsightCard>. Listens to `storage` events so cross-tab dismissal
 * propagates immediately (user dismisses an insight on tab A; tab B's
 * card hides without reload).
 *
 * Storage namespace: `sergeant.v2.insights.dismissed`. Decoupled from
 * v1 storage keys so a future cleanup migration doesn't accidentally
 * re-show every insight. Values are JSON arrays of stable insight ids.
 *
 * `safeReadStringLS` / `safeWriteLS` are reused so the hook degrades
 * gracefully when localStorage is unavailable (private browsing, quota
 * exhausted, SSR pre-hydration).
 */

import { useCallback, useEffect, useState } from "react";
import {
  safeReadStringLS,
  safeWriteLS,
} from "@shared/lib/storage/storage";
import type { InsightId } from "./types";

const DISMISSED_KEY = "sergeant.v2.insights.dismissed";

function parseDismissed(raw: string | null): Set<InsightId> {
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

export interface UseInsightDismissalResult {
  /** True iff `id` has been dismissed in this browser. */
  isDismissed: (id: InsightId) => boolean;
  /** Mark `id` as dismissed (persists immediately + notifies other tabs). */
  dismiss: (id: InsightId) => void;
  /** Clear all dismissals — used by settings "Reset insights" action. */
  clear: () => void;
}

export function useInsightDismissal(): UseInsightDismissalResult {
  const [dismissed, setDismissed] = useState<Set<InsightId>>(() =>
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

  const isDismissed = useCallback(
    (id: InsightId): boolean => dismissed.has(id),
    [dismissed],
  );

  const dismiss = useCallback((id: InsightId) => {
    setDismissed((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      safeWriteLS(DISMISSED_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setDismissed(new Set());
    safeWriteLS(DISMISSED_KEY, "[]");
  }, []);

  return { isDismissed, dismiss, clear };
}
