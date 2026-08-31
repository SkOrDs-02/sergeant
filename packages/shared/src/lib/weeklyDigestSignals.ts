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
/**
 * `| undefined` у кожній гілці стоїть навмисно. Під `exactOptionalPropertyTypes`
 * (Hard Rule #19) необовʼязкове поле, оголошене як `finyk?: X | null`, приймає
 * відсутність поля або `X | null`, але НЕ приймає явний `undefined` - а саме
 * такий тип приїжджає з `WeeklyDigestRequest` на сервері. Через це
 * `countDigestSignalModules` не збирався взагалі, і локальний typecheck був
 * червоний незалежно від того, що людина щойно правила.
 *
 * Розширення односторонє: сюди лише ЧИТАЮТЬ, тож ширший вхід нічого не ламає
 * у викликачів і не змінює жодного рантайму.
 */
export interface WeeklyModuleSignalInput {
  finyk?: { txCount?: number | null | undefined } | null | undefined;
  fizruk?: { workoutsCount?: number | null | undefined } | null | undefined;
  nutrition?: { daysLogged?: number | null | undefined } | null | undefined;
  routine?: { habitCount?: number | null | undefined } | null | undefined;
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
