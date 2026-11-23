import { isApiError } from "@shared/api";
import { coreMessages } from "@shared/i18n/uk.core";

/**
 * Повідомлення, яким `usePushNotifications` відхиляє підписку, коли сервер
 * віддав 200 без `publicKey`. Для людини це той самий стан, що й 503 на
 * `/push/vapid-public`: сервер не налаштований, браузер тут ні до чого.
 */
export const PUSH_VAPID_MISSING_MESSAGE = "VAPID not configured";

const copy = coreMessages.pushSubscribe;

/**
 * Текст тосту для відхиленої підписки на push (ux-33).
 *
 * ЧОМУ РОЗРІЗНЯЄМО. До 2026-11-22 будь-який збій ішов лише в `logger.warn`,
 * і тумблер мовчки повертався у «вимкнено». Людині треба знати, чи це її
 * браузер (push-сервіс, дозвіл, service worker), чи сервер: у першому разі
 * допомагає повтор чи інший браузер, у другому лише час. Самі рядки живуть
 * у каталозі (`coreMessages.pushSubscribe`), не тут.
 */
export function describePushSubscribeError(err: unknown): string {
  if (isApiError(err)) {
    if (err.kind === "network") return copy.network;
    if (err.status === 503) return copy.unavailable;
    return copy.server;
  }
  if (err instanceof Error && err.message === PUSH_VAPID_MISSING_MESSAGE) {
    return copy.unavailable;
  }
  return copy.browser;
}
