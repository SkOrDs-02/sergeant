/**
 * Web I/O-адаптер для модуля Харчування: prefs, pantries, log.
 *
 * Stage 8 PR #057n-tombstone (`docs/planning/storage-roadmap.md`): the
 * `load*` / `persist*` helpers below no longer touch `localStorage`.
 * The SQLite-WASM `nutrition_*` tables are the source of truth — reads
 * pull from the in-process cache populated by
 * `refreshNutritionSqliteState` (warmed at boot), and writes go through
 * the dual-write pipeline (`triggerNutritionDualWrite`) which mirrors
 * to SQLite and bumps the cache so subsequent reads see the change.
 *
 * Pure-логіка (normalize/default/mutation-хелпери + типи + LS-ключі) живе
 * у `@sergeant/nutrition-domain` і спільна з `apps/mobile`. Реекспорти
 * старої поверхні цього модуля лишаються тут, щоб існуючі
 * `../lib/nutritionStorage.js` імпорти всередині `apps/web` не довелось
 * переписувати.
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

import {
  isNutritionDualWriteRegistered,
  triggerNutritionDualWrite,
  type NutritionDualWriteState,
} from "./dualWrite/index.js";
import type {
  NutritionMealSnapshot,
  NutritionPantrySnapshot,
} from "./dualWrite/diff.js";
import { getCachedNutritionSqliteState } from "./sqliteReader.js";

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
// Reads — backed by the SQLite warm cache (Stage 8 PR #057n-tombstone).
//
// Before the boot completes the cache returns its `EMPTY_CACHE`
// defaults; the hooks pair these synchronous reads with an overlay
// effect that re-renders once the cache warms (see `sqliteReadGate`).
// ─────────────────────────────────────────────

export function loadNutritionPrefs(
  _key: string = NUTRITION_PREFS_KEY,
): NutritionPrefs {
  const cache = getCachedNutritionSqliteState();
  return cache.prefs
    ? normalizeNutritionPrefs(cache.prefs)
    : defaultNutritionPrefs();
}

export function persistNutritionPrefs(
  prefs: NutritionPrefs | null | undefined,
  _key: string = NUTRITION_PREFS_KEY,
): boolean {
  const prev = peekNutritionDualWriteState();
  if (prev === null) return true;
  const next: NutritionDualWriteState = {
    ...prev,
    prefs: {
      prefsJson: JSON.stringify(prefs || defaultNutritionPrefs()),
      activePantryId: prev.prefs?.activePantryId ?? null,
    },
  };
  triggerNutritionDualWrite(prev, next);
  return true;
}

export function loadActivePantryId(
  _activeKey: string = NUTRITION_ACTIVE_PANTRY_KEY,
): string {
  const cache = getCachedNutritionSqliteState();
  return cache.activePantryId ?? "home";
}

export function loadPantries(
  _key: string = NUTRITION_PANTRIES_KEY,
  _activeKey: string = NUTRITION_ACTIVE_PANTRY_KEY,
): Pantry[] {
  const cache = getCachedNutritionSqliteState();
  if (cache.pantries.length > 0) return cache.pantries;

  // No SQLite-side pantries (fresh user, or boot not yet complete).
  // The hook's first paint gets a single default `home` pantry — the
  // first user mutation will dual-write the row to SQLite via
  // `persistPantries` below.
  return [makeDefaultPantry()];
}

export function persistPantries(
  _key: string = NUTRITION_PANTRIES_KEY,
  _activeKey: string = NUTRITION_ACTIVE_PANTRY_KEY,
  pantries?: Pantry[] | null,
  activeId?: string | null,
): boolean {
  const prev = peekNutritionDualWriteState();
  if (prev === null) return true;
  const nextPantries: Pantry[] = Array.isArray(pantries) ? pantries : [];
  const nextActive: string | null = activeId ? String(activeId) : null;
  const next: NutritionDualWriteState = {
    ...prev,
    pantries: extractPantrySnapshots(nextPantries),
    prefs: {
      prefsJson:
        prev.prefs?.prefsJson ?? JSON.stringify(defaultNutritionPrefs()),
      activePantryId: nextActive ?? prev.prefs?.activePantryId ?? null,
    },
  };
  triggerNutritionDualWrite(prev, next);
  return true;
}

export function loadNutritionLog(
  _key: string = NUTRITION_LOG_KEY,
): NutritionLog {
  const cache = getCachedNutritionSqliteState();
  return normalizeNutritionLog(cache.log);
}

export function persistNutritionLog(
  log: NutritionLog | null | undefined,
  _key: string = NUTRITION_LOG_KEY,
): boolean {
  const prev = peekNutritionDualWriteState();
  if (prev === null) return true;
  const next: NutritionDualWriteState = {
    ...prev,
    meals: extractMealSnapshots(normalizeNutritionLog(log ?? {})),
  };
  triggerNutritionDualWrite(prev, next);
  return true;
}

// ─────────────────────────────────────────────
// Dual-write state extraction (Stage 4 PR #032; rewired by
// PR #057n-tombstone to peek the SQLite warm cache instead of LS).
//
// Returns `null` when no dual-write context is registered — the
// write call sites use this as a fast-path gate so we never enqueue
// SQLite ops pre-auth.
//
// Recipes are intentionally excluded on web: they live in IndexedDB
// (`recipeBook.ts`) rather than LS, so they are not yet wired into the
// state extractor here. The diff/adapter still support recipes; the
// IDB-backed path will be wired in a follow-up.
// ─────────────────────────────────────────────

function peekNutritionDualWriteState(): NutritionDualWriteState | null {
  if (!isNutritionDualWriteRegistered()) return null;
  try {
    const cache = getCachedNutritionSqliteState();
    const prefs = cache.prefs ?? defaultNutritionPrefs();
    return {
      meals: extractMealSnapshots(normalizeNutritionLog(cache.log)),
      pantries: extractPantrySnapshots(normalizePantries(cache.pantries)),
      prefs: {
        prefsJson: JSON.stringify(prefs),
        activePantryId: cache.activePantryId ?? null,
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
