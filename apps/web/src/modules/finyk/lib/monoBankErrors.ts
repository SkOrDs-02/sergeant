/**
 * Last validated: 2026-08-24
 * Status: Active
 *
 * «Банк не підключено» — це НЕ помилка завантаження.
 *
 * `useMonobankWebhook.fetchMonth` навмисно реджектить, коли банку немає:
 * резолв у `[]` дозволив би викликачам закешувати порожній місяць, який
 * насправді просто ще не тягнули. Але доти реджект був анонімним
 * (`new Error("monobank not connected")`), тож Аналітика не могла
 * відрізнити «мережа впала» від «людина взагалі не підключала банк» — і
 * малювала червону плашку «Не вдалось завантажити транзакції» користувачу,
 * у якого лише ручні витрати. Плашка не зникала ніколи, бо кожен наступний
 * fetch реджектив із тієї ж причини.
 *
 * Окремий легкий модуль (а не сам хук) — щоб сторінки могли імпортувати
 * тип помилки, не затягуючи в eager-граф увесь webhook-хук із drizzle.
 */

export const MONO_NOT_CONNECTED_MESSAGE = "monobank not connected";

/** Реджект `fetchMonth`, коли банківського підключення просто немає. */
export class MonoNotConnectedError extends Error {
  constructor() {
    super(MONO_NOT_CONNECTED_MESSAGE);
    this.name = "MonoNotConnectedError";
  }
}

/**
 * Чи означає ця помилка «банку немає», а не «завантаження впало».
 *
 * Перевіряємо і за повідомленням: у legacy-тестах і мок-адаптерах
 * `fetchMonth` реджектить голим `new Error("monobank not connected")`.
 */
export function isMonoNotConnectedError(error: unknown): boolean {
  if (error instanceof MonoNotConnectedError) return true;
  return error instanceof Error && error.message === MONO_NOT_CONNECTED_MESSAGE;
}
