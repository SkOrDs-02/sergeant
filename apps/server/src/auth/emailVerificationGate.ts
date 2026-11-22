import { createHash } from "node:crypto";

import { APIError, createEmailVerificationToken } from "better-auth/api";

import { queueAuthTransactionalEmail } from "../email/authTransactionalMail.js";
import { logger } from "../obs/logger.js";
import { accountExistsMail } from "./verificationMail.js";

/**
 * sec-46 / priv-29 (рішення власника 2026-11-21): реєстрація не розкриває,
 * чи існує акаунт з цим email.
 *
 * Better Auth відповідає нейтрально на зайняту адресу лише тоді, коли сам
 * sign-up не видає сесію (`autoSignIn: false` чи `requireEmailVerification`,
 * `dist/api/routes/sign-up.mjs`): інакше нова адреса дає сесію, а зайнята ні,
 * і різниця сама є відповіддю. Тому нейтральна реєстрація тягне за собою
 * обовʼязкове підтвердження email, а глобальне `REQUIRE_EMAIL_VERIFICATION`
 * залочило б усі старі непідтверджені акаунти.
 *
 * Звідси межа `EMAIL_VERIFICATION_REQUIRED_FROM`:
 *   - реєстрація не логінить і для нової, і для зайнятої адреси відповідає
 *     однаковим 200 `{ token: null, user }`; власник зайнятої адреси
 *     отримує лист «у тебе вже є акаунт»;
 *   - вхід email+паролем для акаунта, створеного НЕ раніше межі, без
 *     `emailVerified` дає 403 `EMAIL_NOT_VERIFIED` і повторно шле лист
 *     підтвердження; старі акаунти входять як і раніше, міграції немає;
 *   - клік у листі підтвердження сам відкриває сесію
 *     (`autoSignInAfterVerification`).
 *
 * Не задано = вимкнено, поведінка до sec-46 без змін. Межа в майбутньому
 * вмикає нейтральну реєстрацію одразу (опції Better Auth статичні), а
 * гейт входу лише з моменту межі; тому власник ставить дату деплою.
 */

/**
 * Один лист «у тебе вже є акаунт» чи повторне підтвердження на адресу за
 * вікно. Інакше будь-хто, хто знає адресу, засипав би її листами повторними
 * реєстраціями (5 на хвилину на IP). Памʼять процесу: інстанс API один, а
 * після рестарту зайвий лист нешкідливий.
 */
export const MAIL_THROTTLE_WINDOW_MS = 15 * 60 * 1000;
export const MAIL_THROTTLE_MAX_KEYS = 10_000;
/** Порядок вставки = порядок часу: ключ перевставляється на кожен лист. */
const lastMailAt = new Map<string, number>();

function emailFingerprint(email: string): string {
  return createHash("sha256")
    .update(email.toLowerCase(), "utf8")
    .digest("hex")
    .slice(0, 12);
}

/** `true`, якщо лист цього виду на цю адресу можна слати зараз. */
export function takeMailSlot(
  kind: string,
  email: string,
  now: number = Date.now(),
): boolean {
  const key = `${kind}:${emailFingerprint(email)}`;
  const last = lastMailAt.get(key);
  if (last !== undefined && now - last < MAIL_THROTTLE_WINDOW_MS) return false;
  lastMailAt.delete(key);
  // Витісняємо найстаріші слоти, а не всі разом: колись тут був `clear()`,
  // і флуд з 10 000 нових адрес обнуляв троттл кожної, тож жертву знову
  // можна було засипати листами (sec-46, ревʼю PR).
  for (const k of lastMailAt.keys()) {
    if (lastMailAt.size < MAIL_THROTTLE_MAX_KEYS) break;
    lastMailAt.delete(k);
  }
  lastMailAt.set(key, now);
  return true;
}

/** Лише для тестів. */
export function resetMailThrottleForTests(): void {
  lastMailAt.clear();
}

interface GateUser {
  id?: unknown;
  email?: unknown;
  emailVerified?: unknown;
  createdAt?: unknown;
}

/**
 * Чи потрібне підтвердження email для входу. Невідомий `createdAt`
 * трактуємо як новий акаунт (fail-closed): у таблиці `user` колонка
 * NOT NULL, тож це лише захист від битих даних.
 */
export function requiresVerifiedEmail(
  user: GateUser,
  cutoff: Date | undefined,
): boolean {
  if (!cutoff) return false;
  if (user.emailVerified === true) return false;
  const created =
    user.createdAt instanceof Date
      ? user.createdAt
      : new Date(String(user.createdAt));
  if (Number.isNaN(created.getTime())) return true;
  return created.getTime() >= cutoff.getTime();
}

/**
 * Мінімальна форма `GenericEndpointContext`, яку Better Auth передає в
 * `databaseHooks.session.create.before`.
 */
export interface SessionHookContext {
  path?: string | undefined;
  request?: Request | undefined;
  context?:
    | {
        secret?: string | undefined;
        baseURL?: string | undefined;
        internalAdapter?:
          | { findUserById: (id: string) => Promise<GateUser | null> }
          | undefined;
        options?:
          | {
              emailVerification?:
                | {
                    expiresIn?: number | undefined;
                    sendVerificationEmail?:
                      | ((
                          data: { user: never; url: string; token: string },
                          request?: Request,
                        ) => Promise<void>)
                      | undefined;
                  }
                | undefined;
            }
          | undefined;
      }
    | undefined;
}

