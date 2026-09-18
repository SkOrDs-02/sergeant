/**
 * Last validated: 2026-05-19
 * Status: Active
 *
 * Top-level insight aggregator — collects Insight[] from all 4 modules,
 * filters by display surface, sorts by priority, and caps the result.
 *
 * Safe to call from ANY surface (Hub, module, widget). Each module
 * wrapper hook fetches its own data independently — no prop drilling,
 * no cross-module context required.
 *
 * ## Priority rank (highest → lowest)
 *
 * 1. `fizruk-pr-pending`              — actionable, time-sensitive (active workout)
 * 2. `nutrition-protein-low`          — actionable, time-sensitive (evening gate)
 * 3. `routine-todo-evening`           — actionable, time-sensitive (evening gate)
 * 4. `finyk-budget-overrun-*`         — actionable, fiscal urgency
 * 5. `routine-streak-record-pending`  — motivational, immediate opportunity
 * 6. `nutrition-streak-7-days-*`      — celebration, can wait
 * 7. `finyk-coffee-limit-*`           — informational, MoM trend
 * 8. `finyk-recurring-detected`       — informational, discovery
 * 9. `fizruk-rest-day-overdue`        — informational, low urgency
 *
 * Unknown insight ids fall below rank 9 (stable sort preserves
 * declaration order within the unknown bucket).
 */

import { useMemo } from "react";
import { useFinykInsights } from "@finyk/hooks/useFinykInsights";
import { useFizrukInsights } from "@fizruk/hooks/useFizrukInsights";
import { useRoutineInsights } from "@routine/hooks/useRoutineInsights";
import { useNutritionInsights } from "@nutrition/hooks/useNutritionInsights";
import type { Insight } from "./types";

/** Default cap for simultaneous insights rendered at the Hub. */
const DEFAULT_CAP = 3;

/**
 * Priority rank for known insight id prefixes (lower number = higher priority).
 * The map is keyed by the stable id prefix so parametric ids such as
 * `finyk-budget-overrun-food` and `finyk-coffee-limit-2026-05` both match.
 */
const PRIORITY_RANK: ReadonlyArray<[prefix: string, rank: number]> = [
  ["fizruk-pr-pending", 1],
  ["nutrition-protein-low", 2],
  ["routine-todo-evening", 3],
  ["finyk-budget-overrun-", 4],
  ["routine-streak-record-pending", 5],
  ["nutrition-streak-7-days-", 6],
  ["finyk-coffee-limit-", 7],
  ["finyk-recurring-detected", 8],
  ["fizruk-rest-day-overdue", 9],
];

function priorityOf(id: string): number {
  for (const [prefix, rank] of PRIORITY_RANK) {
    if (id === prefix || id.startsWith(prefix)) return rank;
  }
  return 99;
}

export interface UseAllInsightsOptions {
  /**
   * Which surface is requesting insights.
   * - `"hub"`    → only insights with `showOn === "hub" | "both"`
   * - `"module"` → only insights with `showOn === "module" | "both"`
   */
  surface: "hub" | "module";
  /**
   * Maximum number of insights to return. Defaults to 3.
   */
  cap?: number;
}

/**
 * Aggregates insights from all 4 modules, filters by surface, sorts by
 * priority, and caps the result. Use `surface: "hub"` in HubInsightsBlock.
 *
 * ⚠️ Must be called at the top level of a component — hook rules apply.
 * All four module hooks run unconditionally (Rules of Hooks).
 */
export function useAllInsights(opts: UseAllInsightsOptions): Insight[] {
  const { surface, cap = DEFAULT_CAP } = opts;

  const finyk = useFinykInsights();
  const fizruk = useFizrukInsights();
  const routine = useRoutineInsights();
  const nutrition = useNutritionInsights();

  return useMemo((): Insight[] => {
    const all = [...finyk, ...fizruk, ...routine, ...nutrition];

    const filtered = all.filter((i) =>
      surface === "hub" ? i.showOn !== "module" : i.showOn !== "hub",
    );

    // Stable sort by priority rank — equal-rank items retain declaration order.
    const sorted = [...filtered].sort(
      (a, b) => priorityOf(a.id) - priorityOf(b.id),
    );

    return sorted.slice(0, cap);
  }, [finyk, fizruk, routine, nutrition, surface, cap]);
}
