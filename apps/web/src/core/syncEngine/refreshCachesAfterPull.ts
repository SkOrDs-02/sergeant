import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

const ROUTINE_PULL_TABLES = new Set([
  "routine_entries",
  "routine_streaks",
  "routine_habits",
  "routine_tags",
  "routine_categories",
  "routine_prefs",
  "routine_habit_order",
  "routine_completion_notes",
  "routine_habit_skips",
  // W1-ROUTINE-APPEND стадія 1. Писар уже є (append-only journal), читачів
  // ще немає — але без цього рядка перший же pull чужого запису не
  // інвалідує routine-кеш, коли (у стадії 3) журнал стане джерелом правди.
  "routine_completion_events",
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
  // Модель «не можна» (ADR-0083). Тримати тут ОБОВʼЯЗКОВО: підтягнута з
  // сервера позначка травми має негайно перерахувати список вправ, інакше
  // юзер бачить як дозволену вправу, яку модель уже блокує.
  "fizruk_injuries",
  // Перенос власності pushup-даних routine → fizruk (2026-08-30): без
  // цього рядка pull нових повторів з іншого пристрою не оновив би
  // сторінку Прогрес.
  "fizruk_pushups",
]);
const NUTRITION_PULL_TABLES = new Set([
  "nutrition_meals",
  "nutrition_pantries",
  "nutrition_pantry_items",
  // W1-PANTRY-APPEND стадія 1. Читачів у журналу поки немає, але таблиця
  // має бути в списку ДО того, як зʼявляться писарі (стадія 2) — інакше
  // перший же pull подій не інвалідує nutrition-кеш.
  "nutrition_pantry_events",
  // W1-KBJU-APPEND стадія 1. Писар уже є (дуал-райт при зміні dailyTarget*),
  // читачів ще немає — але без цього рядка перший же pull чужої сходинки
  // не інвалідує nutrition-кеш.
  "nutrition_goal_periods",
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
          { emitRoutineStorage },
        ] = await Promise.all([
          import("../../modules/routine/lib/sqliteReader.js"),
          import("../../modules/routine/lib/routineStorage.js"),
        ]);
        await refreshSqliteCompletions(client, userId);
        await refreshSqliteRoutineState(client, userId);
        emitRoutineStorage();
      })(),
    );
  }

  if (touches(FINYK_PULL_TABLES, affectedTables)) {
    tasks.push(
      (async () => {
        const [{ refreshFinykSqliteState }, { notifyFinykSqliteCacheRefresh }] =
          await Promise.all([
            import("../../modules/finyk/lib/sqliteReader.js"),
            import("../../modules/finyk/lib/sqliteReadGate.js"),
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
          import("../../modules/fizruk/lib/sqliteReader.js"),
          import("../../modules/fizruk/lib/sqliteReadGate.js"),
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
          import("../../modules/nutrition/lib/sqliteReader.js"),
          import("../../modules/nutrition/lib/sqliteReadGate.js"),
        ]);
        await refreshNutritionSqliteState(client, userId);
        notifyNutritionSqliteCacheRefresh();
      })(),
    );
  }

  await Promise.all(tasks);
}
