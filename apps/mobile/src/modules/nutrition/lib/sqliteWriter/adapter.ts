import {
  buildDelete,
  buildLwwUpsert,
  buildReconcileChildren,
  createApplyOps,
  toIntOrNull,
  toRealOrNull,
  type ApplyDualWriteOptions as CoreApplyDualWriteOptions,
  type ApplyDualWriteResult as CoreApplyDualWriteResult,
  type DualWriteLogger as CoreDualWriteLogger,
  type DualWriteRuntime,
  type TableSpec,
} from "@sergeant/dualwrite-core";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { enqueueOutboxUpsert } from "@/core/syncEngine/enqueueOutboxUpsert";
import { fireSyncOutboxUpsert } from "@/core/syncEngine/fireSyncOutboxUpsert";

import type {
  NutritionDualWriteOp,
  NutritionMealSnapshot,
  NutritionPantrySnapshot,
  NutritionPrefsSnapshot,
  NutritionRecipeSnapshot,
  NutritionShoppingListSnapshot,
} from "./diff";

/**
 * Async SQLite-side adapter for the Nutrition dual-write layer.
 *
 * Stage 4 PR #032 of `docs/planning/storage-roadmap.md`. Migrated onto
 * `@sergeant/dualwrite-core` in ADR-0073 крок 7: the op-loop is now
 * `createApplyOps` (best-effort) and every table's SQL is emitted by the
 * shared `buildLwwUpsert` / `buildDelete` / `buildReconcileChildren`
 * builders — mirroring `apps/web/src/modules/nutrition/lib/sqliteWriter/adapter.ts`
 * (crок 2). Behaviour and emitted SQL are byte-identical to the previous
 * hand-written adapter — see `adapter.snapshot.test.ts`.
 *
 * Both copies use the same `SqliteMigrationClient` (`{exec, run, all}`)
 * shape so a single SQL surface serves both web (sqlite-wasm) and
 * mobile (expo-sqlite), and unit-tests run unchanged on `better-sqlite3`.
 *
 * Design notes:
 *
 * - Best-effort: every op is wrapped in try/catch. A single failed op
 *   does NOT abort the rest.
 * - Idempotent: upserts use ON CONFLICT(id) DO UPDATE with LWW guard.
 * - LWW guard: updates only apply when the incoming `clientTs` is
 *   strictly newer than the local `updated_at`.
 */

export type ApplyDualWriteOptions = CoreApplyDualWriteOptions;
export type DualWriteLogger = CoreDualWriteLogger;
export type ApplyDualWriteResult = CoreApplyDualWriteResult;

/**
 * ADR-0073 Open question #7: mobile-логер `console.warn` заміняємо на
 * ін'єктований логер під час цієї міграції. `(sql, params)`-snapshot
 * незалежний від логера, тож заміна не впливає на byte-identity гейт.
 */
const DEFAULT_LOGGER: DualWriteLogger = (level, message, meta) => {
  if (level === "warn") {
    console.warn(`[nutrition.dualWrite] ${message}`, meta ?? {});
  }
};

const applyOps = createApplyOps<NutritionDualWriteOp>({
  handlers: {
    "meal-upsert": async (client, op, rt) => {
      await upsertMeal(client, op.meal, rt);
      return "applied";
    },
    "meal-delete": async (client, op, rt) => {
      await softDeleteMeal(client, op.mealId, rt);
      return "applied";
    },
    "pantry-upsert": async (client, op, rt) => {
      await upsertPantry(client, op.pantry, rt);
      return "applied";
    },
    "pantry-delete": async (client, op, rt) => {
      await softDeletePantry(client, op.pantryId, rt);
      return "applied";
    },
    "prefs-upsert": async (client, op, rt) => {
      await upsertPrefs(client, op.prefs, rt);
      return "applied";
    },
    "recipe-upsert": async (client, op, rt) => {
      await upsertRecipe(client, op.recipe, rt);
      return "applied";
    },
    "recipe-delete": async (client, op, rt) => {
      await softDeleteRecipe(client, op.recipeId, rt);
      return "applied";
    },
    "water-log-set": async (client, op, rt) => {
      await setWaterLog(client, op.dateKey, op.volumeMl, rt);
      return "applied";
    },
    "shopping-list-set": async (client, op, rt) => {
      await setShoppingList(client, op.shoppingList, rt);
      return "applied";
    },
  },
});

