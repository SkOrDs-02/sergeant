/**
 * Last validated: 2026-10-23
 * Status: Active
 *
 * Маркер «сесія завершилась без кнопки «Вийти»» (аудит 2026-10-01, `sec-18`).
 *
 * AI-CONTEXT: 401 на `/api/v1/me` (протухла чи відкликана сесія) запускає
 * identity-wipe: user → anon, teardown локальних плоских ключів і reload.
 * Після reload пристрій вже «анонімний» (власник чату став `__anon__`), тож
 * застосунок показував анонімний хаб без жодного пояснення, а дані людини в
 * її SQLite-партиції виглядали втраченими. Маркер ставиться ПІСЛЯ teardown і
 * ПЕРЕД reload й каже оболонці: «тут був акаунт, веди на повторний вхід».
 * Свідомий вихід (`logout()`) маркер не ставить, а знімає.
 *
 * Знімається: успішним входом (`status === "authenticated"`), свідомим
 * виходом і вибором «Поки що пропустити» на екрані входу.
 *
 * Сховище, як у `pendingSignOut.ts`: ключ НЕ під префіксом allowlist-а
 * `purgeAppOwnedLocalData` (`auth_`), адаптер `resolveLsStore` (синхронний
 * запис, переживає reload), кожен доступ у try/catch.
 *
 * AI-DANGER: eager-чанк (імпортується з `AuthContext`). Жодних runtime-
 * імпортів `@sergeant/shared`: білий екран на буті, див. `apps/web/AGENTS.md`.
 */
import { logger } from "@shared/lib";
import { resolveLsStore } from "@shared/lib/storage/storage";

export const SESSION_EXPIRED_KEY = "auth_session_expired_v1";

export function hasSessionExpiredMarker(): boolean {
  try {
    return resolveLsStore()?.getString(SESSION_EXPIRED_KEY) != null;
  } catch {
    return false;
  }
}

export function markSessionExpired(): void {
  try {
    resolveLsStore()?.setString(SESSION_EXPIRED_KEY, "1");
  } catch (err) {
    logger.warn("[auth.sessionExpired] mark failed", err);
  }
}

export function clearSessionExpired(): void {
  try {
    resolveLsStore()?.remove(SESSION_EXPIRED_KEY);
  } catch (err) {
    logger.warn("[auth.sessionExpired] clear failed", err);
  }
}
