// Підпис запитів до `/api/internal/*` для CLI-скриптів (replay-dlq, replay-webhook).
//
// Сервер (`apps/server/src/http/verifyWebhookSignature.ts`) перевіряє
// `X-Signature = hex(HMAC-SHA256(WEBHOOK_HMAC_SECRET, "<X-Timestamp>.<rawBody>"))`
// з `X-Timestamp` у секундах. Відколи прод не стартує без секрета
// (AIP-20260805-B27), непідписаний запит отримує 401 WEBHOOK_HMAC_INVALID, тож
// скрипти мусять підписувати. Без секрета в env підпис не додається: це шлях
// для dev-сервера, де перевірка вимкнена.

import crypto from "node:crypto";

/**
 * Заголовки підпису для вже серіалізованого тіла. Підписується рівно той
 * рядок, що піде в `fetch` як `body`, інакше байти розійдуться.
 *
 * @param {string} bodyText
 * @param {string | undefined} secret
 * @param {() => number} [now] мілісекунди; інʼєктується в тестах
 * @returns {Record<string, string>}
 */
export function internalSignatureHeaders(bodyText, secret, now = Date.now) {
  if (!secret) return {};
  const ts = Math.floor(now() / 1000);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${ts}.`)
    .update(bodyText)
    .digest("hex");
  return { "x-timestamp": String(ts), "x-signature": signature };
}
