/**
 * Last validated: 2026-10-05
 * Status: Active
 *
 * Відновлює web-push підписку, яку браузер скинув разом зі знятою реєстрацією
 * Service Worker (rel-12, «Скинути кеш PWA» робить `registration.unregister()`;
 * за Push API підписка живе рівно стільки, скільки реєстрація).
 *
 * AI-CONTEXT: джерело істини про намір користувача — локальна мітка
 * `PUSH_SUB_KEY === "1"` (її ставить увімкнення тумблера і знімають
 * `unsubscribe()` та `releasePushSubscriptionOnLogout`). Якщо мітка стоїть,
 * дозвіл `granted`, а `pushManager.getSubscription()` порожній — підписку
 * втрачено не з волі людини, тож ставимо її заново і реєструємо на сервері
 * (upsert за endpoint). Дозвіл уже виданий, тож жест користувача не потрібен.
 * Без цього після скидання кешу сповіщення мовчки припинялись, а тумблер
 * лишався «увімкненим».
 *
 * AI-DANGER: файл їде в eager-чанк через `RootLayout`, тому тут лише
 * динамічні імпорти важкого (`usePushNotifications.webpush`, `@shared/api`) і
 * жодного runtime-імпорту `@sergeant/shared` (білий екран на буті, див.
 * `apps/web/AGENTS.md`).
 */
import { logger } from "@shared/lib";
import { safeReadStringLS } from "@shared/lib/storage/storage";
import { PUSH_SUB_KEY } from "./pushSubscribedFlag";

export type RestoreWebPushResult =
  "restored" | "not-needed" | "unsupported" | "failed";

function isWebPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

/**
 * Best-effort: ніколи не кидає. Мітку `PUSH_SUB_KEY` при збої не чіпає, щоб
 * наступний старт спробував ще раз (мережа/VAPID можуть бути тимчасово
 * недоступні).
 */
export async function restoreWebPushSubscriptionIfLost(): Promise<RestoreWebPushResult> {
  // Build-time guard: у capacitor-білді web-push гілка мертва (DCE).
  if (import.meta.env.VITE_TARGET === "capacitor") return "unsupported";
  if (!isWebPushSupported()) return "unsupported";
  if (safeReadStringLS(PUSH_SUB_KEY) !== "1") return "not-needed";
  if (Notification.permission !== "granted") return "not-needed";

  try {
    const { getCurrentWebPushSubscription, subscribeToWebPush } =
      await import("./usePushNotifications.webpush");
    const existing = await getCurrentWebPushSubscription();
    if (existing) return "not-needed";

    const { pushApi } = await import("@shared/api");
    const vapid = await pushApi.getVapidPublic();
    if (!vapid?.publicKey) return "failed";
    const { endpoint, p256dh, auth } = await subscribeToWebPush(
      vapid.publicKey,
    );
    await pushApi.register({
      platform: "web",
      token: endpoint,
      keys: { p256dh, auth },
    });
    return "restored";
  } catch (err) {
    logger.warn("[push] restore subscription failed (best-effort)", err);
    return "failed";
  }
}
