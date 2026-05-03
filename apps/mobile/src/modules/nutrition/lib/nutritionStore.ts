/**
 * MMKV-backed storage adapter for the mobile Nutrition module.
 *
 * Mirrors the shape of `apps/web/src/modules/nutrition/lib/*Storage.ts`
 * (Phase 7 / PR 2) but on top of MMKV via `@/lib/storage`. All
 * normalization / mutation logic is delegated to
 * `@sergeant/nutrition-domain` so mobile and web share the exact same
 * `NutritionLog` / `Pantry` / `WaterLog` / `ShoppingList` / `Prefs`
 * semantics — one domain change, both platforms updated.
 *
 * Scope of this file (Phase 7 / PR 3 — Mobile storage foundation):
 *  - `load*` / `save*` functions for every nutrition LS-key
 *  - No hooks, no UI, no AI — those ship with the actual RN screens in
 *    Phase 7 / PR 4+. This PR only stands up the storage plumbing so
 *    upcoming UI PR-s can `import {load*, save*}` without touching
 *    MMKV directly.
 *
 * Cloud-sync note: writes go through `safeWriteLS` which bypasses the
 * JS `localStorage` setItem-patch that the web uses to auto-mark
 * modules dirty. UI layers that need `useCloudSync` parity must either
 * (a) call `enqueueChange(key)` explicitly, or (b) prefer
 * `useSyncedStorage` wrappers. See `docs/mobile/react-native-migration.md`
 * § 6.1 and `apps/mobile/src/sync/config.ts` for the full list of
 * nutrition keys that are already registered in `SYNC_MODULES`.
 */
import {
  NUTRITION_ACTIVE_PANTRY_KEY,
  NUTRITION_LOG_KEY,
  NUTRITION_PANTRIES_KEY,
  NUTRITION_PREFS_KEY,
  SHOPPING_LIST_KEY,
  WATER_LOG_KEY,
  defaultNutritionPrefs,
  makeDefaultPantry,
  normalizeNutritionLog,
  normalizeNutritionPrefs,
  normalizePantries,
  normalizeShoppingList,
  normalizeWaterLog,
  type NutritionLog,
  type NutritionPrefs,
  type Pantry,
  type ShoppingList,
  type WaterLog,
} from "@sergeant/nutrition-domain";

import { safeReadLS, safeReadStringLS, safeWriteLS } from "@/lib/storage";
import { triggerNutritionDualWrite } from "./dualWrite";
import { peekNutritionDualWriteState } from "./dualWriteState";

// ── Log ─────────────────────────────────────────────────────────────

export function loadNutritionLog(): NutritionLog {
  return normalizeNutritionLog(safeReadLS<unknown>(NUTRITION_LOG_KEY, null));
}

export function saveNutritionLog(
  log: NutritionLog | null | undefined,
): boolean {
  const prev = peekNutritionDualWriteState();
  const ok = safeWriteLS(NUTRITION_LOG_KEY, log || {});
  if (ok && prev !== null) {
    triggerNutritionDualWrite(prev, peekNutritionDualWriteState() ?? prev);
  }
  return ok;
}

// ── Prefs ───────────────────────────────────────────────────────────

export function loadNutritionPrefs(): NutritionPrefs {
  return normalizeNutritionPrefs(
    safeReadLS<unknown>(NUTRITION_PREFS_KEY, null),
  );
}

export function saveNutritionPrefs(
  prefs: NutritionPrefs | null | undefined,
): boolean {
  const prev = peekNutritionDualWriteState();
  const ok = safeWriteLS(NUTRITION_PREFS_KEY, prefs || defaultNutritionPrefs());
  if (ok && prev !== null) {
    triggerNutritionDualWrite(prev, peekNutritionDualWriteState() ?? prev);
  }
  return ok;
}

// ── Pantries ────────────────────────────────────────────────────────

export function loadActivePantryId(): string {
  const v = safeReadStringLS(NUTRITION_ACTIVE_PANTRY_KEY, null);
  return v ? String(v) : "home";
}

export function saveActivePantryId(id: string): boolean {
  return safeWriteLS(NUTRITION_ACTIVE_PANTRY_KEY, String(id || "home"));
}

export function loadPantries(): Pantry[] {
  const parsed = safeReadLS<unknown>(NUTRITION_PANTRIES_KEY, null);
  const normalized = normalizePantries(parsed);
  if (normalized.length > 0) return normalized;
  // No pantries yet — seed with default so the UI has something to
  // render on first launch. Matches web behaviour (see
  // `apps/web/src/modules/nutrition/lib/nutritionStorage.ts →
  // loadPantries`).
  const fallback = makeDefaultPantry();
  safeWriteLS(NUTRITION_ACTIVE_PANTRY_KEY, fallback.id);
  return [fallback];
}

export function savePantries(
  pantries: Pantry[] | null | undefined,
  activeId?: string | null,
): boolean {
  const prev = peekNutritionDualWriteState();
  const a = safeWriteLS(
    NUTRITION_PANTRIES_KEY,
    Array.isArray(pantries) ? pantries : [],
  );
  const b = activeId
    ? safeWriteLS(NUTRITION_ACTIVE_PANTRY_KEY, String(activeId))
    : true;
  const ok = a && b;
  if (ok && prev !== null) {
    triggerNutritionDualWrite(prev, peekNutritionDualWriteState() ?? prev);
  }
  return ok;
}

// ── Water ───────────────────────────────────────────────────────────

export function loadWaterLog(): WaterLog {
  return normalizeWaterLog(safeReadLS<unknown>(WATER_LOG_KEY, null));
}

export function saveWaterLog(log: unknown): boolean {
  return safeWriteLS(WATER_LOG_KEY, normalizeWaterLog(log));
}

// ── Shopping list ───────────────────────────────────────────────────

export function loadShoppingList(): ShoppingList {
  return normalizeShoppingList(safeReadLS<unknown>(SHOPPING_LIST_KEY, null));
}

export function saveShoppingList(list: unknown): boolean {
  return safeWriteLS(SHOPPING_LIST_KEY, normalizeShoppingList(list));
}
