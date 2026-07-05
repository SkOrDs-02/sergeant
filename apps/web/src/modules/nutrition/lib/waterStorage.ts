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
 * Dual-write teardown Phase 3 — SQLite is the sole source of truth.
 * `loadWaterLog` reads the SQLite warm cache (`getCachedNutritionSqliteState`);
 * `saveWaterLog` writes only via the dual-write pipeline
 * (`persistNutritionWaterLog`). The LS mirror (read fallback + write) was
 * removed — no prod users, so an empty first paint before the cache warms
 * is acceptable (R9).
 */
import {
  WATER_LOG_KEY,
  normalizeWaterLog,
  type WaterLog,
} from "@sergeant/nutrition-domain";

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
  // SQLite-only: before the warm cache lands, first paint is an empty log
  // and the overlay fills in once it warms (R9, no LS fallback).
  return normalizeWaterLog(cache.refreshedAt !== null ? cache.waterLog : {});
}

export function saveWaterLog(
  log: unknown,
  _key: string = WATER_LOG_KEY,
): boolean {
  const normalized = normalizeWaterLog(log);
  // SQLite-only write via the dual-write pipeline. Pre-boot / pre-auth is a
  // no-op inside `persistNutritionWaterLog`.
  return persistNutritionWaterLog(normalized);
}
