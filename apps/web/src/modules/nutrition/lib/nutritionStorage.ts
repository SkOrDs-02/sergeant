/**
 * Web I/O-адаптер для модуля Харчування: prefs, pantries, log.
 *
 * Pure-логіка (normalize/default/mutation-хелпери + типи + LS-ключі) живе
 * у `@sergeant/nutrition-domain` і спільна з `apps/mobile`. Тут лишаються
 * лише `load*`/`persist*` поверх `createModuleStorage` і реекспорти
 * старої поверхні цього модуля, щоб існуючі `../lib/nutritionStorage.js`
 * імпорти всередині `apps/web` не довелось переписувати.
 */
import {
  NUTRITION_ACTIVE_PANTRY_KEY,
  NUTRITION_LOG_KEY,
  NUTRITION_PANTRIES_KEY,
  NUTRITION_PREFS_KEY,
  defaultNutritionPrefs,
  makeDefaultPantry,
  normalizeNutritionLog,
  normalizeNutritionPrefs,
  normalizePantries,
  type NutritionLog,
  type NutritionPrefs,
  type Pantry,
} from "@sergeant/nutrition-domain";

import { nutritionStorage } from "./nutritionStorageInstance";
import {
  isNutritionDualWriteRegistered,
  triggerNutritionDualWrite,
  type NutritionDualWriteState,
} from "./dualWrite/index.js";
import type {
  NutritionMealSnapshot,
  NutritionPantrySnapshot,
} from "./dualWrite/diff.js";

export {
  NUTRITION_ACTIVE_PANTRY_KEY,
  NUTRITION_LOG_KEY,
  NUTRITION_PANTRIES_KEY,
  NUTRITION_PREFS_KEY,
  addDaysISODate,
  addLogEntry,
  defaultNutritionPrefs,
  duplicatePreviousDayMeals,
  estimateLogBytes,
  getDayMacros,
  getDaySummary,
  getMacrosForDateRange,
  makeDefaultPantry,
  mergeNutritionLogs,
  normalizeMeal,
  normalizeNutritionLog,
  normalizePantries,
  removeLogEntry,
  searchMealsByName,
  trimLogOldestDays,
  updateLogEntry,
  updatePantry,
} from "@sergeant/nutrition-domain";
export { toLocalISODate } from "@sergeant/shared";
export type {
  DaySummary,
  MacrosRow,
  Meal,
  MealMacroSource,
  MealSearchResult,
  MealSource,
  MealTemplate,
  NutritionDay,
  NutritionGoal,
  NutritionLog,
  NutritionLogLike,
  NutritionPrefs,
  Pantry,
} from "@sergeant/nutrition-domain";

// ─────────────────────────────────────────────
// I/O wrappers (createModuleStorage / localStorage)
// ─────────────────────────────────────────────

export function loadNutritionPrefs(
  key: string = NUTRITION_PREFS_KEY,
): NutritionPrefs {
  return normalizeNutritionPrefs(nutritionStorage.readJSON(key, null));
}

export function persistNutritionPrefs(
  prefs: NutritionPrefs | null | undefined,
  key: string = NUTRITION_PREFS_KEY,
): boolean {
  const prev = peekNutritionDualWriteState();
  const ok = nutritionStorage.writeJSON(key, prefs || defaultNutritionPrefs());
  if (ok && prev !== null) {
    triggerNutritionDualWrite(prev, peekNutritionDualWriteState() ?? prev);
  }
  return ok;
}

export function loadActivePantryId(
  activeKey: string = NUTRITION_ACTIVE_PANTRY_KEY,
): string {
  const v = nutritionStorage.readRaw(activeKey, null);
  return v ? String(v) : "home";
}

export function loadPantries(
  key: string = NUTRITION_PANTRIES_KEY,
  activeKey: string = NUTRITION_ACTIVE_PANTRY_KEY,
): Pantry[] {
  const parsed = nutritionStorage.readJSON(key, null);
  const normalized = normalizePantries(parsed);
  if (normalized.length > 0) return normalized;

  // Legacy v0 pantry migration is handled by storageManager
  // (nutrition_001_migrate_legacy_pantry). By the time this code runs after
  // app boot, the v1 key already has data if any v0 data existed.
  const fallback = makeDefaultPantry();
  nutritionStorage.writeRaw(activeKey, fallback.id);
  return [fallback];
}

