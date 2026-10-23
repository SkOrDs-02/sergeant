/**
 * Повторна автентифікація для чутливих дій над акаунтом (рішення власника
 * 2026-10-23, аудит 2026-10-01 `sec-06` і `sec-10`):
 *
 *   - є credential-вхід → поточний пароль обовʼязковий;
 *   - лише OAuth-вхід (пароля немає) → сесія, створена не раніше ніж
 *     `REAUTH_FRESH_MAX_AGE_MS` тому, тобто людина щойно увійшла через
 *     провайдера. Сама жива сесія тут не доказ: її могли вкрасти.
 *
 * Застосовується до `DELETE /api/me` (`routes/me.ts`) і
 * `POST /api/auth/change-email` (`http/changeEmailReauth.ts`). Коди відмов ті
 * самі, що веб уже мапить: `INVALID_PASSWORD` і `SESSION_NOT_FRESH`
 * (`mapApiErrorToUserCopy`).
 */

import type { IncomingHttpHeaders } from "http";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../../auth.js";
import { CHANGE_EMAIL_FRESH_MAX_AGE_MS } from "../../auth/changeEmailGuard.js";
import { verifyAccountPassword } from "./verifyAccountPassword.js";

/** Та сама межа, що й у guard-а change-email (10 хв): одне правило свіжості. */
export const REAUTH_FRESH_MAX_AGE_MS = CHANGE_EMAIL_FRESH_MAX_AGE_MS;

export type ReauthOutcome =
  | { ok: true; method: "password" | "fresh_session" }
  | { ok: false; code: "INVALID_PASSWORD" | "SESSION_NOT_FRESH" };

/** Нечитабельна або відсутня дата створення — не свіжа (fail-closed). */
export function isSessionFresh(createdAt: unknown, now: number): boolean {
  if (
    !(createdAt instanceof Date) &&
    typeof createdAt !== "string" &&
    typeof createdAt !== "number"
  ) {
    return false;
  }
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  return now - created < REAUTH_FRESH_MAX_AGE_MS;
}

/**
 * `createdAt` поточної сесії з БД, в обхід cookie-кешу: свіжість рахуємо від
 * авторитетного рядка, а не від підписаної копії. Cookie і Bearer однаково.
 */
export async function sessionCreatedAtOf(
  headers: IncomingHttpHeaders,
): Promise<unknown> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(headers),
    query: { disableCookieCache: true },
  });
  return session?.session?.createdAt;
}

/**
 * `loadSessionCreatedAt` викликається лише для OAuth-only акаунта: звичайний
 * шлях із паролем зайвого lookup-а сесії не робить.
 */
export async function reauthenticate(
  userId: string,
  password: string | undefined,
  loadSessionCreatedAt: () => Promise<unknown>,
  now: () => number = Date.now,
): Promise<ReauthOutcome> {
  const check = await verifyAccountPassword(userId, password);
  if (!check.ok) return { ok: false, code: "INVALID_PASSWORD" };
  if (check.method !== "no_password") return { ok: true, method: "password" };
  const createdAt = await loadSessionCreatedAt();
  return isSessionFresh(createdAt, now())
    ? { ok: true, method: "fresh_session" }
    : { ok: false, code: "SESSION_NOT_FRESH" };
}
