/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Аудит 2026-10-01, data-35: секції бекапу Їжі, яких не було у файлі v1 -
 * рецепти, список покупок, журнал води й журнал цілей КБЖВ. Усі чотири
 * необовʼязкові: файл без секції не чіпає відповідні дані (так і лишаються
 * файли v1).
 *
 * Експорт читає sync-кеш SQLite (як решта `buildNutritionBackupPayload`);
 * `buildHubBackupPayload` синхронний, тож `listSavedRecipes` (async) тут не
 * підходить, а книга поточного користувача й так живе в `cache.recipes`.
 *
 * Семантика імпорту (`BackupRestoreMode`):
 *  - `replace`: рецепти, список покупок і вода замінюються секцією файлу;
 *  - `merge`: додається лише відсутнє (рецепти за id, позиції списку за id й
 *    назвою в категорії, вода лише за днями, яких ще нема);
 *  - журнал цілей append-only, тож в обох режимах лише доповнюється за id.
 */
import {
  normalizeShoppingList,
  normalizeWaterLog,
  type GoalPeriod,
  type ShoppingList,
  type WaterLog,
} from "@sergeant/nutrition-domain";
import type { BackupRestoreMode } from "@shared/lib/backup/restoreMode";
import {
  persistNutritionShoppingList,
  persistNutritionWaterLog,
  loadNutritionGoalPeriods,
} from "../lib/nutritionStorage";
import {
  appendRestoredNutritionGoalPeriods,
  restoreNutritionRecipes,
} from "../lib/nutritionRestoreStorage";
import {
  mirrorRestoredRecipesToIdb,
  normalizeRecipeForSave,
  type SavedRecipe,
} from "../lib/recipeBook";
import { loadShoppingList } from "../lib/shoppingListStorage";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";
import { loadWaterLog } from "../lib/waterStorage";

export type NutritionBackupGoalPeriod = Omit<GoalPeriod, "deletedAt">;

export interface NutritionBackupSections {
  recipes?: SavedRecipe[];
  shoppingList?: ShoppingList;
  waterLog?: WaterLog;
  goalPeriods?: NutritionBackupGoalPeriod[];
}

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const GOAL_ORIGINS = new Set(["manual", "preset", "tdee", "backfill"]);
/** Стелі серверного `applyNutritionGoalPeriods`: за ними період відхиляють. */
const GOAL_KCAL_MAX = 20_000;
const GOAL_MACRO_G_MAX = 1_000;
const GOAL_WATER_ML_MAX = 10_000;

export const BACKUP_SECTIONS_WRITE_FAILED_MESSAGE =
  "Частина даних Їжі не записалась. Спробуй ще раз.";

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

/**
 * Секції з кешу SQLite. Холодний кеш (`refreshedAt === null`) віддає порожні
 * дефолти, які в режимі replace стерли б справжні дані, тож тоді секцій немає.
 */
export function readNutritionBackupSections(): NutritionBackupSections {
  const cache = getCachedNutritionSqliteState();
  if (cache.refreshedAt === null) return {};
  return {
    recipes: [...cache.recipes].sort((a, b) => a.id.localeCompare(b.id)),
    shoppingList: loadShoppingList(),
    waterLog: loadWaterLog(),
    goalPeriods: loadNutritionGoalPeriods()
      .filter((p) => p.deletedAt == null)
      .map(({ deletedAt: _deletedAt, ...period }) => period),
  };
}

function optionalFinite(v: unknown, max: number): number | null | "bad" {
  if (v == null) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max) {
    return "bad";
  }
  return v;
}

function normalizeBackupGoalPeriod(
  x: unknown,
): NutritionBackupGoalPeriod | null {
  if (!isPlainObject(x)) return null;
  const id = typeof x["id"] === "string" ? x["id"].trim() : "";
  const effectiveFrom = x["effectiveFrom"];
  const origin = x["origin"];
  const createdAt = x["createdAt"];
  if (!id || typeof effectiveFrom !== "string") return null;
  if (!DAY_KEY_RE.test(effectiveFrom)) return null;
  if (typeof origin !== "string" || !GOAL_ORIGINS.has(origin)) return null;
  if (
    typeof createdAt !== "string" ||
    !Number.isFinite(Date.parse(createdAt))
  ) {
    return null;
  }
  const kcal = optionalFinite(x["kcal"], GOAL_KCAL_MAX);
  const proteinG = optionalFinite(x["proteinG"], GOAL_MACRO_G_MAX);
  const fatG = optionalFinite(x["fatG"], GOAL_MACRO_G_MAX);
  const carbsG = optionalFinite(x["carbsG"], GOAL_MACRO_G_MAX);
  const waterMl = optionalFinite(x["waterMl"], GOAL_WATER_ML_MAX);
  if (
    kcal === "bad" ||
    proteinG === "bad" ||
    fatG === "bad" ||
    carbsG === "bad" ||
    waterMl === "bad"
  ) {
    return null;
  }
  return {
    id,
    effectiveFrom,
    kcal,
    proteinG,
    fatG,
    carbsG,
    waterMl,
    origin: origin as GoalPeriod["origin"],
    createdAt,
  };
}

