import { isApiError } from "@shared/api";

/**
 * Повідомлення, яким `usePushNotifications` відхиляє підписку, коли сервер
 * віддав 200 без `publicKey`. Для людини це той самий стан, що й 503 на
 * `/push/vapid-public`: сервер не налаштований, браузер тут ні до чого.
 */
export const PUSH_VAPID_MISSING_MESSAGE = "VAPID not configured";

export const PUSH_SUBSCRIBE_RETRY_LABEL = "Повторити";

export const PUSH_SUBSCRIBE_ERROR_COPY = {
  unavailable: "Сповіщення тимчасово недоступні. Спробуй пізніше.",
  network: "Не вдалося увімкнути сповіщення, перевір зʼєднання.",
  server: "Сервер тимчасово не відповідає. Спробуй ще раз.",
  browser: "Браузер не зміг увімкнути сповіщення. Спробуй ще раз.",
} as const;

/**
 * Текст тосту для відхиленої підписки на push (ux-33).
 *
 * ЧОМУ РОЗРІЗНЯЄМО. До 2026-11-22 будь-який збій ішов лише в `logger.warn`,
 * і тумблер мовчки повертався у «вимкнено». Людині треба знати, чи це її
 * браузер (push-сервіс, дозвіл, service worker), чи сервер: у першому разі
 * допомагає повтор чи інший браузер, у другому лише час.
 */
export function describePushSubscribeError(err: unknown): string {
  if (isApiError(err)) {
    if (err.kind === "network") return PUSH_SUBSCRIBE_ERROR_COPY.network;
    if (err.status === 503) return PUSH_SUBSCRIBE_ERROR_COPY.unavailable;
    return PUSH_SUBSCRIBE_ERROR_COPY.server;
  }
  if (err instanceof Error && err.message === PUSH_VAPID_MISSING_MESSAGE) {
    return PUSH_SUBSCRIBE_ERROR_COPY.unavailable;
  }
  return PUSH_SUBSCRIBE_ERROR_COPY.browser;
}
