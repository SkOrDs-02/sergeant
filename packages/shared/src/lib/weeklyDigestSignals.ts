/**
 * Скільки модулів дали ЗМІСТОВНИЙ сигнал за тиждень — канон для клієнтського
 * `coachSnapshotSignals` (`apps/web/src/core/insights/useCoachInsight.ts`) і
 * серверного `countDigestSignalModules`
 * (`apps/server/src/modules/digest/weekly-digest.ts`), які до цього рахували
 * той самий поріг двома копіями коду (аудит §2.23).
 *
 * Рахуємо не «поле присутнє», а факт даних: `finyk` у клієнтському знімку
 * НЕ nullable і приходить із нулями навіть тоді, коли транзакцій немає.
 */
export interface WeeklyModuleSignalInput {
  finyk?: { txCount?: number | null } | null;
  fizruk?: { workoutsCount?: number | null } | null;
  nutrition?: { daysLogged?: number | null } | null;
  routine?: { habitCount?: number | null } | null;
}

/**
 * Поріг публікації — канон hub-coach §6.2 «краще мовчати, ніж шуміти».
 * Навмисно мінімальний і безспірний: нуль сигналів — мовчимо. Ширша градація
 * впевненості — окреме продуктове рішення, якого канон поки не дає.
 */
export const MIN_SIGNAL_MODULES = 1;

export function countModuleSignals(data: WeeklyModuleSignalInput): number {
  let signals = 0;
  if ((data.finyk?.txCount ?? 0) > 0) signals++;
  if ((data.fizruk?.workoutsCount ?? 0) > 0) signals++;
  if ((data.nutrition?.daysLogged ?? 0) > 0) signals++;
  if ((data.routine?.habitCount ?? 0) > 0) signals++;
  return signals;
}

export function hasEnoughModuleSignals(
  data: WeeklyModuleSignalInput,
  min: number = MIN_SIGNAL_MODULES,
): boolean {
  return countModuleSignals(data) >= min;
}
