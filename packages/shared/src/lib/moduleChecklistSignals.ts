/**
 * Real-data evidence for module onboarding checklist steps.
 *
 * AI-CONTEXT: the checklist used to learn about progress from exactly
 * one source — the user tapping a row. Nothing in the product marked a
 * step done when the user actually added an expense, set a plan or
 * logged a meal, so `completedSteps` stayed empty forever and the card
 * could never satisfy its own auto-hide condition. This module supplies
 * the missing half: per-step evidence read from the data the user has
 * already produced.
 *
 * AI-DANGER: every signal here is **positive-only**. Some sources are
 * scoped to today or to the current week (`todayDone`, `todayCal`,
 * `weekWorkouts`), so a missing signal means "no proof", never "not
 * done". `resolveChecklistSteps` ORs these with the tap-recorded state
 * for exactly that reason — never invert it into an authoritative
 * `false`.
 *
 * Deliberately reads only KVStore slots that the Hub dashboard already
 * touches (quick-stats snapshots + the FTUX first-entry probes). The
 * module-internal SQLite readers would be more precise, but importing
 * them from the Hub would drag `drizzle-orm` onto the eager critical
 * path and blow the 280 kB budget (see AGENTS.md § Performance budgets).
 * The canonical counts still reach this module — as an injected
 * {@link ModuleEntryCountProbe}, which carries no import edge.
 */

import {
  moduleHasRealEntry,
  type ModuleEntryCountProbe,
} from "./firstRealEntry";
import type { ChecklistSignals } from "./moduleChecklist";
import { parseQuickStatsJson } from "./quickStats";
import { STORAGE_KEYS } from "./storageKeys";
import type { DashboardModuleId } from "./dashboard";
import type { KVStore } from "../storage/kv";

/** Quick-stats storage slot per module. */
const QUICK_STATS_KEYS: Record<DashboardModuleId, string> = {
  finyk: STORAGE_KEYS.FINYK_QUICK_STATS,
  fizruk: STORAGE_KEYS.FIZRUK_QUICK_STATS,
  routine: STORAGE_KEYS.ROUTINE_QUICK_STATS,
  nutrition: STORAGE_KEYS.NUTRITION_QUICK_STATS,
};

function readQuickStats(
  store: KVStore,
  moduleId: DashboardModuleId,
): Record<string, unknown> | null {
  return parseQuickStatsJson(store.getString(QUICK_STATS_KEYS[moduleId]));
}

/** Finite number or `null`; anything else (string, NaN, missing) is "no proof". */
function num(
  stats: Record<string, unknown> | null,
  key: string,
): number | null {
  const value = stats?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Positive-only evidence for each step of `moduleId`'s checklist.
 *
 * Steps with no sound KV-readable source are simply absent from the
 * result and stay tap-driven: finyk `view_analytics`, fizruk
 * `check_progress`, nutrition `photo_analysis` are pure navigation with
 * no persisted trace, and finyk `connect_bank` is a server-side fact
 * that the web layer overlays from the Monobank sync-state query.
 */
export function deriveChecklistSignals(
  store: KVStore,
  moduleId: DashboardModuleId,
  probe?: ModuleEntryCountProbe,
): ChecklistSignals {
  const stats = readQuickStats(store, moduleId);
  const hasEntry = moduleHasRealEntry(store, moduleId, probe);

  switch (moduleId) {
    case "finyk": {
      // `budgetLeft` is `null` unless a monthly plan expense exists, and
      // may legitimately be 0 or negative once the plan is overspent —
      // so presence, not truthiness, is what proves the plan was set.
      const hasPlan = num(stats, "budgetLeft") !== null;
      return {
        add_expense: hasEntry || num(stats, "todaySpent") !== null,
        set_budget: hasPlan,
      };
    }
    case "fizruk": {
      const weekWorkouts = num(stats, "weekWorkouts") ?? 0;
      // `streak` counts *completed* weeks, so a non-zero streak is proof
      // of a finished workout; `weekWorkouts` alone only proves one was
      // started this week.
      const streak = num(stats, "streak") ?? 0;
      return {
        start_workout: hasEntry || weekWorkouts > 0,
        complete_workout: streak > 0,
        set_program:
          (store.getString(STORAGE_KEYS.FIZRUK_SELECTED_TEMPLATE) ?? "") !== "",
      };
    }
    case "routine": {
      const todayTotal = num(stats, "todayTotal") ?? 0;
      const todayDone = num(stats, "todayDone") ?? 0;
      const streak = num(stats, "streak") ?? 0;
      return {
        create_habit: hasEntry || todayTotal > 0,
        complete_habit: todayDone > 0 || streak > 0,
        three_day_streak: streak >= 3,
      };
    }
    case "nutrition": {
      const todayCal = num(stats, "todayCal") ?? 0;
      const calGoal = num(stats, "calGoal") ?? 0;
      return {
        log_meal: hasEntry || todayCal > 0,
        daily_plan: calGoal > 0,
      };
    }
    default: {
      const exhaustive: never = moduleId;
      void exhaustive;
      return {};
    }
  }
}
