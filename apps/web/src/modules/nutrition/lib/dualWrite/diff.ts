/**
 * Pure-function diff between two Nutrition LS-state snapshots, producing
 * the list of operations the dual-write layer must mirror to local
 * SQLite.
 *
 * Stage 4 PR #032 of `docs/planning/storage-roadmap.md`. The
 * orchestrator in `./index.ts` calls this on every successful
 * localStorage write. Stage 8 PR #056n dropped the
 * `feature.nutrition.sqlite_v2.dual_write` gate — the SQLite mirror is
 * now unconditional whenever a dual-write context is registered.
 *
 * Mirrors the fizruk dual-write diff layer (PR #028) — same shape,
 * same semantics, separate types because the entity surface is
 * different.
 *
 * Six entity classes are tracked:
 *
 *   1. **Meals** — flattened from
 *      `Record<dateKey, { meals: Meal[] }>` (`NUTRITION_LOG_KEY`). Each
 *      meal becomes one row in `nutrition_meals` keyed by the LS meal id;
 *      `eaten_at` is composed from `${dateKey}T${time}:00.000Z`.
 *
 *   2. **Pantries** — `Pantry[]` persisted under `NUTRITION_PANTRIES_KEY`.
 *      Each pantry has nested `items: PantryItem[]`; the diff yields one
 *      `pantry-upsert` per pantry and the adapter handles items + cleanup.
 *
 *   3. **Prefs** — singleton `NutritionPrefs` blob persisted under
 *      `NUTRITION_PREFS_KEY`, plus `active_pantry_id` from
 *      `NUTRITION_ACTIVE_PANTRY_KEY`. A single `prefs-upsert` op carries
 *      both.
 *
 *   4. **Recipes** — `SavedRecipe[]` (mobile MMKV / web IDB). Stored as
 *      JSON blob per row in `nutrition_recipes`.
 *
 *   5. **Water log** — `Record<dateKey, volume_ml>` persisted under
 *      `WATER_LOG_KEY`. One row per (user, dateKey) in
 *      `nutrition_water_log`; mirrors the `routine_pushups` shape.
 *      Stage 11 / PR #070n-dualwrite.
 *
 *   6. **Shopping list** — singleton `ShoppingList` blob persisted under
 *      `SHOPPING_LIST_KEY`. Stored as JSON-encoded `data_json` in
 *      `nutrition_shopping_list`; mirrors the `prefs-upsert` singleton
 *      pattern. Stage 11 / PR #070n-dualwrite.
 */

// -----------------------------------------------------------------------
// Snapshot shapes — loose mirrors of the domain types, kept minimal so
// the diff layer doesn't pull in the full domain package. The adapter
// reads these to produce SQL statements.
// -----------------------------------------------------------------------

export interface NutritionMacrosSnapshot {
  readonly kcal: number | null;
  readonly protein_g: number | null;
  readonly fat_g: number | null;
  readonly carbs_g: number | null;
}

export interface NutritionMealSnapshot {
  readonly id: string;
  readonly dateKey: string;
  readonly time: string;
  readonly mealType: string;
  readonly name: string;
  readonly label: string;
  readonly macros: NutritionMacrosSnapshot | null;
  readonly source: string;
  readonly macroSource: string;
  readonly amountG: number | null;
  readonly foodId: string | null;
  readonly isDemo: boolean;
}

export interface NutritionPantryItemSnapshot {
  readonly id: string;
  readonly name: string;
  readonly qty: number | null;
  readonly unit: string | null;
  readonly notes: string | null;
}

export interface NutritionPantrySnapshot {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly items: readonly NutritionPantryItemSnapshot[];
}

export interface NutritionPrefsSnapshot {
  /** Whole NutritionPrefs blob serialized to JSON for `prefs_json`. */
  readonly prefsJson: string;
  /** Mirrors `NUTRITION_ACTIVE_PANTRY_KEY` LS value. */
  readonly activePantryId: string | null;
}

export interface NutritionRecipeSnapshot {
  readonly id: string;
  readonly title: string;
  /** Whole SavedRecipe blob serialized to JSON for `data_json`. */
  readonly dataJson: string;
}

/**
 * Singleton snapshot for the shopping list. The whole `ShoppingList`
 * document is serialized to JSON (`data_json`) — there is no per-item
 * normalisation in `nutrition_shopping_list`, the document is read as
 * one blob. Stage 11 / PR #070n-dualwrite.
 */
export interface NutritionShoppingListSnapshot {
  /** Whole ShoppingList blob serialized to JSON for `data_json`. */
  readonly dataJson: string;
}

// -----------------------------------------------------------------------
// Op types
// -----------------------------------------------------------------------

export interface MealUpsertOp {
  readonly kind: "meal-upsert";
  readonly meal: NutritionMealSnapshot;
}

export interface MealDeleteOp {
  readonly kind: "meal-delete";
  readonly mealId: string;
}

