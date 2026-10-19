/**
 * Порядок модулів, hue свотча й факт дня: спільне для панелі модулів хаба
 * (`core/hub/ModulePanel`) і аркуша «Модулі» в шапці модуля
 * (`shared/components/layout/ModuleSwitcherSheet`). Живе в shared, щоб
 * шапка не тягнула core і `MODULE_CONFIGS` у свій чанк.
 *
 * Last validated: 2026-10-19
 * Status: Active
 */
import {
  STORAGE_KEYS,
  getActiveModules,
  selectModulePreview,
  type ModulePreview,
} from "@sergeant/shared";
import { safeReadStringLS, webKVStore } from "@shared/lib/storage/storage";
import { isFinykBalanceHidden, maskAmount } from "@finyk/lib/balanceVisibility";
import type { HubModuleId } from "./hubNav";

export const MODULE_ORDER: readonly HubModuleId[] = [
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
];

export const MODULE_HUE: Record<HubModuleId, string> = {
  finyk: "bg-chart-finyk",
  fizruk: "bg-chart-fizruk",
  routine: "bg-chart-routine",
  nutrition: "bg-chart-nutrition",
};

const QUICK_STATS_KEY: Record<HubModuleId, string> = {
  finyk: STORAGE_KEYS.FINYK_QUICK_STATS,
  fizruk: STORAGE_KEYS.FIZRUK_QUICK_STATS,
  routine: STORAGE_KEYS.ROUTINE_QUICK_STATS,
  nutrition: STORAGE_KEYS.NUTRITION_QUICK_STATS,
};

export function readModulePreview(id: HubModuleId): ModulePreview {
  return selectModulePreview(id, safeReadStringLS(QUICK_STATS_KEY[id]));
}

/** Значення дня модуля для рядка панелі й аркуша (`null` = даних немає). */
export function readModuleFact(
  id: HubModuleId,
  preview: ModulePreview = readModulePreview(id),
  balanceHidden: boolean = isFinykBalanceHidden(),
): string | null {
  if (preview.main === null) return null;
  return id === "finyk"
    ? maskAmount(preview.main, balanceHidden)
    : preview.main;
}

/** Модулі, увімкнені в налаштуваннях дашборда (те саме джерело, що й хаб). */
export function readActiveModules(): readonly string[] {
  return getActiveModules(webKVStore);
}
