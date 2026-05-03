/**
 * Pure-function diff between two Nutrition MMKV-state snapshots, producing
 * the list of operations the dual-write layer must mirror to local
 * SQLite.
 *
 * Stage 4 PR #032 of `docs/planning/storage-roadmap.md`. Mirrors
 * `apps/web/src/modules/nutrition/lib/dualWrite/diff.ts` — kept duplicated
 * until Stage 5 promotes the dual-write helpers into a workspace package.
 *
 * See the web copy for full mapping rules and design notes.
 */

// -----------------------------------------------------------------------
// Snapshot shapes
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
  readonly prefsJson: string;
  readonly activePantryId: string | null;
}

export interface NutritionRecipeSnapshot {
  readonly id: string;
  readonly title: string;
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

export type NutritionDualWriteOp =
  | MealUpsertOp
  | MealDeleteOp
  | PantryUpsertOp
  | PantryDeleteOp
  | PrefsUpsertOp
  | RecipeUpsertOp
  | RecipeDeleteOp;

// -----------------------------------------------------------------------
// State shape
// -----------------------------------------------------------------------

export interface NutritionDualWriteState {
  readonly meals: readonly NutritionMealSnapshot[];
  readonly pantries: readonly NutritionPantrySnapshot[];
  readonly prefs: NutritionPrefsSnapshot | null;
  readonly recipes: readonly NutritionRecipeSnapshot[];
}

// -----------------------------------------------------------------------
// Diff
// -----------------------------------------------------------------------

export function diffNutritionDualWriteOps(
  prev: NutritionDualWriteState,
  next: NutritionDualWriteState,
): NutritionDualWriteOp[] {
  const ops: NutritionDualWriteOp[] = [];

  diffArray(
    prev.meals,
    next.meals,
    (m) => m.id,
    mealChanged,
    (m) => ops.push({ kind: "meal-upsert", meal: m }),
    (id) => ops.push({ kind: "meal-delete", mealId: id }),
  );

  diffArray(
    prev.pantries,
    next.pantries,
    (p) => p.id,
    pantryChanged,
    (p) => ops.push({ kind: "pantry-upsert", pantry: p }),
    (id) => ops.push({ kind: "pantry-delete", pantryId: id }),
  );

  if (prefsChanged(prev.prefs, next.prefs) && next.prefs) {
    ops.push({ kind: "prefs-upsert", prefs: next.prefs });
  }

  diffArray(
    prev.recipes,
    next.recipes,
    (r) => r.id,
    () => true,
    (r) => ops.push({ kind: "recipe-upsert", recipe: r }),
    (id) => ops.push({ kind: "recipe-delete", recipeId: id }),
  );

  return ops;
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

  const sortedPrevIds = [...prevMap.keys()].sort();
  for (const id of sortedPrevIds) {
    if (!nextMap.has(id)) {
      onDelete(id);
    }
  }
}

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