function normalizeBackupRecipe(x: unknown): SavedRecipe | null {
  if (!isPlainObject(x)) return null;
  const id = typeof x["id"] === "string" ? x["id"].trim() : "";
  if (!id) return null;
  const base = normalizeRecipeForSave({ ...x, id });
  if (!base.title) return null;
  // `normalizeRecipeForSave` штампує `updatedAt = now`: з файлу беремо свій,
  // інакше після restore кожен рецепт виглядав би щойно відредагованим і
  // вигравав LWW у інших пристроїв.
  const updatedAt = Number(x["updatedAt"]);
  return {
    ...base,
    updatedAt:
      Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : base.updatedAt,
  };
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.id) ? false : !!seen.add(i.id)));
}

/**
 * Чиста фаза «validate»: нічого не пише. Відсутня або не того типу секція
 * лишається `undefined`, тобто відповідні дані при відновленні не чіпаються.
 */
export function parseNutritionBackupSections(
  data: Record<string, unknown>,
): NutritionBackupSections {
  const out: NutritionBackupSections = {};
  const recipes = data["recipes"];
  if (Array.isArray(recipes)) {
    out.recipes = uniqueById(
      recipes
        .map(normalizeBackupRecipe)
        .filter((r): r is SavedRecipe => r != null),
    );
  }
  if (isPlainObject(data["shoppingList"])) {
    out.shoppingList = normalizeShoppingList(data["shoppingList"]);
  }
  if (isPlainObject(data["waterLog"])) {
    out.waterLog = normalizeWaterLog(data["waterLog"]);
  }
  const goalPeriods = data["goalPeriods"];
  if (Array.isArray(goalPeriods)) {
    out.goalPeriods = uniqueById(
      goalPeriods
        .map(normalizeBackupGoalPeriod)
        .filter((p): p is NutritionBackupGoalPeriod => p != null),
    );
  }
  return out;
}

const itemNameKey = (name: string): string =>
  name.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Список покупок для режиму merge: до поточного додаються позиції файлу, яких
 * ще нема (за id і за назвою в категорії). Наявні позиції лишаються такими, які
 * є, зокрема їхній стан «куплено». `null` - додавати нічого.
 */
function mergeShoppingLists(
  current: ShoppingList,
  incoming: ShoppingList,
): ShoppingList | null {
  const knownIds = new Set(
    current.categories.flatMap((c) => c.items.map((i) => i.id)),
  );
  const categories = current.categories.map((c) => ({
    ...c,
    items: [...c.items],
  }));
  let added = 0;
  for (const cat of incoming.categories) {
    let target = categories.find((c) => c.name === cat.name);
    for (const item of cat.items) {
      if (knownIds.has(item.id)) continue;
      const key = itemNameKey(item.name);
      if (target?.items.some((i) => itemNameKey(i.name) === key)) continue;
      if (!target) {
        target = { name: cat.name, items: [] };
        categories.push(target);
      }
      target.items.push(item);
      knownIds.add(item.id);
      added += 1;
    }
  }
  return added > 0 ? { categories } : null;
}

/**
 * Вода для режиму merge: до поточного журналу додаються лише дні, яких у ньому
 * ще нема (вже записаний день, навіть інший за обсягом, лишається). `null` -
 * додавати нічого.
 */
function mergeWaterLogs(
  current: WaterLog,
  incoming: WaterLog,
): WaterLog | null {
  const missing = Object.entries(incoming).filter(([day]) => !(day in current));
  return missing.length > 0
    ? { ...Object.fromEntries(missing), ...current }
    : null;
}

/**
 * Записує секції через наявні dual-write `persist*`. Усі синхронні записи
 * відбуваються ДО першого `await` (виклик синхронний аж до дзеркала IDB), тож
 * `nutritionDualWriteIdle()` у викликача бачить їх. Reject - якщо хоч один
 * запис відхилено (кеш не прогрітий), решта секцій при цьому все одно
 * записується.
 */
export async function applyNutritionBackupSections(
  sections: NutritionBackupSections,
  mode: BackupRestoreMode,
): Promise<void> {
  const replace = mode === "replace";
  let failed = false;
  let idbMirror: Promise<void> = Promise.resolve();

  if (sections.recipes) {
    const known = new Set(
      getCachedNutritionSqliteState().recipes.map((r) => r.id),
    );
    const toWrite = replace
      ? sections.recipes
      : sections.recipes.filter((r) => !known.has(r.id));
    if (replace || toWrite.length > 0) {
      restoreNutritionRecipes(toWrite, replace);
      idbMirror = mirrorRestoredRecipesToIdb(toWrite, { prune: replace });
    }
  }

  if (sections.shoppingList) {
    const next = replace
      ? sections.shoppingList
      : mergeShoppingLists(loadShoppingList(), sections.shoppingList);
    if (next && !persistNutritionShoppingList(next)) failed = true;
  }

  if (sections.waterLog) {
    const next = replace
      ? sections.waterLog
      : mergeWaterLogs(loadWaterLog(), sections.waterLog);
    if (next && !persistNutritionWaterLog(next)) failed = true;
  }

  if (sections.goalPeriods) {
    const known = new Set(loadNutritionGoalPeriods().map((p) => p.id));
    appendRestoredNutritionGoalPeriods(
      sections.goalPeriods
        .filter((p) => !known.has(p.id))
        .map((p) => ({
          id: p.id,
          effectiveFrom: p.effectiveFrom,
          goal: {
            kcal: p.kcal,
            proteinG: p.proteinG,
            fatG: p.fatG,
            carbsG: p.carbsG,
            waterMl: p.waterMl,
          },
          origin: p.origin,
          createdAt: p.createdAt,
        })),
    );
  }

  await idbMirror;
  if (failed) throw new Error(BACKUP_SECTIONS_WRITE_FAILED_MESSAGE);
}