export function persistPantries(
  key: string = NUTRITION_PANTRIES_KEY,
  activeKey: string = NUTRITION_ACTIVE_PANTRY_KEY,
  pantries?: Pantry[] | null,
  activeId?: string | null,
): boolean {
  const prev = peekNutritionDualWriteState();
  const a = nutritionStorage.writeJSON(
    key,
    Array.isArray(pantries) ? pantries : [],
  );
  const b = activeId
    ? nutritionStorage.writeRaw(activeKey, String(activeId))
    : true;
  const ok = a && b;
  if (ok && prev !== null) {
    triggerNutritionDualWrite(prev, peekNutritionDualWriteState() ?? prev);
  }
  return ok;
}

export function loadNutritionLog(
  key: string = NUTRITION_LOG_KEY,
): NutritionLog {
  const parsed = nutritionStorage.readJSON(key, null);
  return normalizeNutritionLog(parsed);
}

export function persistNutritionLog(
  log: NutritionLog | null | undefined,
  key: string = NUTRITION_LOG_KEY,
): boolean {
  const prev = peekNutritionDualWriteState();
  const ok = nutritionStorage.writeJSON(key, log || {});
  if (ok && prev !== null) {
    triggerNutritionDualWrite(prev, peekNutritionDualWriteState() ?? prev);
  }
  return ok;
}

// ─────────────────────────────────────────────
// Dual-write state extraction (Stage 4 PR #032)
//
// Reads the parts of LS that map to `nutrition_*` SQLite tables and
// returns a `NutritionDualWriteState`. Returns `null` when no dual-write
// context is registered — the LS-write call sites use this as a fast-path
// gate so the extraction cost (a couple of LS reads) is only paid when
// the dual-write feature is actually on.
//
// Recipes are intentionally excluded on web: they live in IndexedDB
// (`recipeBook.ts`) rather than LS, so they are not yet wired into the
// state extractor here. The diff/adapter still support recipes; the
// IDB-backed path will be wired in a follow-up.
// ─────────────────────────────────────────────

function peekNutritionDualWriteState(): NutritionDualWriteState | null {
  if (!isNutritionDualWriteRegistered()) return null;
  try {
    const log = loadNutritionLog();
    const pantries = nutritionStorage.readJSON(NUTRITION_PANTRIES_KEY, null);
    const normalizedPantries = normalizePantries(pantries);
    const activePantryRaw = nutritionStorage.readRaw(
      NUTRITION_ACTIVE_PANTRY_KEY,
      null,
    );
    const activePantryId = activePantryRaw ? String(activePantryRaw) : null;
    const prefsParsed = nutritionStorage.readJSON(NUTRITION_PREFS_KEY, null);
    const prefs = normalizeNutritionPrefs(prefsParsed);

    return {
      meals: extractMealSnapshots(log),
      pantries: extractPantrySnapshots(normalizedPantries),
      prefs: {
        prefsJson: JSON.stringify(prefs),
        activePantryId,
      },
      recipes: [],
    };
  } catch {
    return null;
  }
}

function extractMealSnapshots(log: NutritionLog): NutritionMealSnapshot[] {
  const out: NutritionMealSnapshot[] = [];
  for (const [dateKey, day] of Object.entries(log)) {
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    for (const m of meals) {
      if (!m || typeof m !== "object" || !m.id) continue;
      out.push({
        id: String(m.id),
        dateKey,
        time: typeof m.time === "string" ? m.time : "",
        mealType: typeof m.mealType === "string" ? m.mealType : "snack",
        name: typeof m.name === "string" ? m.name : "",
        label: typeof m.label === "string" ? m.label : "",
        macros: m.macros ?? null,
        source: typeof m.source === "string" ? m.source : "manual",
        macroSource:
          typeof m.macroSource === "string" ? m.macroSource : "manual",
        amountG: typeof m.amount_g === "number" ? m.amount_g : null,
        foodId: typeof m.foodId === "string" ? m.foodId : null,
        isDemo: m.demo === true,
      });
    }
  }
  return out;
}

function extractPantrySnapshots(
  pantries: readonly Pantry[],
): NutritionPantrySnapshot[] {
  // Pantry items in LS are positional and have no stable `id`. Generate a
  // deterministic id from `pantryId::index::name` so the same item gets
  // the same row across reads — the adapter relies on `id` for upsert /
  // soft-delete, and a stable derivation prevents thrash on every diff.
  return pantries.map((p) => ({
    id: p.id,
    name: p.name,
    text: p.text,
    items: (p.items ?? []).map((it, idx) => ({
      id: `${p.id}::${idx}::${it.name ?? ""}`,
      name: it.name,
      qty: typeof it.qty === "number" ? it.qty : null,
      unit: typeof it.unit === "string" ? it.unit : null,
      notes: typeof it.notes === "string" ? it.notes : null,
    })),
  }));
}
