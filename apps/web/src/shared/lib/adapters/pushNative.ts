/**
 * Dynamic-import гейт до native push-адаптера з `@sergeant/mobile-shell`.
 *
 * Дзеркало `apps/web/src/shared/lib/bearerToken.ts`: той самий патерн
 * code-split + `isCapacitor()` + try/catch fallback. Навіщо:
 *
 *   1. **Bundle hygiene.** `@capacitor/push-notifications` (і транзитивно
 *      `@capacitor/core`) не потрібні браузерному користувачу — Vite
 *      кладе цю гілку в окремий async chunk, який ніколи не
 *      завантажується у звичайному браузерному сеансі.
 *   2. **Single source of truth.** `usePushNotifications` — єдиний
 *      споживач — завжди ходить через цей хелпер і не знає про
 *      `@sergeant/mobile-shell/pushNative` напряму.
 *   3. **Resilience.** Якщо workspace-лінк з якихось причин зламався
 *      (напр. у тест-білді без `@sergeant/mobile-shell` у графі),
 *      `subscribeNativePush()` повертає `null` і calling-hook
 *      лишається у web-гілці замість кидати на маунті.
 *
 * Реальний модуль — `apps/mobile-shell/src/pushNative.ts`.
 */
import { isCapacitor } from "@sergeant/shared";

export type NativePushPlatform = "ios" | "android";

export interface NativePushSubscription {
  platform: NativePushPlatform;
  token: string;
}

/**
 * Internal module shape, повернутий `import("@sergeant/mobile-shell/pushNative")`.
 * Навмисно тримаємо `unknown`-сумісну сигнатуру: якщо версії розійдуться,
 * `loadPushNative()` поверне `null`, а не дасть TS-помилку в рантаймі.
 */
type PushNativeModule = {
  subscribeNativePush: () => Promise<NativePushSubscription>;
  unsubscribeNativePush: () => Promise<string | null>;
  getStoredNativePushToken: () => Promise<string | null>;
};

async function loadPushNative(): Promise<PushNativeModule | null> {
  if (!isCapacitor()) return null;
  try {
    const mod = (await import("@sergeant/mobile-shell/pushNative")) as
      | PushNativeModule
      | { default?: PushNativeModule };
    if ("subscribeNativePush" in mod) return mod as PushNativeModule;
    return mod.default ?? null;
  } catch {
    return null;
  }
}

/**
 * Запускає native push-реєстрацію (FCM на Android, APNs на iOS). Поза
 * Capacitor завжди `null` (код не завантажується і не виконується).
 * Помилки всередині native-шару (відмова в permission, збій плагіна)
 * пробігають далі — calling-hook вирішує, чи показувати toast.
 */
export async function subscribeNativePush(): Promise<NativePushSubscription | null> {
  const mod = await loadPushNative();
  if (!mod) return null;
  return mod.subscribeNativePush();
}

/**
 * Знімає native push-реєстрацію. Повертає кешований токен (той, що був
 * відправлений у `register`), щоб calling-hook міг прогнати
 * `/api/v1/push/unregister` з правильним ідентифікатором. Поза
 * Capacitor — `null`, без маунту native-плагіна.
 */
export async function unsubscribeNativePush(): Promise<string | null> {
  const mod = await loadPushNative();
  if (!mod) return null;
  try {
    return await mod.unsubscribeNativePush();
  } catch {
    // `unsubscribeNativePush` сам проковтує помилки; якщо щось все ж
    // піднялось — повертаємо null і дозволяємо calling-hook
    // все одно очистити локальний стейт (UX важливіший за перфект-sync).
    return null;
  }
}

/**
 * Читає останній native push-токен зі сховища `@capacitor/preferences`,
 * не запускаючи registration flow. Використовується, щоб на `unsubscribe`
 * без попереднього маунту `subscribe`-а (наприклад, після cold-start-а
 * апки) все одно мати що надіслати на сервер.
 */
export async function getStoredNativePushToken(): Promise<string | null> {
  const mod = await loadPushNative();
  if (!mod) return null;
  try {
    return await mod.getStoredNativePushToken();
  } catch {
    return null;
  }
}
