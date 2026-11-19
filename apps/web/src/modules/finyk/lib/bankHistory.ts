/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Дві синхронні відповіді про банківську історію для хаба (картка фактів
 * банку, хаб новачка). Працюють поза змонтованим модулем Фініка, як і
 * `useFinykDueCharges`: читають SQLite-дзеркало Monobank (видима частина,
 * без прихованих карток) і localStorage; мережі й нових запитів немає.
 */
import { STORAGE_KEYS } from "@sergeant/shared";
import {
  safeReadLS,
  safeRemoveLS,
  safeWriteLS,
} from "@shared/lib/storage/storage";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { getVisibleFinykMonoMirrorState } from "./monoMirrorReader";

function isValidMs(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * Мс поточного підключення Monobank на цьому акаунті; `null` = не підключено
 * або невідомо.
 *
 * Джерела за пріоритетом:
 *   1. `connectedAt` з `GET /api/mono/sync-state` (`mono_connection.created_at`).
 *      Коли відповідь приходить, `applyMonoServerConnectedAt` кладе значення
 *      в ту саму мітку localStorage, тож воно переживає перезавантаження і
 *      читається синхронно, без мережі.
 *   2. Локальна мітка з успішного `connect` на цьому пристрої
 *      (`recordMonoFirstConnectedAt`): запасний шлях, поки сервер, старший за
 *      2026-11-18, поля не віддає, або поки sync-state ще не відповів.
 *
 * Межа: без жодного джерела `null`, сурогатів на кшталт «найраніша операція»
 * немає свідомо.
 */
export function getMonoFirstConnectedAt(): number | null {
  const raw = safeReadLS<unknown>(STORAGE_KEYS.FINYK_MONO_FIRST_CONNECTED_AT);
  return isValidMs(raw) ? raw : null;
}

/**
 * Приймає `connectedAt` зі стану синку Monobank:
 *   - `undefined` — сервер поля не знає (старий бекенд) або стан ще не
 *     прийшов: нічого не міняємо, лишається локальна мітка;
 *   - `null` — сервер каже, що підключення немає: мітку знімаємо (відключили,
 *     можливо, з іншого пристрою);
 *   - ISO-рядок — серверне значення перекриває локальне.
 * Нерозбірний рядок ігнорується: зіпсована відповідь не має права стерти мітку.
 */
export function applyMonoServerConnectedAt(
  connectedAt: string | null | undefined,
): void {
  if (connectedAt === undefined) return;
  if (connectedAt === null) {
    clearMonoFirstConnectedAt();
    return;
  }
  const ms = Date.parse(connectedAt);
  if (!isValidMs(ms)) return;
  if (getMonoFirstConnectedAt() === ms) return;
  safeWriteLS(STORAGE_KEYS.FINYK_MONO_FIRST_CONNECTED_AT, ms);
}

/** Пише мітку першого підключення; повторне підключення її не зсуває. */
export function recordMonoFirstConnectedAt(nowMs: number = Date.now()): void {
  if (getMonoFirstConnectedAt() !== null) return;
  if (!isValidMs(nowMs)) return;
  safeWriteLS(STORAGE_KEYS.FINYK_MONO_FIRST_CONNECTED_AT, Math.floor(nowMs));
}

/** Знімає мітку (відключення Monobank). */
export function clearMonoFirstConnectedAt(): void {
  safeRemoveLS(STORAGE_KEYS.FINYK_MONO_FIRST_CONNECTED_AT);
}

/**
 * День-ключ (`YYYY-MM-DD`, київська доба) початку покриття дзеркала банку;
 * `null` = дзеркало порожнє.
 *
 * Це НИЖНЯ ОЦІНКА суцільності, а не знання про бекфіл: клієнт не знає, які
 * вікна Ф-3 дотягнуті, тож повертається день найранішої операції в дзеркалі
 * (порядок операцій не важливий). Рахунок без операцій на початку вікна дасть
 * пізнішу дату, ніж справжня межа покриття.
 */
export function getFinykBankHistoryStart(): string | null {
  let earliest = Number.POSITIVE_INFINITY;
  for (const tx of getVisibleFinykMonoMirrorState().transactions) {
    if (Number.isFinite(tx.time) && tx.time < earliest) earliest = tx.time;
  }
  return Number.isFinite(earliest) ? getKyivDayKey(earliest * 1000) : null;
}
