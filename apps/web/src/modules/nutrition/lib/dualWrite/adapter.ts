import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { logger as webLogger } from "@shared/lib";

import type {
  NutritionDualWriteOp,
  NutritionMealSnapshot,
  NutritionPantrySnapshot,
  NutritionPrefsSnapshot,
  NutritionRecipeSnapshot,
  NutritionShoppingListSnapshot,
} from "./diff.js";

/**
 * Async SQLite-side adapter for the Nutrition dual-write layer.
 *
 * Stage 4 PR #032 of `docs/planning/storage-roadmap.md`. Mirror of
 * `apps/web/src/modules/fizruk/lib/dualWrite/adapter.ts` with nutrition
 * entity types. Takes the `NutritionDualWriteOp[]` produced by
 * `diffNutritionDualWriteOps` and writes them to the local
 * `nutrition_*` tables.
 *
 * Design notes (same as fizruk adapter):
 *
 * - Best-effort: every op is wrapped in try/catch. A single failed op
 *   does NOT abort the rest.
 * - Idempotent: upserts use ON CONFLICT(id) DO UPDATE with LWW guard.
 * - LWW guard: updates only apply when the incoming `clientTs` is
 *   strictly newer than the local `updated_at`.
 */

export interface ApplyDualWriteOptions {
  readonly userId: string;
  readonly clientTs: string;
  readonly logger?: DualWriteLogger;
}

export type DualWriteLogger = (
  level: "warn" | "info",
  message: string,
  meta?: Record<string, unknown>,
) => void;

export interface ApplyDualWriteResult {
  readonly applied: number;
  readonly errored: number;
  readonly skipped: number;
}

const DEFAULT_LOGGER: DualWriteLogger = (level, message, meta) => {
  if (level === "warn") {
    webLogger.warn(`[nutrition.dualWrite] ${message}`, meta ?? {});
  }
};

