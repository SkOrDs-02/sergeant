/**
 * HubModuleStorageBoot — settings-first and dashboard-first storage boot gate.
 *
 * Problem: Settings sections (`FinykSection`, `RoutineSection`,
 * `NotificationsSection`) and Hub aggregators (`coachSnapshot`,
 * `weeklyDigestAggregates`, `searchSources`) read from SQLite warm caches.
 * The caches are populated by module-level boot hooks inside `FinykApp`,
 * `RoutineApp`, `FizrukApp`, and `NutritionApp`. When the user opens
 * Settings or the Hub Dashboard *before* visiting any module tab, those boot
 * hooks have never fired and all caches are empty.
 *
 * Fix: mount this null-rendering component at the top of `HubSettingsPage`
 * and `HubDashboard` so all seven boot hooks run in the same React tree as
 * the components that need their data. Auth gating is inside each hook via
 * `useUser()` — if the user is not yet authenticated, all hooks early-exit
 * and retry on the next render when `userId` resolves. Hook ordering is
 * unconditional and stable (no conditional hook calls introduced).
 *
 * Boot hook inventory
 * ─────────────────────────────────────────────────────────────────────────
 * Write registrations (needed by Settings mutation paths):
 *   1. useFinykDualWriteBoot   — registers Finyk dual-write pipeline
 *   2. useRoutineDualWriteBoot — registers Routine dual-write pipeline
 *
 * Read caches (needed by Settings + Hub Dashboard/Reports/Search):
 *   3. useFinykSqliteReadBoot      — warms Finyk SQLite cache (tx-cats/prefs/…)
 *   4. useFinykMonoMirrorBoot      — warms Finyk Mono-mirror cache (transactions)
 *   5. useRoutineSqliteReadBoot    — warms Routine SQLite cache (habits/completions)
 *   6. useFizrukSqliteReadBoot     — warms Fizruk SQLite cache (workouts/exercises)
 *   7. useNutritionSqliteReadBoot  — warms Nutrition SQLite cache (log/prefs)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * This component is `null`-returning and carries no visible UI.
 */

import { useFinykDualWriteBoot } from "@/modules/finyk/hooks/useFinykDualWriteBoot";
import { useFinykSqliteReadBoot } from "@/modules/finyk/hooks/useFinykSqliteReadBoot";
import { useFinykMonoMirrorBoot } from "@/modules/finyk/hooks/useFinykMonoMirrorBoot";
import { useRoutineDualWriteBoot } from "@/modules/routine/hooks/useRoutineDualWriteBoot";
import { useRoutineSqliteReadBoot } from "@/modules/routine/hooks/useRoutineSqliteReadBoot";
import { useFizrukSqliteReadBoot } from "@/modules/fizruk/hooks/useFizrukSqliteReadBoot";
import { useNutritionSqliteReadBoot } from "@/modules/nutrition/hooks/useNutritionSqliteReadBoot";

/**
 * Mounts all seven Finyk / Routine / Fizruk / Nutrition SQLite read-cache
 * and dual-write registration hooks so that Hub aggregators and settings
 * mutations see fresh data even when the user has not yet visited the
 * individual module tabs.
 *
 * Returns `null` — no visible output.
 */
export function HubModuleStorageBoot(): null {
  // Write registrations — must run before any dual-write mutation.
  useFinykDualWriteBoot();
  useRoutineDualWriteBoot();

  // Read caches — must run before any SQLite warm-cache read.
  useFinykSqliteReadBoot();
  useFinykMonoMirrorBoot();
  useRoutineSqliteReadBoot();
  useFizrukSqliteReadBoot();
  useNutritionSqliteReadBoot();

  return null;
}