export async function applyNutritionDualWriteOps(
  client: SqliteMigrationClient,
  ops: readonly NutritionDualWriteOp[],
  options: ApplyDualWriteOptions,
): Promise<ApplyDualWriteResult> {
  return applyOps(client, ops, {
    userId: options.userId,
    clientTs: options.clientTs,
    logger: options.logger ?? DEFAULT_LOGGER,
  });
}

// -----------------------------------------------------------------------
// Table specs
// -----------------------------------------------------------------------

const MEAL_UPSERT_SPEC: TableSpec = {
  table: "nutrition_meals",
  insertClause: `INSERT INTO nutrition_meals
       (id, user_id, eaten_at, meal_type, name, label,
        kcal, protein_g, fat_g, carbs_g,
        source, macro_source, amount_g, food_id, is_demo,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["id"],
  updateColumns: [
    { column: "eaten_at" },
    { column: "meal_type" },
    { column: "name" },
    { column: "label" },
    { column: "kcal" },
    { column: "protein_g" },
    { column: "fat_g" },
    { column: "carbs_g" },
    { column: "source" },
    { column: "macro_source" },
    { column: "amount_g" },
    { column: "food_id" },
    { column: "is_demo" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

const PANTRY_UPSERT_SPEC: TableSpec = {
  table: "nutrition_pantries",
  insertClause: `INSERT INTO nutrition_pantries
       (id, user_id, name, text, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["id"],
  updateColumns: [
    { column: "name" },
    { column: "text" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

const PANTRY_ITEM_UPSERT_SPEC: TableSpec = {
  table: "nutrition_pantry_items",
  insertClause: `INSERT INTO nutrition_pantry_items
         (id, pantry_id, user_id, name, qty, unit, notes, sort_order,
          created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["id"],
  updateColumns: [
    { column: "pantry_id" },
    { column: "name" },
    { column: "qty" },
    { column: "unit" },
    { column: "notes" },
    { column: "sort_order" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 7,
  setIndent: 9,
};

const PREFS_UPSERT_SPEC: TableSpec = {
  table: "nutrition_prefs",
  insertClause: `INSERT INTO nutrition_prefs
       (user_id, prefs_json, active_pantry_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  conflictTarget: ["user_id"],
  updateColumns: [
    { column: "prefs_json" },
    { column: "active_pantry_id" },
    { column: "updated_at" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

const RECIPE_UPSERT_SPEC: TableSpec = {
  table: "nutrition_recipes",
  insertClause: `INSERT INTO nutrition_recipes
       (id, user_id, name, data_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["id"],
  updateColumns: [
    { column: "name" },
    { column: "data_json" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

const WATER_LOG_UPSERT_SPEC: TableSpec = {
  table: "nutrition_water_log",
  insertClause: `INSERT INTO nutrition_water_log (user_id, date_key, volume_ml, updated_at)
     VALUES (?, ?, ?, ?)`,
  conflictTarget: ["user_id", "date_key"],
  updateColumns: [{ column: "volume_ml" }, { column: "updated_at" }],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

const SHOPPING_LIST_UPSERT_SPEC: TableSpec = {
  table: "nutrition_shopping_list",
  insertClause: `INSERT INTO nutrition_shopping_list (user_id, data_json, updated_at)
     VALUES (?, ?, ?)`,
  conflictTarget: ["user_id"],
  updateColumns: [{ column: "data_json" }, { column: "updated_at" }],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

const MEAL_UPSERT_SQL = buildLwwUpsert(MEAL_UPSERT_SPEC);
const PANTRY_UPSERT_SQL = buildLwwUpsert(PANTRY_UPSERT_SPEC);
const PANTRY_ITEM_UPSERT_SQL = buildLwwUpsert(PANTRY_ITEM_UPSERT_SPEC);
const PREFS_UPSERT_SQL = buildLwwUpsert(PREFS_UPSERT_SPEC);
const RECIPE_UPSERT_SQL = buildLwwUpsert(RECIPE_UPSERT_SPEC);
const WATER_LOG_UPSERT_SQL = buildLwwUpsert(WATER_LOG_UPSERT_SPEC);
const SHOPPING_LIST_UPSERT_SQL = buildLwwUpsert(SHOPPING_LIST_UPSERT_SPEC);

const MEAL_DELETE_SQL = buildDelete({
  table: "nutrition_meals",
  deletePolicy: "soft",
  matchColumns: ["id", "user_id"],
});
const PANTRY_DELETE_SQL = buildDelete({
  table: "nutrition_pantries",
  deletePolicy: "soft",
  matchColumns: ["id", "user_id"],
});
const RECIPE_DELETE_SQL = buildDelete({
  table: "nutrition_recipes",
  deletePolicy: "soft",
  matchColumns: ["id", "user_id"],
});

// Cascade soft-delete of items when a whole pantry is deleted — this WHERE
// shape (`deleted_at IS NULL`, no LWW guard) matches the reconcile keepCount-0
// branch, so reuse that builder.
const PANTRY_ITEMS_CASCADE_SQL = buildReconcileChildren(
  { table: "nutrition_pantry_items", parentColumn: "pantry_id" },
  0,
);

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
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  const eatenAt = composeEatenAt(m.dateKey, m.time);
  await client.run(MEAL_UPSERT_SQL, [
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
  ]);
  void enqueueOutboxUpsert(client, {
    userId,
    table: "nutrition_meals",
    op: "insert",
    clientTs,
    idempotencyKey: crypto.randomUUID(),
    row: {
      id: m.id,
      user_id: userId,
      eaten_at: eatenAt,
      meal_type: m.mealType || "snack",
      name: m.name ?? "",
      label: m.label ?? "",
      kcal: toIntOrNull(m.macros?.kcal),
      protein_g: toRealOrNull(m.macros?.protein_g),
      fat_g: toRealOrNull(m.macros?.fat_g),
      carbs_g: toRealOrNull(m.macros?.carbs_g),
      source: m.source || "manual",
      macro_source: m.macroSource || "manual",
      amount_g: toRealOrNull(m.amountG),
      food_id: m.foodId ?? null,
      is_demo: m.isDemo ? 1 : 0,
    },
  }).catch(() => {});
}

async function softDeleteMeal(
  client: SqliteMigrationClient,
  mealId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(MEAL_DELETE_SQL, [
    clientTs,
    clientTs,
    mealId,
    userId,
    clientTs,
  ]);
  void enqueueOutboxUpsert(client, {
    userId,
    table: "nutrition_meals",
    op: "delete",
    row: { id: mealId, user_id: userId },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});
}

// -----------------------------------------------------------------------
// Pantries (parent + items)
// -----------------------------------------------------------------------

async function upsertPantry(
  client: SqliteMigrationClient,
  p: NutritionPantrySnapshot,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(PANTRY_UPSERT_SQL, [
    p.id,
    userId,
    p.name ?? "",
    p.text ?? "",
    clientTs,
    clientTs,
  ]);
  void enqueueOutboxUpsert(client, {
    userId,
    table: "nutrition_pantries",
    op: "insert",
    row: { id: p.id, user_id: userId, name: p.name ?? "", text: p.text ?? "" },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});

  // Upsert items
  const items = p.items ?? [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await client.run(PANTRY_ITEM_UPSERT_SQL, [
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
    ]);
    void enqueueOutboxUpsert(client, {
      userId,
      table: "nutrition_pantry_items",
      op: "insert",
      row: {
        id: it!.id!,
        pantry_id: p.id,
        user_id: userId,
        name: it!.name! ?? "",
        qty: toRealOrNull(it!.qty!),
        unit: it!.unit! ?? null,
        notes: it!.notes! ?? null,
        sort_order: i,
      },
      clientTs,
      idempotencyKey: crypto.randomUUID(),
    }).catch(() => {});
  }

  // Soft-delete items removed from the pantry
  const itemIds = items.map((it) => it.id);
  await softDeleteRemovedChildren(client, p.id, userId, clientTs, itemIds);
}

async function softDeletePantry(
  client: SqliteMigrationClient,
  pantryId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  // Query items to enqueue as deleted before the cascade.
  const itemsToDelete = await client.all<{ id: string }>(
    `SELECT id FROM nutrition_pantry_items WHERE pantry_id = ? AND user_id = ? AND deleted_at IS NULL`,
    [pantryId, userId],
  );
  await client.run(PANTRY_DELETE_SQL, [
    clientTs,
    clientTs,
    pantryId,
    userId,
    clientTs,
  ]);
  // Cascade soft-delete to items
  await client.run(PANTRY_ITEMS_CASCADE_SQL, [
    clientTs,
    clientTs,
    pantryId,
    userId,
  ]);
  void enqueueOutboxUpsert(client, {
    userId,
    table: "nutrition_pantries",
    op: "delete",
    row: { id: pantryId, user_id: userId },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});
  for (const it of itemsToDelete) {
    void enqueueOutboxUpsert(client, {
      userId,
      table: "nutrition_pantry_items",
      op: "delete",
      row: { id: it.id, user_id: userId },
      clientTs,
      idempotencyKey: crypto.randomUUID(),
    }).catch(() => {});
  }
}

// -----------------------------------------------------------------------
// Prefs (singleton per user)
// -----------------------------------------------------------------------

async function upsertPrefs(
  client: SqliteMigrationClient,
  prefs: NutritionPrefsSnapshot,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(PREFS_UPSERT_SQL, [
    userId,
    prefs.prefsJson ?? "{}",
    prefs.activePantryId ?? null,
    clientTs,
    clientTs,
  ]);
  void enqueueOutboxUpsert(client, {
    userId,
    table: "nutrition_prefs",
    op: "insert",
    row: {
      user_id: userId,
      prefs_json: prefs.prefsJson ?? "{}",
      active_pantry_id: prefs.activePantryId ?? null,
    },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});
}

// -----------------------------------------------------------------------
// Recipes
// -----------------------------------------------------------------------

async function upsertRecipe(
  client: SqliteMigrationClient,
  r: NutritionRecipeSnapshot,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(RECIPE_UPSERT_SQL, [
    r.id,
    userId,
    r.title ?? "",
    r.dataJson ?? "{}",
    clientTs,
    clientTs,
  ]);
  void enqueueOutboxUpsert(client, {
    userId,
    table: "nutrition_recipes",
    op: "insert",
    row: {
      id: r.id,
      user_id: userId,
      name: r.title ?? "",
      data_json: r.dataJson ?? "{}",
    },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});
}

async function softDeleteRecipe(
  client: SqliteMigrationClient,
  recipeId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(RECIPE_DELETE_SQL, [
    clientTs,
    clientTs,
    recipeId,
    userId,
    clientTs,
  ]);
  void enqueueOutboxUpsert(client, {
    userId,
    table: "nutrition_recipes",
    op: "delete",
    row: { id: recipeId, user_id: userId },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});
}

// -----------------------------------------------------------------------
// Stage 11 — water log (one row per (user, dateKey))
// -----------------------------------------------------------------------

async function setWaterLog(
  client: SqliteMigrationClient,
  dateKey: string,
  volumeMl: number,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  const safeVolume = toIntOrNull(volumeMl);
  await client.run(WATER_LOG_UPSERT_SQL, [
    userId,
    dateKey,
    safeVolume ?? 0,
    clientTs,
  ]);
  fireSyncOutboxUpsert(client, {
    userId,
    table: "nutrition_water_log",
    op: "insert",
    clientTs,
    row: { user_id: userId, date_key: dateKey, volume_ml: safeVolume ?? 0 },
  });
}

// -----------------------------------------------------------------------
// Stage 11 — shopping list (singleton row per user)
// -----------------------------------------------------------------------

async function setShoppingList(
  client: SqliteMigrationClient,
  shoppingList: NutritionShoppingListSnapshot,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(SHOPPING_LIST_UPSERT_SQL, [
    userId,
    shoppingList.dataJson ?? '{"categories":[]}',
    clientTs,
  ]);
  fireSyncOutboxUpsert(client, {
    userId,
    table: "nutrition_shopping_list",
    op: "insert",
    clientTs,
    row: {
      user_id: userId,
      data_json: shoppingList.dataJson ?? '{"categories":[]}',
    },
  });
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

/**
 * Soft-delete children of a pantry that are no longer in `keepIds`.
 * Delegates the SQL to `buildReconcileChildren` (both the empty and
 * NOT IN branches) — the params are laid out to match each branch.
 */
async function softDeleteRemovedChildren(
  client: SqliteMigrationClient,
  parentId: string,
  userId: string,
  clientTs: string,
  keepIds: readonly string[],
): Promise<void> {
  const sql = buildReconcileChildren(
    { table: "nutrition_pantry_items", parentColumn: "pantry_id" },
    keepIds.length,
  );
  if (keepIds.length === 0) {
    await client.run(sql, [clientTs, clientTs, parentId, userId]);
    return;
  }
  await client.run(sql, [clientTs, clientTs, parentId, userId, ...keepIds]);
}
