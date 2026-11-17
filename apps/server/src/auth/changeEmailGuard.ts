import { APIError } from "better-auth/api";
import { Buffer } from "node:buffer";

import { queueAuthTransactionalEmail } from "../email/authTransactionalMail.js";
import { emailChangedNoticeMail } from "./verificationMail.js";

/**
 * Захист `POST /api/auth/change-email` для НЕпідтвердженого акаунта (аудит
 * 2026-10-01, кластер `sec-06`). Живе окремим модулем з тієї ж причини, що й
 * `sessionHardeningHooks.ts`: `auth.ts` упритул до `max-lines`, а тест
 * підключає ці хуки до справжнього `betterAuth()` на memory-адаптері без
 * Postgres (`changeEmailGuard.test.ts`).
 *
 * Проблема. `changeEmail.updateEmailWithoutVerification: true` (потрібен, бо
 * без нього непідтверджений акаунт не змінить адресу взагалі) змушує Better
 * Auth для `emailVerified !== true` одразу переписати email: без пароля, без
 * свіжості сесії і без жодного листа на стару адресу. Вкрадена на хвилину
 * сесія ставала постійним захопленням: атакер міняє email на свій, просить
 * скидання пароля, а `revokeSessionsOnPasswordReset` вибиває власника.
 *
 * ОНОВЛЕННЯ 2026-10-23 (рішення власника): `updateEmailWithoutVerification`
 * вимкнено, тож `/change-email` більше НЕ пише адресу одразу: на нову адресу
 * летить лист-верифікація, і зміна стається лише після кліку (`/verify-email`,
 * `requestType: "change-email-verification"`). Пароль (або свіжу сесію для
 * OAuth-only) і ліміт 3 зміни на добу тримає `http/changeEmailReauth.ts`.
 * Два хуки нижче лишаються запобіжником на випадок, якщо прапорець колись
 * повернуть, а сповіщення старої адреси переїхало на `/verify-email`
 * (`notifyOldEmailAfterVerifyEmailChange`).
 *
 * Рішення власника (a), 2026-10-20: свіжа сесія + сповіщення на стару адресу.
 *   1. `guardChangeEmailUserUpdate`: сесія старша за
 *      `CHANGE_EMAIL_FRESH_MAX_AGE_MS` → `403 SESSION_NOT_FRESH` ДО запису в
 *      БД. Код і текст ті самі, що в нативного `freshSessionMiddleware` Better
 *      Auth, тож веб уже мапить його на «Для цієї дії потрібен свіжий вхід»
 *      (`mapApiErrorToUserCopy`).
 *   2. `notifyOldEmailAfterUserUpdate`: якщо адресу справді переписано, на
 *      СТАРУ адресу летить лист у ту саму durable-чергу `auth-mail`.
 *
 * ЧОМУ `databaseHooks.user.update`, а не `hooks.before`. Глобальний
 * `hooks.before` Better Auth виконує ПЕРШИМ, раніше за before-хуки плагінів
 * (dispatch.mjs, `getHooks`). Плагін `bearer()` підставляє session-куку з
 * `Authorization: Bearer …` саме в своєму before-хуку, тобто вже ПІСЛЯ
 * користувацького: guard у `hooks.before` бачив для Bearer-запиту сесію
 * `null`, мовчки пропускав його, а ендпоінт потім знаходив сесію через
 * підставлену куку й переписував email (перевірка рев'ю: 200, email змінено,
 * лист не пішов; той самий шлях у Capacitor-shell). DB-хук виконується
 * всередині ендпоінта, коли `sensitiveSessionMiddleware` уже визначив сесію
 * незалежно від транспорту (cookie чи Bearer), тож обійти його неможливо.
 *
 * Гілку ПІДТВЕРДЖЕНОГО email (лист-підтвердження на стару адресу, зміна
 * лише після кліку) навмисно не чіпаємо: власність над скринькою там доведена,
 * і крадіжка сесії без доступу до пошти нічого не змінює. Вона не доходить до
 * `updateUserByEmail` у `/change-email`, а запис після кліку йде шляхом
 * `/verify-email`, який хук ігнорує.
 */

/** Скільки живе «свіжість» сесії для зміни email непідтвердженого акаунта. */
export const CHANGE_EMAIL_FRESH_MAX_AGE_MS = 10 * 60 * 1000;

