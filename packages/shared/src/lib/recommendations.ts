/**
 * DOM-free types + pure helpers for the dashboard recommendation
 * pipeline.
 *
 * Rule evaluation itself lives in `@sergeant/insights` (per-module
 * rules, priority, fired `Rec`s). This module carries the shape both
 * platforms agree on and a single place for the post-processing
 * (sort, filter by dismissal) used by `useDashboardFocus` on web and
 * mobile.
 *
 * We intentionally *do not* port the web `generateRecommendations()`
 * verbatim — its body reads ~10 `localStorage` keys directly and owns
 * lots of finyk/fizruk/nutrition heuristics. Mobile consumers either
 * inject a recommendation list computed locally or pass an empty
 * array until the relevant module's data is available (Phase 3+).
 */

import type { ModuleAccent, StatusColor } from "@sergeant/design-tokens";

/**
 * Imperative CTA action dispatched when the user taps the primary
 * button on a focus/rest rec. Mirrors `HubModuleAction` from
 * `@sergeant/insights/recommendations/types`.
 */
export type HubModuleAction =
  | "add_expense"
  | "start_workout"
  | "add_meal"
  | "add_meal_photo"
  | "add_habit";

/** Module namespaces that can surface a recommendation. */
export type RecModule = ModuleAccent | "hub";
export type RecSeverity = StatusColor;

/**
 * Structural Rec type matching `@sergeant/insights` so recs produced
 * by the existing rule registry satisfy this shape without an
 * explicit cast.
 */
export interface Rec {
  id: string;
  module: RecModule;
  priority: number;
  severity?: RecSeverity;
  icon: string;
  title: string;
  body: string;
  action: string;
  pwaAction?: HubModuleAction;
}

/**
 * Sort a recommendation list by descending priority. Returns a fresh
 * array; the input is never mutated. Stable order is preserved for
 * equal priorities (callers should pre-sort by some other key if
 * they care).
 */
export function sortRecsByPriority<T extends Pick<Rec, "priority">>(
  recs: readonly T[],
): T[] {
  return [...recs].sort((a, b) => b.priority - a.priority);
}
