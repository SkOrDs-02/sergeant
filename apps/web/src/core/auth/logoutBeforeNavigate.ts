import { logger } from "@shared/lib";
import { SIGN_IN_PATH } from "../app/appPaths";
import { clearPinHash } from "../security/lockStorage";

/** Опції `logout()`; опис полів — у JSDoc `AuthContextValue.logout`. */
export interface LogoutOptions {
  skipUnsyncedLossPrompt?: boolean;
  beforeNavigate?: () => Promise<void>;
}

/** Стеля на хук викликача: збій чи завис IndexedDB не має гейтити вихід. */
export const BEFORE_NAVIGATE_TIMEOUT_MS = 3000;

/**
 * Виконує `beforeNavigate` з `logout()` best-effort: виняток логуємо, завис
 * обрізаємо таймаутом. Винесено з `AuthContext.tsx` (Hard Rule #18).
 */
export async function runBeforeNavigate(
  hook: (() => Promise<void>) | undefined,
): Promise<void> {
  if (!hook) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      hook(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, BEFORE_NAVIGATE_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    logger.warn("[auth.logout] beforeNavigate hook failed", err);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * sec-41 (рішення власника 2026-11-21): PIN-креденшел акаунта стирається при
 * БУДЬ-ЯКОМУ виході, а не лише з екрана замка. Інакше на пристрої лишались
 * сіль і PBKDF2-хеш 4-6-значного PIN, який офлайн перебирається за хвилини.
 * `userId === null` (гість) — слот `anon`. Best-effort під тим самим таймаутом,
 * що й хук викликача: збій IndexedDB не має гейтити вихід.
 */
export function clearAppLockOnLogout(userId: string | null): Promise<void> {
  return runBeforeNavigate(() => clearPinHash(userId));
}

/** Кроки `logout()` перед навігацією: стирання PIN (sec-41), далі хук викликача. */
export async function runLogoutHooks(
  userId: string | null,
  hook: (() => Promise<void>) | undefined,
): Promise<void> {
  await clearAppLockOnLogout(userId);
  await runBeforeNavigate(hook);
}

/**
 * Фінальна навігація `logout()` на екран входу (повне вивантаження документа,
 * див. коментар у `logout`). Збій (jsdom: `Not implemented: navigation`, будь-
 * який headless-раннер) не критичний: logout уже завершений, навігація лише
 * прибирає залишковий стан.
 */
export function navigateToSignIn(): void {
  try {
    globalThis.location?.assign(SIGN_IN_PATH);
  } catch (err) {
    logger.warn("[auth.logout] reload after teardown failed", err);
  }
}