export async function applyNutritionDualWriteOps(
  client: SqliteMigrationClient,
  ops: readonly NutritionDualWriteOp[],
  options: ApplyDualWriteOptions,
): Promise<ApplyDualWriteResult> {
  if (ops.length === 0) {
    return { applied: 0, errored: 0, skipped: 0 };
  }
  const logger = options.logger ?? DEFAULT_LOGGER;
  let applied = 0;
  let errored = 0;
  let skipped = 0;

  for (const op of ops) {
    try {
      const outcome = await applyOne(client, op, options);
      if (outcome === "applied") applied += 1;
      else skipped += 1;
    } catch (err) {
      errored += 1;
      logger("warn", "dual-write op failed", {
        op: op.kind,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { applied, errored, skipped };
}

type ApplyOutcome = "applied" | "skipped";

async function applyOne(
  client: SqliteMigrationClient,
  op: NutritionDualWriteOp,
  options: ApplyDualWriteOptions,
): Promise<ApplyOutcome> {
  const { userId, clientTs } = options;
  switch (op.kind) {
    case "meal-upsert":
      await upsertMeal(client, op.meal, userId, clientTs);
      return "applied";

    case "meal-delete":
      await softDeleteMeal(client, op.mealId, userId, clientTs);
      return "applied";

    case "pantry-upsert":
      await upsertPantry(client, op.pantry, userId, clientTs);
      return "applied";

    case "pantry-delete":
      await softDeletePantry(client, op.pantryId, userId, clientTs);
      return "applied";

    case "prefs-upsert":
      await upsertPrefs(client, op.prefs, userId, clientTs);
      return "applied";

    case "recipe-upsert":
      await upsertRecipe(client, op.recipe, userId, clientTs);
      return "applied";

    case "recipe-delete":
      await softDeleteRecipe(client, op.recipeId, userId, clientTs);
      return "applied";

    // Stage 11 / PR #070n-dualwrite ops -----------------------------
    case "water-log-set":
      await setWaterLog(client, op.dateKey, op.volumeMl, userId, clientTs);
      return "applied";

    case "shopping-list-set":
      await setShoppingList(client, op.shoppingList, userId, clientTs);
      return "applied";

    default: {
      const _exhaustive: never = op;
      void _exhaustive;
      return "skipped";
    }
  }
}

// -----------------------------------------------------------------------
// Meals
// -----------------------------------------------------------------------

/** Compose the `eaten_at` timestamp from `${dateKey}T${time}:00.000Z`. */
function composeEatenAt(dateKey: string, time: string): string {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : "1970-01-01";
  const safeTime = /^\d{2}:\d{2}$/.test(time) ? time : "00:00";
  return `${safeDate}T${safeTime}:00.000Z`;
}

async function upsertMeal(
  client: SqliteMigrationClient,
  m: NutritionMealSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  const eatenAt = composeEatenAt(m.dateKey, m.time);
  await client.run(
    `INSERT INTO nutrition_meals
       (id, user_id, eaten_at, meal_type, name, label,
        kcal, protein_g, fat_g, carbs_g,
        source, macro_source, amount_g, food_id, is_demo,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       eaten_at     = excluded.eaten_at,
       meal_type    = excluded.meal_type,
       name         = excluded.name,
       label        = excluded.label,
       kcal         = excluded.kcal,
       protein_g    = excluded.protein_g,
       fat_g        = excluded.fat_g,
       carbs_g      = excluded.carbs_g,
       source       = excluded.source,
       macro_source = excluded.macro_source,
       amount_g     = excluded.amount_g,
       food_id      = excluded.food_id,
       is_demo      = excluded.is_demo,
       updated_at   = excluded.updated_at,
       deleted_at   = NULL
     WHERE excluded.updated_at > nutrition_meals.updated_at`,
    [
      m.id,
      userId,
      eatenAt,
      m.mealType || "snack",
      m.name ?? "",
      m.label ?? "",
      toIntOrNull(m.macros?.kcal),
      toRealOrNull(m.macros?.protein_g),
      toRealOrNull(m.macros?.fat_g),
      toRealOrNull(m.macros?.carbs_g),
      m.source || "manual",
      m.macroSource || "manual",
      toRealOrNull(m.amountG),
      m.foodId ?? null,
      m.isDemo ? 1 : 0,
      clientTs,
      clientTs,
    ],
  );
}

async function softDeleteMeal(
  client: SqliteMigrationClient,
  mealId: string,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `UPDATE nutrition_meals
        SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND updated_at < ?`,
    [clientTs, clientTs, mealId, userId, clientTs],
  );
}

// -----------------------------------------------------------------------
// Pantries (parent + items)
// -----------------------------------------------------------------------

async function upsertPantry(
  client: SqliteMigrationClient,
  p: NutritionPantrySnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO nutrition_pantries
       (id, user_id, name, text, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       name       = excluded.name,
       text       = excluded.text,
       updated_at = excluded.updated_at,
       deleted_at = NULL
     WHERE excluded.updated_at > nutrition_pantries.updated_at`,
    [p.id, userId, p.name ?? "", p.text ?? "", clientTs, clientTs],
  );

  // Upsert items
  const items = p.items ?? [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await client.run(
      `INSERT INTO nutrition_pantry_items
         (id, pantry_id, user_id, name, qty, unit, notes, sort_order,
          created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET
         pantry_id  = excluded.pantry_id,
         name       = excluded.name,
         qty        = excluded.qty,
         unit       = excluded.unit,
         notes      = excluded.notes,
         sort_order = excluded.sort_order,
         updated_at = excluded.updated_at,
         deleted_at = NULL
       WHERE excluded.updated_at > nutrition_pantry_items.updated_at`,
      [
        it!.id!,
        p.id,
        userId,
        it!.name! ?? "",
        toRealOrNull(it!.qty!),
        it!.unit! ?? null,
        it!.notes! ?? null,
        i,
        clientTs,
        clientTs,
      ],
    );
  }

  // Soft-delete items removed from the pantry
  const itemIds = items.map((it) => it.id);
  await softDeleteRemovedChildren(
    client,
    "nutrition_pantry_items",
    "pantry_id",
    p.id,
    userId,
    clientTs,
    itemIds,
  );
}

async function softDeletePantry(
  client: SqliteMigrationClient,
  pantryId: string,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `UPDATE nutrition_pantries
        SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND updated_at < ?`,
    [clientTs, clientTs, pantryId, userId, clientTs],
  );
  // Cascade soft-delete to items
  await client.run(
    `UPDATE nutrition_pantry_items
        SET deleted_at = ?, updated_at = ?
      WHERE pantry_id = ? AND user_id = ? AND deleted_at IS NULL`,
    [clientTs, clientTs, pantryId, userId],
  );
}

// -----------------------------------------------------------------------
// Prefs (singleton per user)
// -----------------------------------------------------------------------

async function upsertPrefs(
  client: SqliteMigrationClient,
  prefs: NutritionPrefsSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO nutrition_prefs
       (user_id, prefs_json, active_pantry_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       prefs_json       = excluded.prefs_json,
       active_pantry_id = excluded.active_pantry_id,
       updated_at       = excluded.updated_at
     WHERE excluded.updated_at > nutrition_prefs.updated_at`,
    [
      userId,
      prefs.prefsJson ?? "{}",
      prefs.activePantryId ?? null,
      clientTs,
      clientTs,
    ],
  );
}

// -----------------------------------------------------------------------
// Recipes
// -----------------------------------------------------------------------

async function upsertRecipe(
  client: SqliteMigrationClient,
  r: NutritionRecipeSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO nutrition_recipes
       (id, user_id, name, data_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       name       = excluded.name,
       data_json  = excluded.data_json,
       updated_at = excluded.updated_at,
       deleted_at = NULL
     WHERE excluded.updated_at > nutrition_recipes.updated_at`,
    [r.id, userId, r.title ?? "", r.dataJson ?? "{}", clientTs, clientTs],
  );
}

async function softDeleteRecipe(
  client: SqliteMigrationClient,
  recipeId: string,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `UPDATE nutrition_recipes
        SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND updated_at < ?`,
    [clientTs, clientTs, recipeId, userId, clientTs],
  );
}

// -----------------------------------------------------------------------
// Stage 11 — water log (one row per (user, dateKey))
// -----------------------------------------------------------------------

async function setWaterLog(
  client: SqliteMigrationClient,
  dateKey: string,
  volumeMl: number,
  userId: string,
  clientTs: string,
): Promise<void> {
  const safeVolume = toIntOrNull(volumeMl);
  await client.run(
    `INSERT INTO nutrition_water_log (user_id, date_key, volume_ml, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, date_key) DO UPDATE SET
       volume_ml  = excluded.volume_ml,
       updated_at = excluded.updated_at
     WHERE excluded.updated_at > nutrition_water_log.updated_at`,
    [userId, dateKey, safeVolume ?? 0, clientTs],
  );
}

// -----------------------------------------------------------------------
// Stage 11 — shopping list (singleton row per user)
// -----------------------------------------------------------------------

async function setShoppingList(
  client: SqliteMigrationClient,
  shoppingList: NutritionShoppingListSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO nutrition_shopping_list (user_id, data_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       data_json  = excluded.data_json,
       updated_at = excluded.updated_at
     WHERE excluded.updated_at > nutrition_shopping_list.updated_at`,
    [userId, shoppingList.dataJson ?? '{"categories":[]}', clientTs],
  );
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toRealOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Soft-delete children of a parent that are no longer in `keepIds`.
 * Mirror of the same helper in the fizruk adapter.
 */
async function softDeleteRemovedChildren(
  client: SqliteMigrationClient,
  tableName: string,
  parentCol: string,
  parentId: string,
  userId: string,
  clientTs: string,
  keepIds: readonly string[],
): Promise<void> {
  if (keepIds.length === 0) {
    await client.run(
      `UPDATE ${tableName}
          SET deleted_at = ?, updated_at = ?
        WHERE ${parentCol} = ? AND user_id = ? AND deleted_at IS NULL`,
      [clientTs, clientTs, parentId, userId],
    );
    return;
  }
  const placeholders = keepIds.map(() => "?").join(",");
  await client.run(
    `UPDATE ${tableName}
        SET deleted_at = ?, updated_at = ?
      WHERE ${parentCol} = ?
        AND user_id = ?
        AND deleted_at IS NULL
        AND id NOT IN (${placeholders})`,
    [clientTs, clientTs, parentId, userId, ...keepIds],
  );
}