export interface PantryUpsertOp {
  readonly kind: "pantry-upsert";
  readonly pantry: NutritionPantrySnapshot;
}

export interface PantryDeleteOp {
  readonly kind: "pantry-delete";
  readonly pantryId: string;
}

export interface PrefsUpsertOp {
  readonly kind: "prefs-upsert";
  readonly prefs: NutritionPrefsSnapshot;
}

export interface RecipeUpsertOp {
  readonly kind: "recipe-upsert";
  readonly recipe: NutritionRecipeSnapshot;
}

export interface RecipeDeleteOp {
  readonly kind: "recipe-delete";
  readonly recipeId: string;
}

/**
 * Stage 11 / PR #070n-dualwrite — water-log per-(user, dateKey) row.
 * Mirrors `routine_pushups`: a row stores a single integer counter
 * keyed by date. There is no soft-delete — `volume_ml = 0` is a valid
 * "reset for that day" state and the diff still emits the op so
 * cross-device LWW resolution converges.
 */
export interface WaterLogSetOp {
  readonly kind: "water-log-set";
  readonly dateKey: string;
  readonly volumeMl: number;
}

/**
 * Stage 11 / PR #070n-dualwrite — singleton shopping-list row.
 * Mirrors `prefs-upsert`: a single row per user with the whole
 * document JSON-encoded into `data_json`.
 */
export interface ShoppingListSetOp {
  readonly kind: "shopping-list-set";
  readonly shoppingList: NutritionShoppingListSnapshot;
}

export type NutritionDualWriteOp =
  | MealUpsertOp
  | MealDeleteOp
  | PantryUpsertOp
  | PantryDeleteOp
  | PrefsUpsertOp
  | RecipeUpsertOp
  | RecipeDeleteOp
  | WaterLogSetOp
  | ShoppingListSetOp;

// -----------------------------------------------------------------------
// State shape — what LS looks like across all nutrition keys
// -----------------------------------------------------------------------

export interface NutritionDualWriteState {
  readonly meals: readonly NutritionMealSnapshot[];
  readonly pantries: readonly NutritionPantrySnapshot[];
  readonly prefs: NutritionPrefsSnapshot | null;
  readonly recipes: readonly NutritionRecipeSnapshot[];
  /**
   * Water log keyed by `YYYY-MM-DD` (local date). Stage 11 /
   * PR #070n-dualwrite. Empty record means «no water rows yet».
   */
  readonly waterLog: Readonly<Record<string, number>>;
  /**
   * Shopping list singleton. `null` means «no row in
   * `nutrition_shopping_list` yet» — the diff treats `null → non-null`
   * as a single `shopping-list-set` op.
   */
  readonly shoppingList: NutritionShoppingListSnapshot | null;
}

// -----------------------------------------------------------------------
// Diff
// -----------------------------------------------------------------------

/**
 * Compute the dual-write operation list for the transition `prev → next`.
 *
 * Stable iteration order:
 *   1. meal-upsert / meal-delete (by id asc)
 *   2. pantry-upsert / pantry-delete (by id asc)
 *   3. prefs-upsert
 *   4. recipe-upsert / recipe-delete (by id asc)
 *   5. water-log-set (by dateKey asc) — Stage 11 / PR #070n-dualwrite
 *   6. shopping-list-set (at most one) — Stage 11 / PR #070n-dualwrite
 */
export function diffNutritionDualWriteOps(
  prev: NutritionDualWriteState,
  next: NutritionDualWriteState,
): NutritionDualWriteOp[] {
  const ops: NutritionDualWriteOp[] = [];

  // --- Meals ---
  diffArray(
    prev.meals,
    next.meals,
    (m) => m.id,
    mealChanged,
    (m) => ops.push({ kind: "meal-upsert", meal: m }),
    (id) => ops.push({ kind: "meal-delete", mealId: id }),
  );

  // --- Pantries ---
  diffArray(
    prev.pantries,
    next.pantries,
    (p) => p.id,
    pantryChanged,
    (p) => ops.push({ kind: "pantry-upsert", pantry: p }),
    (id) => ops.push({ kind: "pantry-delete", pantryId: id }),
  );

  // --- Prefs (singleton) ---
  if (prefsChanged(prev.prefs, next.prefs) && next.prefs) {
    ops.push({ kind: "prefs-upsert", prefs: next.prefs });
  }

  // --- Recipes ---
  diffArray(
    prev.recipes,
    next.recipes,
    (r) => r.id,
    () => true, // always upsert on reference change — JSON blob
    (r) => ops.push({ kind: "recipe-upsert", recipe: r }),
    (id) => ops.push({ kind: "recipe-delete", recipeId: id }),
  );

  // --- Water log (Stage 11) ---
  diffWaterLogOps(prev, next, ops);

  // --- Shopping list (Stage 11) ---
  diffShoppingListOps(prev, next, ops);

  return ops;
}

