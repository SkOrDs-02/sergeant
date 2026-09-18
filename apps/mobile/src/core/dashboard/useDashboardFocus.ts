/**
 * Mobile port of the web `useDashboardFocus` hook.
 *
 * The web version imports `generateRecommendations()` from
 * `apps/web/src/core/lib/recommendationEngine.js`, which reads
 * ~10 distinct localStorage blobs to produce cross-module nudges
 * (finyk spending spikes, fizruk "long break", nutrition budget
 * shortfalls, etc). Mobile doesn't yet own those data sources —
 * finyk/fizruk/routine stores are ported one-by-one per the RN
 * migration plan — so this hook currently defers to an injected /
 * stubbed rec generator.
 *
 * The dismissal contract (`hub_recs_dismissed_v1`) is shared verbatim
 * with web via `@sergeant/shared/lib/dashboardFocus`, so once the
 * mobile recommendation generator does ship, per-user dismissals
 * continue to work without a migration.
 */
import { useCallback, useEffect, useState } from "react";

import {
  DASHBOARD_FOCUS_DISMISSED_KEY,
  addDismissal,
  selectDashboardFocus,
  type DismissedMap,
  type FocusSelection,
  type Rec,
} from "@sergeant/shared";

import { useLocalStorage } from "@/lib/storage";

/**
 * Placeholder recommendation generator. Returns an empty list until
 * the mobile port of each module's stats reader lands (see the
 * Phase-3 migration plan).
 *
 * Exported so tests and adjacent hooks can supply their own recs
 * without reaching into module-specific storage.
 */
export function generateRecommendations(): Rec[] {
  return [];
}

export interface UseDashboardFocusReturn extends FocusSelection<Rec> {
  dismiss: (id: string) => void;
}

export interface UseDashboardFocusOptions {
  /**
   * Rec producer. Callers can inject their own (e.g. tests or a
   * future mobile `recommendationEngine`). Defaults to the stubbed
   * generator above.
   */
  generate?: () => Rec[];
}

export function useDashboardFocus(
  options: UseDashboardFocusOptions = {},
): UseDashboardFocusReturn {
  const generate = options.generate ?? generateRecommendations;

  const [dismissed, setDismissed] = useLocalStorage<DismissedMap>(
    DASHBOARD_FOCUS_DISMISSED_KEY,
    {},
  );

  // Tick every 2 minutes so recommendations that embed fresh timing
  // (e.g. "5 днів без тренування") stay accurate while the user
  // keeps the app in the foreground — matches the web cadence.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const recs = generate();
  const { focus, rest } = selectDashboardFocus(recs, dismissed);

  const dismiss = useCallback(
    (id: string) => {
      setDismissed((prev) => addDismissal(prev, id, Date.now()));
    },
    [setDismissed],
  );

  return { focus, rest, dismiss };
}