/** Мінімум контексту ендпоінта, який Better Auth передає в DB-хуки. */
interface EndpointCtxLike {
  path?: string;
  context?: {
    session?: {
      session?: { createdAt?: Date | string | number };
      user?: { email?: string; emailVerified?: boolean };
    } | null;
  };
}

/**
 * Сесія, що ініціювала `/change-email`, якщо це зміна email НЕпідтвердженого
 * акаунта; інакше `null` (інший шлях, підтверджений акаунт, виклик без
 * ендпоінта, наприклад серверний `internalAdapter` поза HTTP).
 */
function unverifiedChangeEmailSession(ctx: EndpointCtxLike | null) {
  if (ctx?.path !== "/change-email") return null;
  const session = ctx.context?.session;
  if (!session?.user || session.user.emailVerified === true) return null;
  return session;
}

/**
 * `databaseHooks.user.update.before`. Спрацьовує лише для запису з `email`
 * (`updateUserByEmail` у гілці без верифікації).
 */
export function guardChangeEmailUserUpdate(
  data: Record<string, unknown>,
  ctx: EndpointCtxLike | null,
  now: () => number = Date.now,
): void {
  if (typeof data["email"] !== "string") return;
  const session = unverifiedChangeEmailSession(ctx);
  if (!session) return;

  const createdAt = new Date(
    session.session?.createdAt ?? Number.NaN,
  ).getTime();
  if (
    !Number.isFinite(createdAt) ||
    now() - createdAt >= CHANGE_EMAIL_FRESH_MAX_AGE_MS
  ) {
    throw new APIError("FORBIDDEN", {
      code: "SESSION_NOT_FRESH",
      message: "Session is not fresh",
    });
  }
}

/**
 * `databaseHooks.user.update.after` (Better Auth ставить його в чергу до
 * коміту транзакції, тож лист не піде за відкоченою зміною). Гілка «такий
 * email уже зайнятий» до запису не доходить зовсім, тож хук спрацьовує лише
 * на справжню зміну; порівняння адрес лишається як запобіжник.
 */
export function notifyOldEmailAfterUserUpdate(
  updated: { email?: unknown } | null,
  ctx: EndpointCtxLike | null,
): void {
  const session = unverifiedChangeEmailSession(ctx);
  const oldEmail = session?.user?.email;
  if (!oldEmail || typeof updated?.email !== "string") return;
  if (updated.email.toLowerCase() === oldEmail.toLowerCase()) return;
  queueAuthTransactionalEmail({
    kind: "email_change_notice",
    to: oldEmail,
    ...emailChangedNoticeMail(updated.email),
  });
}

/**
 * Payload токена `/verify-email` без перевірки підпису: хук виконується
 * всередині ендпоінта, який уже звірив підпис (`jwtVerify`) і лише ПІСЛЯ цього
 * пише `user`. Нам потрібні тільки `email` (стара адреса) і `requestType`.
 */
function verifyEmailTokenPayload(
  ctx: { query?: { token?: unknown } } | null,
): { email?: unknown; updateTo?: unknown; requestType?: unknown } | null {
  const token = ctx?.query?.token;
  if (typeof token !== "string") return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json: unknown = JSON.parse(
      Buffer.from(part, "base64url").toString("utf8"),
    );
    return json && typeof json === "object"
      ? (json as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * `databaseHooks.user.update.after` для `/verify-email`: адресу справді
 * перепривʼязано за листом (`change-email-verification`) → на СТАРУ адресу
 * летить те саме сповіщення, що й раніше в гілці `/change-email`. Без цього
 * власник, чий ящик ніколи не був підтверджений, не дізнався б про зміну.
 */
export function notifyOldEmailAfterVerifyEmailChange(
  updated: { email?: unknown } | null,
  ctx: { path?: string; query?: { token?: unknown } } | null,
): void {
  if (ctx?.path !== "/verify-email") return;
  const payload = verifyEmailTokenPayload(ctx);
  if (payload?.requestType !== "change-email-verification") return;
  const oldEmail = payload.email;
  if (typeof oldEmail !== "string" || typeof updated?.email !== "string") {
    return;
  }
  if (updated.email.toLowerCase() === oldEmail.toLowerCase()) return;
  queueAuthTransactionalEmail({
    kind: "email_change_notice",
    to: oldEmail,
    ...emailChangedNoticeMail(updated.email),
  });
}