async function resendVerification(
  user: GateUser & { id: string; email: string },
  ctx: NonNullable<SessionHookContext["context"]>,
  request: Request | undefined,
): Promise<void> {
  const send = ctx.options?.emailVerification?.sendVerificationEmail;
  if (!send || !ctx.secret || !ctx.baseURL) return;
  if (!takeMailSlot("verify_on_sign_in", user.email)) return;
  const token = await createEmailVerificationToken(
    ctx.secret,
    user.email,
    undefined,
    ctx.options?.emailVerification?.expiresIn,
    { userId: user.id },
  );
  // `callbackURL` перезапише `verificationMail()` на web-origin.
  const url = `${ctx.baseURL}/verify-email?token=${token}&callbackURL=%2F`;
  await send({ user: user as never, url, token }, request);
}

/**
 * Гейт входу для `databaseHooks.session.create.before`. Стоїть саме тут, а
 * не в `hooks.before`: хук сесії Better Auth викликає вже ПІСЛЯ перевірки
 * пароля (`sign-in.mjs`), тож 403 бачить лише той, хто знає пароль, і
 * енумерації входу це не відкриває.
 *
 * Лише `/sign-in/email`: соцвхід приходить із підтвердженою адресою,
 * `/verify-email` ставить `emailVerified` до створення сесії, а
 * `/sign-up/email` при активній межі сесії не створює взагалі.
 */
export async function guardEmailVerifiedSignIn(
  data: { userId?: unknown },
  context: SessionHookContext | null | undefined,
  cutoff: Date | undefined,
): Promise<void> {
  if (!cutoff || context?.path !== "/sign-in/email") return;
  const ctx = context.context;
  const userId = data.userId;
  if (typeof userId !== "string" || !ctx?.internalAdapter) return;
  const user = await ctx.internalAdapter.findUserById(userId);
  if (!user || !requiresVerifiedEmail(user, cutoff)) return;
  if (typeof user.email === "string") {
    try {
      await resendVerification(
        { ...user, id: userId, email: user.email },
        ctx,
        context.request,
      );
    } catch (err) {
      logger.error(
        {
          event: "auth.sign_in.verify_resend_error",
          email_hash: emailFingerprint(user.email),
          err: err instanceof Error ? err.message : String(err),
        },
        "resending the verification email on a blocked sign-in failed",
      );
    }
  }
  throw new APIError("FORBIDDEN", {
    code: "EMAIL_NOT_VERIFIED",
    message: "Email not verified",
  });
}

/** `emailAndPassword.onExistingUserSignUp`: лист власнику зайнятої адреси. */
export async function notifyExistingUserSignUp({
  user,
}: {
  user: { email: string };
}): Promise<void> {
  if (!takeMailSlot("account_exists", user.email)) {
    logger.info(
      {
        event: "auth.sign_up.existing_email.throttled",
        email_hash: emailFingerprint(user.email),
      },
      "account-exists mail throttled",
    );
    return;
  }
  queueAuthTransactionalEmail({
    kind: "account_exists",
    to: user.email,
    ...accountExistsMail(),
  });
}

/**
 * sec-46 (ревʼю PR): pre-account-takeover через неявне привʼязування OAuth.
 * Сценарій: зловмисник реєструє email+пароль на чужу адресу (непідтверджену),
 * а власник адреси згодом входить Google чи Apple. Якби Better Auth
 * привʼязав соцакаунт до наявного користувача, він би поставив
 * `emailVerified = true` (`dist/oauth2/link-account.mjs`), і пароль
 * зловмисника став би повноцінним входом у чужий акаунт, з
 * `requireVerifiedEmail()` на mono/privat включно.
 *
 * Better Auth 1.7.25 такого не робить: `requireLocalEmailVerified` за
 * замовчуванням `true`, і непідтверджений локальний користувач отримує
 * «account not linked» замість привʼязки. Пишемо прапорець явно, щоб
 * оновлення бібліотеки чи чужа правка конфігу не повернули вектор тихо;
 * регресію тримає `emailVerificationGate.test.ts` проти справжнього
 * `betterAuth()`.
 */
export const accountLinkingOptions = {
  requireLocalEmailVerified: true,
} as const;

/**
 * Частини конфігу Better Auth, що залежать від межі. Без межі порожньо:
 * Better Auth лишається на дефолтах (`autoSignIn: true`, 422 на зайняту
 * адресу, клік у листі сесії не відкриває).
 */
export function emailVerificationGateOptions(cutoff: Date | undefined): {
  emailAndPassword: {
    autoSignIn?: false;
    onExistingUserSignUp?: typeof notifyExistingUserSignUp;
  };
  autoSignInAfterVerification: boolean;
} {
  if (!cutoff) {
    return { emailAndPassword: {}, autoSignInAfterVerification: false };
  }
  return {
    emailAndPassword: {
      autoSignIn: false,
      onExistingUserSignUp: notifyExistingUserSignUp,
    },
    autoSignInAfterVerification: true,
  };
}
