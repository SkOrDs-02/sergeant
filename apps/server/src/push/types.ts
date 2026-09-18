/**
 * Типи серверного push-send шляху.
 *
 * `PushPayload` — cross-package контракт, живе у `@sergeant/shared`. Тут його
 * лише ре-експортуємо, щоб всі серверні імпорти тримати у одному місці
 * (`./push/types.js`), а пересунути джерело без dragnet-у по всьому apps/server.
 */

export type { PushPayload } from "@sergeant/shared";

/** Платформи пушу, що підтримуються `sendToUser`. */
export type PushPlatform = "ios" | "android" | "web";

/**
 * Структурований результат `sendToUser(userId, payload)`.
 *
 *   - `delivered` — скільки пушей успішно прийнято upstream-ом per platform.
 *     Для APNs/FCM це 1 на кожен token, що повернув 2xx. Для web — 1 на кожну
 *     підписку, що повернула `outcome: ok`.
 *   - `cleaned` — скільки «мертвих» токенів/підписок ми видалили з БД у цьому
 *     виклику (APNs 410/BadDeviceToken/Unregistered, FCM UNREGISTERED/
 *     INVALID_ARGUMENT, web 404/410).
 *   - `errors`  — per-platform список відмов, які НЕ призвели до cleanup
 *     (транзієнтні 5xx/429 після retry-вичерпання, мережеві помилки,
 *     невідомі reason-и). Caller може показувати, логувати або ігнорувати.
 */
export interface SendToUserResult {
  delivered: { ios: number; android: number; web: number };
  cleaned: number;
  errors: { platform: PushPlatform; reason: string }[];
}
