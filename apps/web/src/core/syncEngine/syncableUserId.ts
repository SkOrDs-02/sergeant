/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * Чи можна класти операції цього користувача в `sync_op_outbox`.
 *
 * AI-CONTEXT: `useLocalUserId()` навмисно віддає синтетичний id
 * (`local-anon`), щоб анонімний режим писав у локальний SQLite і
 * переживав релоад. Але `drainSyncOpOutbox`
 * фільтрує чергу по id сесії Better Auth — синтетичний id не збігається
 * з ним НІКОЛИ. Рядок, покладений під таким id, не буде надісланий і не
 * буде прибраний: TTL-збирач `purgeStaleTerminalOutbox` за контрактом
 * відмовляється чіпати `pending`, а `setSqliteUser()` після логіну
 * перемикає партицію на `sergeant-<id>.db`, тож рядок ще й лишається в
 * анонімній базі. Черга росла без межі й без видимості — це і був корінь
 * знахідки «черга синку finyk не дренажиться»
 * (`docs/work/specs/tech-debt/frontend.md`).
 *
 * Тому в аутбокс пускаємо лише реальні id. Локальний запис від цього не
 * страждає — дуал-райт у SQLite відбувається до і незалежно від enqueue.
 *
 * AI-DANGER: список нижче — verbatim-пін синтетичних id. Він НЕ імпортує
 * `useLocalUserId` / `onboardingGate` навмисно: ті модулі тягнуть React і
 * `AuthContext`, а цей файл сидить на write-path кожного дуал-райту
 * (див. коментар про TDZ-краш від зайвого chunk-у в `singleton.ts`).
 * Дрейф констант ловить пін-тест `syncableUserId.test.ts` — якщо додаєш
 * новий синтетичний id, додай його і сюди, інакше тест впаде.
 */

/**
 * Синтетичні id, під якими локальний-first запис дозволений, а
 * постановка в чергу синку — ні.
 *
 * - `local-anon` — `LOCAL_ANON_USER_ID` з `core/auth/useLocalUserId.ts`
 *
 * `demo-local` стояв тут до 2026-09-17 разом із демо-режимом. Його
 * навмисно НЕ прибрано зі списку фізично — див. коментар нижче.
 */
export const NON_SYNCABLE_USER_IDS: readonly string[] = [
  "local-anon",
  // Демо-режим знято 2026-09-17, але id лишається в списку назавжди:
  // на пристроях, що встигли побувати в демо, під ним лежать рядки
  // SQLite. Прибрати його зі списку — означає дозволити тим рядкам
  // потрапити в `sync_op_outbox` і поїхати на сервер як чужі дані.
  "demo-local",
];

const NON_SYNCABLE = new Set(NON_SYNCABLE_USER_IDS);

/**
 * `true`, якщо операції цього користувача можна ставити в
 * `sync_op_outbox`. Порожній рядок і синтетичні локальні id — `false`.
 */
export function isSyncableUserId(userId: string): boolean {
  return userId.length > 0 && !NON_SYNCABLE.has(userId);
}