// -----------------------------------------------------------------------
// Stage 11 — water log diff
// -----------------------------------------------------------------------

function diffWaterLogOps(
  prev: NutritionDualWriteState,
  next: NutritionDualWriteState,
  ops: NutritionDualWriteOp[],
): void {
  const prevLog = prev.waterLog ?? {};
  const nextLog = next.waterLog ?? {};
  if (prevLog === nextLog) return;
  const setOps: WaterLogSetOp[] = [];
  const allKeys = new Set([...Object.keys(prevLog), ...Object.keys(nextLog)]);
  for (const dateKey of allKeys) {
    const prevVal = prevLog[dateKey] ?? 0;
    const nextVal = nextLog[dateKey] ?? 0;
    if (prevVal === nextVal) continue;
    setOps.push({ kind: "water-log-set", dateKey, volumeMl: nextVal });
  }
  setOps.sort((a, b) =>
    a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0,
  );
  ops.push(...setOps);
}

// -----------------------------------------------------------------------
// Stage 11 — shopping list diff
// -----------------------------------------------------------------------

function diffShoppingListOps(
  prev: NutritionDualWriteState,
  next: NutritionDualWriteState,
  ops: NutritionDualWriteOp[],
): void {
  if (!shoppingListChanged(prev.shoppingList, next.shoppingList)) return;
  if (!next.shoppingList) return;
  ops.push({ kind: "shopping-list-set", shoppingList: next.shoppingList });
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function diffArray<T extends { readonly id: string }>(
  prev: readonly T[],
  next: readonly T[],
  getId: (item: T) => string,
  hasChanged: (prev: T, next: T) => boolean,
  onUpsert: (item: T) => void,
  onDelete: (id: string) => void,
): void {
  const prevMap = new Map<string, T>();
  for (const item of prev) prevMap.set(getId(item), item);

  const nextMap = new Map<string, T>();
  for (const item of next) nextMap.set(getId(item), item);

  // Upserts: items in next that are new or changed.
  const sortedNextIds = [...nextMap.keys()].sort();
  for (const id of sortedNextIds) {
    const nextItem = nextMap.get(id)!;
    const prevItem = prevMap.get(id);
    if (!prevItem) {
      onUpsert(nextItem);
    } else if (prevItem !== nextItem && hasChanged(prevItem, nextItem)) {
      onUpsert(nextItem);
    }
  }

  // Deletes: items in prev that are absent in next.
  const sortedPrevIds = [...prevMap.keys()].sort();
  for (const id of sortedPrevIds) {
    if (!nextMap.has(id)) {
      onDelete(id);
    }
  }
}

/**
 * Shallow comparison of meal fields to detect changes. Macros are
 * compared by reference — caller code (the snapshot extractor) keeps
 * the same macros object when it doesn't mutate the meal.
 */
function mealChanged(
  prev: NutritionMealSnapshot,
  next: NutritionMealSnapshot,
): boolean {
  return (
    prev.dateKey !== next.dateKey ||
    prev.time !== next.time ||
    prev.mealType !== next.mealType ||
    prev.name !== next.name ||
    prev.label !== next.label ||
    prev.source !== next.source ||
    prev.macroSource !== next.macroSource ||
    prev.amountG !== next.amountG ||
    prev.foodId !== next.foodId ||
    prev.isDemo !== next.isDemo ||
    !macrosEqual(prev.macros, next.macros)
  );
}

function macrosEqual(
  a: NutritionMacrosSnapshot | null,
  b: NutritionMacrosSnapshot | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.kcal === b.kcal &&
    a.protein_g === b.protein_g &&
    a.fat_g === b.fat_g &&
    a.carbs_g === b.carbs_g
  );
}

/**
 * Pantry change detection: top-level fields + items reference. The
 * adapter always re-upserts the full items list when a pantry-upsert
 * is emitted, so a child-only mutation only requires the items array
 * reference to change (which the LS write layer already does).
 */
function pantryChanged(
  prev: NutritionPantrySnapshot,
  next: NutritionPantrySnapshot,
): boolean {
  return (
    prev.name !== next.name ||
    prev.text !== next.text ||
    prev.items !== next.items
  );
}

function prefsChanged(
  prev: NutritionPrefsSnapshot | null,
  next: NutritionPrefsSnapshot | null,
): boolean {
  if (prev === next) return false;
  if (!prev || !next) return prev !== next;
  return (
    prev.prefsJson !== next.prefsJson ||
    prev.activePantryId !== next.activePantryId
  );
}

function shoppingListChanged(
  prev: NutritionShoppingListSnapshot | null,
  next: NutritionShoppingListSnapshot | null,
): boolean {
  if (prev === next) return false;
  if (!prev || !next) return prev !== next;
  return prev.dataJson !== next.dataJson;
}
