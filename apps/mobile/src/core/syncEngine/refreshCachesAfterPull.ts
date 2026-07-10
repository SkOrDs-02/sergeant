/**
 * Refresh warm caches for modules touched by a pull batch (mobile).
 *
 * Mirrors `apps/web/src/core/syncEngine/refreshCachesAfterPull.ts` with
 * mobile-specific import paths and notification helpers. The web version
 * also calls `emitRoutineStorage()` (MMKV overlay flush) — on mobile the
 * SQLite cache is the canonical read path so we only need the
 * `notifyRoutineSqliteCacheRefresh()` tick.
 */
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

const ROUTINE_PULL_TABLES = new Set([
  "routine_entries",
  "routine_streaks",
  "routine_habits",
  "routine_tags",
  "routine_categories",
  "routine_prefs",
  "routine_pushups",
  "routine_habit_order",
  "routine_completion_notes",
]);
const FINYK_PULL_TABLES = new Set([
  "finyk_hidden_accounts",
  "finyk_hidden_transactions",
  "finyk_budgets",
  "finyk_subscriptions",
  "finyk_assets",
  "finyk_debts",
  "finyk_receivables",
  "finyk_custom_categories",
  "finyk_manual_expenses",
  "finyk_tx_filters",
  "finyk_tx_categories",
  "finyk_tx_splits",
  "finyk_mono_debt_links",
  "finyk_networth_history",
  "finyk_prefs",
]);
const FIZRUK_PULL_TABLES = new Set([
  "fizruk_workouts",
  "fizruk_workout_items",
  "fizruk_workout_sets",
  "fizruk_custom_exercises",
  "fizruk_measurements",
  "fizruk_daily_log",
  "fizruk_monthly_plan",
  "fizruk_plan_templates",
  "fizruk_programs",
  "fizruk_wellbeing",
  "fizruk_workout_templates",
]);
const NUTRITION_PULL_TABLES = new Set([
  "nutrition_meals",
  "nutrition_pantries",
  "nutrition_pantry_items",
  "nutrition_prefs",
  "nutrition_recipes",
  "nutrition_water_log",
  "nutrition_shopping_list",
]);

function touches(set: Set<string>, affected: ReadonlySet<string>): boolean {
  for (const table of affected) {
    if (set.has(table)) return true;
  }
  return false;
}

/**
 * Refresh warm caches + UI overlay ticks for modules touched by a pull batch.
 */
export async function refreshCachesAfterPull(
  client: SqliteMigrationClient,
  userId: string,
  affectedTables: ReadonlySet<string>,
): Promise<void> {
  const tasks: Array<Promise<void>> = [];

  if (touches(ROUTINE_PULL_TABLES, affectedTables)) {
    tasks.push(
      (async () => {
        const [
          { refreshSqliteCompletions, refreshSqliteRoutineState },
          { notifyRoutineSqliteCacheRefresh },
        ] = await Promise.all([
          import("@/modules/routine/lib/sqliteReader"),
          import("@/modules/routine/lib/sqliteReadGate"),
        ]);
        await refreshSqliteCompletions(client, userId);
        await refreshSqliteRoutineState(client, userId);
        notifyRoutineSqliteCacheRefresh();
      })(),
    );
  }

  if (touches(FINYK_PULL_TABLES, affectedTables)) {
    tasks.push(
      (async () => {
        const [{ refreshFinykSqliteState }, { notifyFinykSqliteCacheRefresh }] =
          await Promise.all([
            import("@/modules/finyk/lib/sqliteReader"),
            import("@/modules/finyk/lib/sqliteReadGate"),
          ]);
        await refreshFinykSqliteState(client, userId);
        notifyFinykSqliteCacheRefresh();
      })(),
    );
  }

  if (touches(FIZRUK_PULL_TABLES, affectedTables)) {
    tasks.push(
      (async () => {
        const [
          { refreshFizrukSqliteState },
          { notifyFizrukSqliteCacheRefresh },
        ] = await Promise.all([
          import("@/modules/fizruk/lib/sqliteReader"),
          import("@/modules/fizruk/lib/sqliteReadGate"),
        ]);
        await refreshFizrukSqliteState(client, userId);
        notifyFizrukSqliteCacheRefresh();
      })(),
    );
  }

  if (touches(NUTRITION_PULL_TABLES, affectedTables)) {
    tasks.push(
      (async () => {
        const [
          { refreshNutritionSqliteState },
          { notifyNutritionSqliteCacheRefresh },
        ] = await Promise.all([
          import("@/modules/nutrition/lib/sqliteReader"),
          import("@/modules/nutrition/lib/sqliteReadGate"),
        ]);
        await refreshNutritionSqliteState(client, userId);
        notifyNutritionSqliteCacheRefresh();
      })(),
    );
  }

  await Promise.all(tasks);
}
