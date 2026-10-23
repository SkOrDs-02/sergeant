import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth.js";
import { recordPasswordCheckFailure } from "../auth/passwordCheckFailures.js";
import { CHANGE_EMAIL_USER_RATE_LIMIT } from "../config/rateLimit.js";
import { env } from "../env.js";
import { MAX_USER_EMAIL_LENGTH } from "../auth/sanitizeUserName.js";
import { reauthenticate } from "../modules/me/reauth.js";
import { AppError, ValidationError } from "../obs/errors.js";
import { rateLimitExpress } from "./rateLimit.js";

/**
 * Повторна автентифікація перед `POST /api/auth/change-email` (аудит
 * 2026-10-01 `sec-06`, рішення власника 2026-10-23):
 *
 *   1. є credential-вхід → поле `password` у тілі обовʼязкове і має збігтися
 *      (`400 INVALID_PASSWORD`, рахується в `auth_password_check_failures_total`);
 *   2. лише OAuth-вхід → сесія ≤ 10 хв (`403 SESSION_NOT_FRESH`);
 *   3. пройшло → не більше 3 запитів на добу на користувача (`429`).
 *
 * ЧОМУ Express-middleware, а не хук Better Auth. Глобальний `hooks.before`
 * бачить Bearer-запит без сесії: `bearer()` підставляє куку у своєму хуку, а
 * його зміни контексту наступним хукам не передаються (`dispatch.mjs`,
 * `runBeforeHooks` збирає їх в окремий `modifiedContext`). DB-хуки теж не
 * годяться: без `updateEmailWithoutVerification` ендпоінт нічого не пише в
 * `user`, лише шле лист. Тут сесію резолвить `auth.api.getSession` з
 * плагінами, тож cookie і Bearer проходять одну перевірку.
 *
 * Поле `password` Better Auth не заважає: схема тіла `/change-email` —
 * `z.object` без `strict`, зайві ключі відкидаються.
 *
 * Немає сесії → пропускаємо: ендпоінт сам віддасть 401.
 */

const BA_BASE = "/api/auth";

/**
 * Той самий шлях, що побачить роутер Better Auth: `new URL` згортає `./`
 * і `%2E`-сегменти. Хвостовий `/` теж ловимо, хоча роутер його 404-ить.
 */
export function isChangeEmailPath(originalUrl: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(originalUrl, "http://internal").pathname;
  } catch {
    return false;
  }
  return pathname.replace(/\/+$/, "") === `${BA_BASE}/change-email`;
}

export async function changeEmailReauth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.method !== "POST" || !isChangeEmailPath(req.originalUrl || "")) {
    next();
    return;
  }
  // sec-16: задовгий `newEmail` відсікаємо ДО Better Auth. Інакше він
  // надсилає лист підтвердження й відповідає успіхом, а `guardUserEmail` у
  // `databaseHooks` відхиляє вже сам запис, тож обіцяну зміну не завершити.
  const newEmail = (req.body as { newEmail?: unknown } | undefined)?.newEmail;
  if (typeof newEmail === "string" && newEmail.length > MAX_USER_EMAIL_LENGTH) {
    next(
      new AppError(
        `Email задовгий: максимум ${MAX_USER_EMAIL_LENGTH} символів.`,
        {
          status: 400,
          code: "INVALID_EMAIL",
        },
      ),
    );
    return;
  }
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
      query: { disableCookieCache: true },
    });
    const userId = session?.user?.id;
    if (typeof userId !== "string" || !userId) {
      next();
      return;
    }

    const password = (req.body as { password?: unknown } | undefined)?.password;
    if (password !== undefined && typeof password !== "string") {
      next(new ValidationError("Поле password має бути рядком"));
      return;
    }

    const outcome = await reauthenticate(
      userId,
      password,
      async () => session?.session?.createdAt,
    );
    if (!outcome.ok && outcome.code === "INVALID_PASSWORD") {
      recordPasswordCheckFailure("change_email", userId);
      next(
        new AppError("Неправильний пароль", {
          status: 400,
          code: "INVALID_PASSWORD",
        }),
      );
      return;
    }
    if (!outcome.ok) {
      next(
        new AppError("Для цієї дії потрібен свіжий вхід. Увійди ще раз.", {
          status: 403,
          code: "SESSION_NOT_FRESH",
        }),
      );
      return;
    }

    rateLimitExpress({
      ...CHANGE_EMAIL_USER_RATE_LIMIT,
      failMode: env.RATE_LIMIT_FAIL_CLOSED_AUTH ? "closed" : "open",
      subject: () => `u:${userId}`,
    })(req, res, next);
  } catch (err) {
    next(err);
  }
}
