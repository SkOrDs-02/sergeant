/**
 * Готовність до відновлення з файлу: dual-write контексти зареєстровані, а
 * теплі кеші SQLite прогріті.
 *
 * AI-CONTEXT: restore пише через dual-write, а diff для нього береться від
 * теплого кеша. Доти, доки контекст не зареєстрований (новий пристрій, перші
 * ~10 с буту), `dualWrite*State` повертає `skipped` і нічого не пише, а холодний
 * (порожній) кеш не бачить рядків акаунта: «заміна» мовчки вироджується в
 * злиття, а «додати» перезаписує наявні рядки (аудит 2026-10-01, data-07).
 * Тож UI не пускає в імпорт, а `applyHubBackupPayload` перевіряє ще раз.
 *
 * Контексти й кеші живуть у памʼяті модулів без підписки, тому готовність
 * читається опитуванням (див. `useHubRestoreReady`).
 */
import { getCachedFinykSqliteState } from "../../modules/finyk/lib/sqliteReader";
import { isFinykDualWriteRegistered } from "../../modules/finyk/lib/sqliteWriter/index";
import { getCachedFizrukSqliteState } from "../../modules/fizruk/lib/sqliteReader";
import { isFizrukDualWriteRegistered } from "../../modules/fizruk/lib/sqliteWriter/index";
import { getCachedNutritionSqliteState } from "../../modules/nutrition/lib/sqliteReader";
import { isNutritionDualWriteRegistered } from "../../modules/nutrition/lib/sqliteWriter/index";
import {
  getCachedSqliteCompletions,
  getCachedSqliteRoutineState,
} from "../../modules/routine/lib/sqliteReader";
import { isRoutineDualWriteRegistered } from "../../modules/routine/lib/sqliteWriter/index";

export type HubRestoreModule = "finyk" | "fizruk" | "routine" | "nutrition";

export function isHubRestoreModuleReady(module: HubRestoreModule): boolean {
  switch (module) {
    case "finyk":
      return (
        isFinykDualWriteRegistered() &&
        getCachedFinykSqliteState().refreshedAt !== null
      );
    case "fizruk":
      return (
        isFizrukDualWriteRegistered() &&
        getCachedFizrukSqliteState().refreshedAt !== null
      );
    case "routine":
      return (
        isRoutineDualWriteRegistered() &&
        getCachedSqliteRoutineState().refreshedAt !== null &&
        getCachedSqliteCompletions().refreshedAt !== null
      );
    case "nutrition":
      return (
        isNutritionDualWriteRegistered() &&
        getCachedNutritionSqliteState().refreshedAt !== null
      );
  }
}

const ALL_MODULES: readonly HubRestoreModule[] = [
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
];

/** Усі чотири модулі готові: умова, за якої кнопка імпорту активна. */
export function isHubRestoreReady(): boolean {
  return ALL_MODULES.every(isHubRestoreModuleReady);
}
