/**
 * Dynamic-import гейт до bearer-token-сховища з `@sergeant/mobile-shell`.
 *
 * Навіщо ще один шар замість прямого виклику `@sergeant/mobile-shell/auth-storage`:
 *   1. **Bundle hygiene.** У браузерному бандлі `@capacitor/preferences`
 *      (і native-рантайм Capacitor) не потрібні. Дизайн гарантує, що
 *      модуль з цими імпортами підтягується тільки у гілці `isCapacitor()`
 *      — отже в окремий async-чанк, який ніколи не виконається у
 *      звичайному браузерному сеансі.
 *   2. **Single source of truth.** API-клієнт (`shared/api`), Better-Auth
 *      actions (`core/auth/authClient`) і будь-які майбутні споживачі
 *      (напр. service worker фіч-флаг на native) ходять через один і
 *      той самий хелпер — немає ризику розійтись у поводженні
 *      «веб vs shell».
 *   3. **Resilience.** Якщо модуль `@sergeant/mobile-shell/auth-storage`
 *      з якоїсь причини недоступний (тест-білд без workspace-лінку,
 *      помилка резолву), ми маємо ловити помилку і поводитись як
 *      «немає токена» — замість кидати і ламати API-виклик.
 *
 * Реальний модуль лежить у `apps/mobile-shell/src/auth-storage.ts`.
 */
import { isCapacitor } from "@sergeant/shared";

type AuthStorageModule = {
  getBearerToken: () => Promise<string | null>;
  setBearerToken: (token: string) => Promise<void>;
  clearBearerToken: () => Promise<void>;
};

async function loadStorage(): Promise<AuthStorageModule | null> {
  if (!isCapacitor()) return null;
  try {
    // `/* @vite-ignore */` не треба — це статичний спеціфікатор, Vite
    // розбере його і створить окремий chunk. Але Vite попереджає на
    // пакет, якого формально нема у bundle graph браузерного білду;
    // try/catch ізолює його в рантаймі.
    const mod = (await import("@sergeant/mobile-shell/auth-storage")) as
      | AuthStorageModule
      | { default?: AuthStorageModule };
    return "getBearerToken" in mod
      ? (mod as AuthStorageModule)
      : (mod.default ?? null);
  } catch {
    return null;
  }
}

/**
 * Повертає збережений bearer-токен або `null`. У браузері завжди `null`
 * (ніякого network-запиту, ніякого динамічного імпорта — гілка ранньо
 * виходить по `isCapacitor()`).
 */
export async function getBearerToken(): Promise<string | null> {
  const storage = await loadStorage();
  if (!storage) return null;
  try {
    return await storage.getBearerToken();
  } catch {
    return null;
  }
}

/**
 * Зберігає токен, повернений Better-Auth bearer-плагіном у header
 * `set-auth-token` на sign-in/sign-up. Поза Capacitor — no-op.
 */
export async function setBearerToken(token: string): Promise<void> {
  const storage = await loadStorage();
  if (!storage) return;
  try {
    await storage.setBearerToken(token);
  } catch {
    // Не ламаємо UX-флов логіну через збій нативного сховища —
    // у гіршому сценарії користувач просто перелогиниться наступного старту.
  }
}

/** Видаляє bearer-токен (sign-out або 401 з проcрокою). Поза Capacitor — no-op. */
export async function clearBearerToken(): Promise<void> {
  const storage = await loadStorage();
  if (!storage) return;
  try {
    await storage.clearBearerToken();
  } catch {
    // Якщо сховище вибухло — нічого критичного: next cold-start токен не
    // валідний, сервер поверне 401, UI покаже sign-in.
  }
}
