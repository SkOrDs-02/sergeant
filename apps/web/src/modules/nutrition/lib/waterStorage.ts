/**
 * Last validated: 2026-07-05
 * Status: Active
 * Web I/O-адаптер для журналу води.
 *
 * Pure-логіка (`normalizeWaterLog`, `addWaterMl`, `getTodayWaterMl`,
 * `resetTodayWater`, тип `WaterLog`, ключ `WATER_LOG_KEY`) живе у
 * `@sergeant/nutrition-domain` і спільна з `apps/mobile`. Тут лишаються
 * лише load/save поверх `createModuleStorage`.
 *
 * Dual-write teardown Phase 1 — `loadWaterLog` тепер cache-first: читає
 * з SQLite warm cache (`getCachedNutritionSqliteState`), мирор того ж
 * патерна, що `loadNutritionLog` у `nutritionStorage.ts`. LS лишається
 * лише як write-mirror-фолбек через `persistNutritionWaterLog`, не як
 * джерело правди для читання.
 */
import {
  WATER_LOG_KEY,
  normalizeWaterLog,
  type WaterLog,
} from "@sergeant/nutrition-domain";

import { nutritionStorage } from "./nutritionStorageInstance";
import { persistNutritionWaterLog } from "./nutritionStorage.js";
import { getCachedNutritionSqliteState } from "./sqliteReader.js";

export {
  WATER_LOG_KEY,
  addWaterMl,
  subtractWaterMl,
  getTodayWaterMl,
  normalizeWaterLog,
  resetTodayWater,
} from "@sergeant/nutrition-domain";
export type { WaterLog } from "@sergeant/nutrition-domain";

export function loadWaterLog(_key: string = WATER_LOG_KEY): WaterLog {
  const cache = getCachedNutritionSqliteState();
  if (cache.refreshedAt !== null) return normalizeWaterLog(cache.waterLog);
  // Pre-boot fallback — cache not warm yet, read the LS mirror so the
  // first paint is not empty on a returning user's cold load.
  return normalizeWaterLog(nutritionStorage.readJSON(WATER_LOG_KEY, {}));
}

export function saveWaterLog(
  log: unknown,
  key: string = WATER_LOG_KEY,
): boolean {
  const normalized = normalizeWaterLog(log);
  const ok = nutritionStorage.writeJSON(key, normalized);
  // Mirror to SQLite via the dual-write pipeline. Pre-boot / pre-auth
  // (`isNutritionDualWriteRegistered() === false`) is a no-op inside
  // `persistNutritionWaterLog`, so this is safe to call unconditionally.
  persistNutritionWaterLog(normalized);
  return ok;
}
