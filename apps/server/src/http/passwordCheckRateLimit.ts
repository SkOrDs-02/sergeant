import type { NextFunction, Request, RequestHandler, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth.js";
import {
  PASSWORD_CHECK_IP_RATE_LIMIT,
  PASSWORD_CHECK_USER_RATE_LIMIT,
} from "../config/rateLimit.js";
import { env } from "../env.js";
import { logger } from "../obs/logger.js";
import { getIp, rateLimitExpress } from "./rateLimit.js";

/**
 * App-ліміт на роути, що звіряють ПОТОЧНИЙ пароль автентифікованої сесії
 * (sec-10): `DELETE /api/me` і `POST /api/auth/change-password`.
 *
 * Без нього власник вкраденої сесії підбирав пароль без стелі (вбудований
 * ліміт Better Auth — 100 за 10 с на IP, in-memory), а кожна спроба ще й
 * займала libuv threadpool на ~130 мс scrypt. Бюджети й обґрунтування, чому
 * два бакети і чому рахуються всі спроби, — у `config/rateLimit.ts`.
 *
 * Порядок: СПЕРШУ per-IP, потім per-user. Так запит, відсічений IP-бакетом,
 * не з'їдає бюджет акаунта: атакер з однієї адреси не може вичерпати
 * per-user бакет і заблокувати власника, який вводить пароль зі свого IP.
 *
 * `/api/auth/verify-password` сюди не входить: його вимкнено через
 * `disabledPaths` (клієнти його не викликають), див. `auth.ts`.
 */

const failMode = () => (env.RATE_LIMIT_FAIL_CLOSED_AUTH ? "closed" : "open");

/** Користувач, резолвлений для `/api/auth/*`, де `req.user` не виставляє ніхто. */
const resolvedUserId = new WeakMap<Request, string>();

function userIdOf(req: Request): string | undefined {
  const fromReq = (req as Request & { user?: { id?: unknown } }).user?.id;
  if (typeof fromReq === "string" && fromReq) return fromReq;
  return resolvedUserId.get(req);
}

const byIp: RequestHandler = (req, res, next) =>
  rateLimitExpress({
    ...PASSWORD_CHECK_IP_RATE_LIMIT,
    failMode: failMode(),
    subject: (r) => `ip:${getIp(r)}`,
  })(req, res, next);

const byUser: RequestHandler = (req, res, next) => {
  // Немає користувача — нема за що ключувати. `rateLimitExpress` у цьому
  // випадку відкотився б на `ip:`-субʼєкт під ключем `…:user`, тобто змішав
  // би дві політики в один бакет; тому пропускаємо.
  if (!userIdOf(req)) {
    next();
    return;
  }
  rateLimitExpress({
    ...PASSWORD_CHECK_USER_RATE_LIMIT,
    failMode: failMode(),
    subject: (r) => {
      const id = userIdOf(r);
      return id ? `u:${id}` : `ip:${getIp(r)}`;
    },
  })(req, res, next);
};

function runInOrder(
  handlers: RequestHandler[],
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const step = (i: number): void => {
    const handler = handlers[i];
    if (!handler) {
      next();
      return;
    }
    // `rateLimitExpress` або відповідає сам (429/503, `next` не кличе), або
    // кличе `next()` без аргументів.
    void handler(req, res, () => step(i + 1));
  };
  step(0);
}

/**
 * Для роутів за `requireFreshSession()`: `req.user` уже є, тож обидва бакети
 * ключуються без додаткового lookup-а сесії.
 */
export const passwordCheckRateLimit: RequestHandler = (req, res, next) =>
  runInOrder([byIp, byUser], req, res, next);

/**
 * Для Better Auth-маунту (`/api/auth/*`): `POST …/change-password`.
 * Сесію резолвимо best-effort (cookie-кеш або Bearer): немає сесії — ендпоінт
 * однаково віддасть 401, а per-IP бакет усе одно діє; помилка lookup-а не
 * повинна ламати запит, тож вона лише логується.
 */
export const authPasswordCheckRateLimit: RequestHandler = async (
  req,
  res,
  next,
) => {
  const path = (req.originalUrl || "").split("?")[0] ?? "";
  if (req.method !== "POST" || !path.includes("/change-password")) {
    next();
    return;
  }
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    const id = session?.user?.id;
    if (typeof id === "string" && id) resolvedUserId.set(req, id);
  } catch (err) {
    logger.warn({
      msg: "password_check_rate_limit_session_lookup_failed",
      err: err instanceof Error ? err.message : String(err),
    });
  }
  runInOrder([byIp, byUser], req, res, next);
};
