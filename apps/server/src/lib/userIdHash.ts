/**
 * `userId` (UUID) обфускація для логів — L10 finding
 * (`docs/security/hardening/L10-user-id-hash-in-logs.md`).
 *
 * Pino вже маскує `email`/`phone`, але raw-`userId` (UUID) досі тікає у
 * Loki/Railway-stdout. Якщо лог-стор колись витече — атакер за UUID-ом
 * матчить будь-який майбутній дамп таблиці `users`. Кращий компроміс:
 *   - У логах публікуємо **тільки** перші 16 hex-символів від
 *     `sha256(userId)`. Цього достатньо для дебагу та кореляції в межах
 *     одного запиту, але непрактично для re-identification без сирого
 *     `userId` (16 hex × 4 bits ≈ 2^64 простір).
 *   - Sentry-трейси та аудит-таблиці продовжують писати raw-`userId` —
 *     там доступ обмежений і PII-policy явно дозволяє ідентифікатор
 *     користувача (див. `apps/server/src/obs/sentry.ts`).
 *
 * Зберігаємо обфускацію детерміністичною (без солі): нам потрібен
 * стабільний токен між запитами, інакше неможливо буде грепати логи за
 * "усіма зверненнями цього користувача". sha256 без солі тут — НЕ
 * криптографія, а PII-decoupling. Це описано в L10/recommendation.
 */

import { createHash } from "node:crypto";

/**
 * Довжина hex-префіксу. 16 hex == 64 біта — досить для унікальності
 * у межах ~10⁹ користувачів (collision-prob < 10⁻⁹), але недостатньо
 * для brute-force-атаки на конкретний UUID без додаткового знання.
 */
export const USER_ID_HASH_HEX_LENGTH = 16;

/**
 * Перевіряє, чи рядок виглядає як `userIdHash`-токен (hex-фіксована
 * довжина). Використовується у тестах і у `mixin()` як guard, щоб
 * не подвійно хешувати вже-захешований `userId`.
 */
export function isUserIdHash(value: string): boolean {
  return value.length === USER_ID_HASH_HEX_LENGTH && /^[0-9a-f]+$/.test(value);
}

/**
 * Повертає 16-символьний hex-prefix `sha256(userId)`. Безпечно
 * викликати для:
 *   - UUID-у будь-якого регістру (sha256 — case-sensitive, але ми
 *     нормалізуємо до lowercase, бо база зберігає UUID в одному стилі);
 *   - вже-захешованого `userId` (повертає той самий hex прокидом —
 *     idempotent у межах того самого input).
 *
 * Ніколи не повертає raw-`userId`. Якщо вхід порожній → повертає
 * `null`, щоб caller-и могли пропустити поле взагалі.
 */
export function hashUserId(userId: string | null | undefined): string | null {
  if (!userId) return null;
  // Normalize: UUID regex case-sensitive, але ми не хочемо двох різних
  // hash-ів для одного й того ж UUID-у написаного у різних регістрах.
  const normalized = userId.toLowerCase();
  if (isUserIdHash(normalized)) return normalized;
  return createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, USER_ID_HASH_HEX_LENGTH);
}
