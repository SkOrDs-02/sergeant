/**
 * Last validated: 2026-08-18
 * Status: Active
 */
/**
 * Канонічний реєстр «чи є в модулі справжні записи» (web).
 *
 * AI-CONTEXT: FTUX-детекція (`firstRealEntry.ts`) історично сканувала пʼять
 * legacy LS-ключів — `finyk_manual_expenses_v1`, `finyk_tx_cache`,
 * `fizruk_workouts_v1`, `hub_routine_v1`, `nutrition_log_v1`. Усі пʼять
 * tombstone-нуті: кожен модуль дренує свій блоб у SQLite на буті й видаляє
 * ключ, тож для будь-якого post-migration профілю скан читає порожнечу.
 * Наслідок був не косметичний: `hasRealEntry` не флипався ніколи, а отже
 * `hub_first_action_pending_v1` не знімався, FTUX-герой
 * («З чого хочеш почати?» → `PresetSheet`) висів у активної тестерки
 * місяцями, вкладка «Звіти» лишалась замкненою, `first_real_entry` /
 * `first_action_completed` не фаїрились, а TTV не рахувався.
 *
 * AI-DANGER: цей модуль НЕ імпортує модульні SQLite-читачі напряму. Хаб
 * лежить на eager-критичному шляху, а `apps/web/src/modules/**` тягне за
 * собою dual-write-шар і `drizzle-orm` — це рівно той міст, що вибиває
 * бюджет 280 kB (AGENTS.md § Performance budgets). Замість імпорту кожен
 * модуль САМ реєструє свій лічильник із `lib/sqliteReadBoot.ts` — файлу, що
 * вже вантажиться лише у складі відповідного лінивого boot-кластера. Не
 * заміняй реєстрацію статичним імпортом «для простоти».
 */

import type { DashboardModuleId } from "@sergeant/shared";

/** Скільки НЕ-демо записів модуль тримає у своєму канонічному сховищі. */
export type ModuleEntryCounter = () => number;

const counters = new Map<DashboardModuleId, ModuleEntryCounter>();

/**
 * Зареєструвати канонічний лічильник модуля.
 *
 * Викликається на module-scope із `lib/sqliteReadBoot.ts` кожного модуля,
 * тобто рівно тоді, коли його warm-cache взагалі може бути теплим.
 * Ідемпотентна: повторна реєстрація перезаписує попередню.
 */
export function registerRealEntryCounter(
  moduleId: DashboardModuleId,
  counter: ModuleEntryCounter,
): void {
  counters.set(moduleId, counter);
}

/** Test-only: прибрати всі зареєстровані лічильники між специфікаціями. */
export function clearRealEntryCounters(): void {
  counters.clear();
}

/**
 * `ModuleEntryCountProbe` для `@sergeant/shared`-детекторів.
 *
 * Незареєстрований модуль (boot-кластер ще не змонтувався, або модуль
 * вимкнений) повертає `0` — це «немає доказу», а не «записів немає»:
 * shared-шар OR-ить результат із legacy-сканом, тож probe може лише
 * ДОДАТИ доказ. Лічильник, що кинув, теж дає `0` — детекція FTUX не та
 * поверхня, заради якої варто впасти рендеру хаба.
 */
export function webRealEntryProbe(moduleId: DashboardModuleId): number {
  const counter = counters.get(moduleId);
  if (!counter) return 0;
  try {
    return counter();
  } catch {
    return 0;
  }
}
