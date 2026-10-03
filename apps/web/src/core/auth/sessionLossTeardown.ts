import { swClearCaches, swSetActiveUser } from "../app/swControl";
import { logger } from "@shared/lib";

/**
 * priv-02: клієнтський teardown для сесії, що закінчилась БЕЗ кнопки «Вийти»
 * (протухла, відкликана, зник cookie) або змінилась на іншого користувача.
 *
 * Те саме, що `logout()` робить для локальних даних (allowlist-purge,
 * SW-кеші, активний користувач SW) — інакше наступна людина на спільному
 * пристрої бачить плоскі ключі попередньої (банк памʼяті з фактами про
 * здоровʼя, біометрія, e-mail, тариф), а перша ж її правка заливає їх у
 * її серверний профіль.
 *
 * AI-DANGER: SQLite-партицію попереднього користувача тут НЕ стираємо
 * (`wipeSqliteDb` лишається привілеєм `logout()`). Без сесії доставити чергу
 * синхронізації неможливо, тож стирання знищило б недоставлені записи.
 * Партиція per-user, новому користувачу вона не видна; її стирання окремо
 * (priv-05). Тому ж не викликай це на `unavailable`/`pending_deletion`:
 * там сесія жива або особистість невідома.
 *
 * Кожен крок у власному try/catch і ніколи не кидає: викликач після нього
 * робить `reload`, який teardown не має права заблокувати.
 */
export async function teardownLocalStateAfterSessionLoss(): Promise<void> {
  try {
    const { purgeAppOwnedLocalData } =
      await import("../../shared/lib/storage/purgeLocalData");
    await purgeAppOwnedLocalData();
  } catch (err) {
    logger.warn("[auth.sessionLoss] local-first data purge failed", err);
  }
  try {
    await swClearCaches();
  } catch (err) {
    logger.warn("[auth.sessionLoss] swClearCaches failed", err);
  }
  try {
    await swSetActiveUser(null);
  } catch (err) {
    logger.warn("[auth.sessionLoss] swSetActiveUser(null) failed", err);
  }
}
