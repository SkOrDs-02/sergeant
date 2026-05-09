/**
 * Web I/O-адаптер для журналу води.
 *
 * Pure-логіка (`normalizeWaterLog`, `addWaterMl`, `getTodayWaterMl`,
 * `resetTodayWater`, тип `WaterLog`, ключ `WATER_LOG_KEY`) живе у
 * `@sergeant/nutrition-domain` і спільна з `apps/mobile`. Тут лишаються
 * лише load/save поверх `createModuleStorage`.
 *
 * Stage 11 / PR #070n-dualwrite — `saveWaterLog` тепер плюс мирорить
 * нормалізований лог у локальний SQLite через
 * `persistNutritionWaterLog`. LS-write залишається як safety-net до
 * наступного `#057n-tombstone`-кроку для water-log.
 */
import {
  WATER_LOG_KEY,
  normalizeWaterLog,
  type WaterLog,
} from "@sergeant/nutrition-domain";

import { nutritionStorage } from "./nutritionStorageInstance";
import { persistNutritionWaterLog } from "./nutritionStorage.js";

export {
  WATER_LOG_KEY,
  addWaterMl,
  subtractWaterMl,
  getTodayWaterMl,
  normalizeWaterLog,
  resetTodayWater,
} from "@sergeant/nutrition-domain";
export type { WaterLog } from "@sergeant/nutrition-domain";

export function loadWaterLog(key: string = WATER_LOG_KEY): WaterLog {
  return normalizeWaterLog(nutritionStorage.readJSON(key, {}));
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
