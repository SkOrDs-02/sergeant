/**
 * Чи завершився хоча б один повний `/v2/sync/pull` для користувача в цій сесії.
 *
 * AI-CONTEXT: локальний кеш SQLite на новому пристрої прогрівається за
 * секунду-дві з ПОРОЖНЬОЇ бази, а перший pull (з пагінованим доганянням) іде
 * пізніше, а офлайн не прийде зовсім. Restore з файлу рахує diff від кеша, тож
 * до першого pull кеш не бачить рядків акаунта: «додати» вважає відсутнім
 * кожен рядок файлу й upsert-ить його з свіжим clientTs, а за LWW старий файл
 * перебиває новіші рядки сервера на всіх пристроях; «замінити» не бачить, що
 * видаляти (аудит 2026-10-01, data-07). Гейт імпорту (`core/hub/
 * hubBackupReadiness.ts`) тому чекає на цей сигнал.
 *
 * Мітка ставиться лише коли pull пройшов до кінця (`next_cursor === null`) і
 * кеші після нього оновлені. Курсор у `sync_op_cursor` для цього не годиться:
 * він пишеться після КОЖНОЇ сторінки (перервана догонка вже лишає `value_int >
 * 0`), а для акаунта без жодного опа не пишеться взагалі.
 *
 * Листовий модуль без залежностей: його імпортують і `syncEngineReader`, і
 * `core/db/sqlite.ts` (скидання на logout), і гейт готовності.
 */

const completed = new Set<string>();

/** Pull для цього користувача дійшов до кінця, кеші оновлено. */
export function markPullCompleted(userId: string): void {
  completed.add(userId);
}

/** Чи був у цій сесії хоча б один повний pull для користувача. */
export function hasCompletedPull(userId: string): boolean {
  return completed.has(userId);
}

/**
 * Скинути мітку: logout стирає локальну базу, тож після повторного входу
 * кеш знову порожній, поки не пройде новий pull. Без аргументу скидає всіх.
 */
export function resetPullCompletion(userId?: string): void {
  if (userId === undefined) completed.clear();
  else completed.delete(userId);
}
