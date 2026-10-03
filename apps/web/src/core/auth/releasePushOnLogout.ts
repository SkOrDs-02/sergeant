/**
 * Last validated: 2026-10-03
 * Status: Active
 *
 * Знімає web-push підписку цього браузера ПЕРЕД виходом з акаунта
 * (аудит 2026-10-01, `priv-04`).
 *
 * AI-DANGER: без цього вихід лишав `push_subscriptions` за користувачем A, і
 * Monobank-вебхук далі слав на цей браузер суму, мерчанта й «доступно <баланс>»
 * — наступній людині на спільному пристрої. Серверний `unregister` вимагає
 * живої сесії, тож викликати це МУСИТЬ `logout()` до `signOut()`; після нього
 * запит дасть 401, а підписка лишиться.
 *
 * Порядок: серверний рядок (він і є джерелом доставки) → локальний
 * `sub.unsubscribe()` → скидання локальної мітки тумблера. Усе best-effort і
 * під таймаутом: вихід не має залежати ні від мережі, ні від `serviceWorker.ready`,
 * який у деяких станах не резолвиться взагалі.
 *
 * AI-DANGER: eager-чанк. Цей файл імпортує `AuthContext`, тож тут НЕ можна
 * мати runtime-імпорт `@sergeant/shared` (білий екран на буті, див.
 * `apps/web/AGENTS.md`). Важкі залежності підтягуємо динамічно.
 */
import { logger } from "@shared/lib";
import { safeRemoveLS } from "@shared/lib/storage/storage";
import { PUSH_SUB_KEY } from "@shared/hooks/pushSubscribedFlag";

/** Скільки чекаємо серверного `unregister`, перш ніж іти далі. */
export const PUSH_UNREGISTER_TIMEOUT_MS = 1500;
/** Загальна стеля всього кроку — вихід не блокується довше. */
export const PUSH_RELEASE_TOTAL_TIMEOUT_MS = 2500;

class PushReleaseTimeoutError extends Error {
  constructor(label: string) {
    super(`${label} timed out`);
  }
}

function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new PushReleaseTimeoutError(label)),
      ms,
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function isWebPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

async function releaseWebPush(): Promise<void> {
  const { getCurrentWebPushSubscription } =
    await import("@shared/hooks/usePushNotifications.webpush");
  const sub = await getCurrentWebPushSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;

  // 1) Серверний рядок — поки сесія жива.
  try {
    const { pushApi } = await import("@shared/api");
    const controller = new AbortController();
    await withTimeout(
      pushApi.unregister(
        { platform: "web", endpoint },
        { signal: controller.signal },
      ),
      PUSH_UNREGISTER_TIMEOUT_MS,
      "push unregister",
    ).catch((err: unknown) => {
      controller.abort();
      throw err;
    });
  } catch (err) {
    logger.warn("[auth.logout] push unregister failed (best-effort)", err);
  }

  // 2) Локальна підписка — навіть якщо сервер не відповів: push-сервіс почне
  // віддавати 410, і сервер сам приб'є рядок на наступній відправці.
  try {
    await sub.unsubscribe();
  } catch (err) {
    logger.warn("[auth.logout] push unsubscribe failed (best-effort)", err);
  }
}

/**
 * Best-effort: ніколи не кидає і не блокує довше за
 * `PUSH_RELEASE_TOTAL_TIMEOUT_MS`. Локальну мітку тумблера скидає завжди, щоб
 * наступний користувач не бачив «увімкнено» для підписки, якої вже немає.
 */
export async function releasePushSubscriptionOnLogout(): Promise<void> {
  try {
    // Build-time guard: у capacitor-білді web-push гілка мертва (DCE).
    if (import.meta.env.VITE_TARGET !== "capacitor" && isWebPushSupported()) {
      await withTimeout(
        releaseWebPush(),
        PUSH_RELEASE_TOTAL_TIMEOUT_MS,
        "push release",
      );
    }
  } catch (err) {
    logger.warn("[auth.logout] push release failed (best-effort)", err);
  } finally {
    safeRemoveLS(PUSH_SUB_KEY);
  }
}
