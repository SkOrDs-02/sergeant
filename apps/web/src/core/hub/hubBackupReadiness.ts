/**
 * Готовність до відновлення з файлу: dual-write контексти зареєстровані, теплі
 * кеші SQLite прогріті, а для залогіненого користувача ще й відбувся повний
 * pull з акаунта.
 *
 * AI-CONTEXT: restore пише через dual-write, а diff для нього береться від
 * теплого кеша. Доти, доки контекст не зареєстрований (новий пристрій, перші
 * ~10 с буту), `dualWrite*State` повертає `skipped` і нічого не пише, а холодний
 * (порожній) кеш не бачить рядків акаунта: «заміна» мовчки вироджується в
 * злиття, а «додати» перезаписує наявні рядки (аудит 2026-10-01, data-07).
 * Тож UI не пускає в імпорт, а `applyHubBackupPayload` перевіряє ще раз.
 *
 * «Прогрітий» кеш ≠ «наздогнав акаунт»: `refreshedAt` ставить локальне читання
 * SQLite, а на новому пристрої воно читає порожню базу, поки перший
 * `/v2/sync/pull` ще в дорозі (офлайн його немає зовсім). Diff від такого кеша
 * вважає «відсутнім» кожен рядок файлу, і «додати» перебиває новіші рядки
 * сервера старими версіями з файлу на всіх пристроях, а «замінити» не бачить,
 * що видаляти. Тому для синхронізованого користувача потрібен ще й сигнал
 * «повний pull уже був» (`syncEngine/initialPullState.ts`, той самий прапор,
 * що й у гейта prefs Їжі, data-04). Анонімам (`local-anon`)
 * pull не потрібен.
 *
 * Контексти й кеші живуть у памʼяті модулів без підписки, тому готовність
 * читається опитуванням (див. `useHubRestoreReady`).
 */
import { readActiveSqliteUserId } from "../db/sqlite";
import { hasCompletedInitialPull } from "../syncEngine/initialPullState";
import { isSyncableUserId } from "../syncEngine/syncableUserId";
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

/**
 * Чому імпорт зараз заблокований: `loading` (контекст не зареєстрований чи
 * кеш холодний), `sync` (локально все готово, але повного pull з акаунта ще не
 * було), `null` (можна).
 */
export type HubRestoreBlock = "loading" | "sync" | null;

/**
 * Для залогіненого користувача: чи наздогнала локальна репліка акаунт. Анонім
 * (партиція `anon`, `local-anon`) нічого не тягне, тож для нього `true`.
 */
export function isHubRestoreSynced(): boolean {
  const userId = readActiveSqliteUserId();
  if (!userId || !isSyncableUserId(userId)) return true;
  return hasCompletedInitialPull(userId);
}

function isModuleLocallyReady(module: HubRestoreModule): boolean {
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

export function isHubRestoreModuleReady(module: HubRestoreModule): boolean {
  return isModuleLocallyReady(module) && isHubRestoreSynced();
}

/** Причина блокування для окремого модуля (текст помилки restore). */
export function getHubRestoreModuleBlock(
  module: HubRestoreModule,
): HubRestoreBlock {
  if (!isModuleLocallyReady(module)) return "loading";
  return isHubRestoreSynced() ? null : "sync";
}

const ALL_MODULES: readonly HubRestoreModule[] = [
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
];

/** Причина блокування кнопки імпорту, або `null`, коли імпорт можна. */
export function getHubRestoreBlock(): HubRestoreBlock {
  if (!ALL_MODULES.every(isModuleLocallyReady)) return "loading";
  return isHubRestoreSynced() ? null : "sync";
}

/** Усі чотири модулі готові: умова, за якої кнопка імпорту активна. */
export function isHubRestoreReady(): boolean {
  return getHubRestoreBlock() === null;
}
