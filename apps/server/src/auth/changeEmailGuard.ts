import { APIError, getAuthoritativeSessionFromCtx } from "better-auth/api";

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
 * Рішення власника (a): свіжа сесія + сповіщення на стару адресу.
 *   1. `guardChangeEmailBefore`: сесія старша за `CHANGE_EMAIL_FRESH_MAX_AGE_MS`
 *      → `403 SESSION_NOT_FRESH` ДО ендпоінта. Код і текст ті самі, що в
 *      нативного `freshSessionMiddleware` Better Auth, тож веб уже мапить його
 *      на «Для цієї дії потрібен свіжий вхід» (`mapApiErrorToUserCopy`).
 *   2. `notifyOldEmailAfter`: якщо адресу справді переписано, на СТАРУ
 *      адресу летить лист у ту саму durable-чергу `auth-mail`.
 *
 * Гілку ПІДТВЕРДЖЕНОГО email (лист-підтвердження на стару адресу, зміна
 * лише після кліку) навмисно не чіпаємо: власність над скринькою там доведена,
 * і крадіжка сесії без доступу до пошти нічого не змінює.
 */

/** Скільки живе «свіжість» сесії для зміни email непідтвердженого акаунта. */
export const CHANGE_EMAIL_FRESH_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Ключ, яким before-хук передає after-хуку стару адресу. Обидва хуки
 * отримують ОДИН і той самий `ctx.context` (dispatch.mjs Better Auth), тому
 * мутація вціліє між ними. Лише для непідтверджених акаунтів.
 */
const PENDING_KEY = "__sergeantChangeEmailPending";

interface HookCtx {
  path?: string;
  context?: unknown;
}

interface PendingChange {
  userId: string;
  oldEmail: string;
}

interface AuthCtxLike {
  returned?: unknown;
  internalAdapter?: {
    findUserById: (id: string) => Promise<{ email: string } | null>;
  };
  [PENDING_KEY]?: PendingChange;
}

export async function guardChangeEmailBefore(
  ctx: HookCtx,
  now: () => number = Date.now,
): Promise<void> {
  if (ctx.path !== "/change-email") return;
  const fresh = await getAuthoritativeSessionFromCtx(
    ctx as Parameters<typeof getAuthoritativeSessionFromCtx>[0],
  );
  // Без сесії ендпоінт сам віддасть 401 (`sensitiveSessionMiddleware`).
  if (!fresh?.session) return;
  if (fresh.user.emailVerified === true) return;

  const createdAt = new Date(fresh.session.createdAt).getTime();
  if (
    !Number.isFinite(createdAt) ||
    now() - createdAt >= CHANGE_EMAIL_FRESH_MAX_AGE_MS
  ) {
    throw new APIError("FORBIDDEN", {
      code: "SESSION_NOT_FRESH",
      message: "Session is not fresh",
    });
  }

  const authCtx = ctx.context as AuthCtxLike | undefined;
  if (authCtx) {
    authCtx[PENDING_KEY] = {
      userId: fresh.user.id,
      oldEmail: fresh.user.email,
    };
  }
}

/**
 * `{ status: true }` віддає й гілка «такий email уже зайнятий» (щоб не
 * видавати існування адреси), тож успіх відповіді нічого не доводить. Тому
 * читаємо користувача з БД і шлемо лист лише коли email справді змінився.
 */
export async function notifyOldEmailAfter(ctx: HookCtx): Promise<void> {
  if (ctx.path !== "/change-email") return;
  const authCtx = ctx.context as AuthCtxLike | undefined;
  const pending = authCtx?.[PENDING_KEY];
  if (!authCtx || !pending) return;
  delete authCtx[PENDING_KEY];

  const returned = authCtx.returned;
  if (
    !returned ||
    typeof returned !== "object" ||
    returned instanceof Response ||
    returned instanceof APIError
  ) {
    return;
  }
  const user = await authCtx.internalAdapter?.findUserById(pending.userId);
  if (!user || user.email.toLowerCase() === pending.oldEmail.toLowerCase()) {
    return;
  }
  queueAuthTransactionalEmail({
    kind: "email_change_notice",
    to: pending.oldEmail,
    ...emailChangedNoticeMail(user.email),
  });
}
