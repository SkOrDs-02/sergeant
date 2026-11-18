import type { Request, Response } from "express";
import { bankProxyFetch } from "../../lib/bankProxy.js";
import { parseQuery } from "../../http/validate.js";
import { PrivatQuerySchema } from "../../http/schemas.js";
import { logger } from "../../obs/logger.js";
import {
  AppError,
  UnauthorizedError,
  ValidationError,
} from "../../obs/errors.js";
import { loadPrivatCredentials } from "./privatStore.js";

/**
 * `/api/privat` — проксі до PrivatBank merchant API. CORS/rate-limit/tag/
 * сесія зроблені middleware-ами роутера; тут — path-валідація і делегація
 * transport-шару в `bankProxy.js` (timeout/retry/breaker/TTL-cache).
 *
 * Креденшели БІЛЬШЕ НЕ приходять із заголовків запиту: вони лежать
 * зашифровані в `privat_connection` і резолвляться за сесійним user id
 * (спека `docs/work/specs/beta-security-readiness.md`, F1).
 * Раніше клієнт мусив тримати merchant-токен у себе, щоб надіслати його в
 * `X-Privat-Token` — тобто банківський креденшел лежав у `localStorage` і
 * був видимий у DevTools. Плюс проксі був неавтентифікований: будь-хто міг
 * ганяти власні креденшели через нашу інфраструктуру.
 *
 * Upstream error bodies (HTML/JSON blobs) ніколи не ехояться клієнту.
 * Кожна помилка тут — `throw` підкласу `AppError`: Express 5 веде reject
 * async-хендлера в `http/errorHandler.ts`, і той віддає стабільне
 * `{ error, message, code, requestId }` (знахідка PR-T3 аудиту
 * 2026-09-13, хвиля 10). Truncated `upstreamBody` лишається в server logs
 * для дебагу.
 */
const ALLOWED_PATHS = ["/statements/balance/final", "/statements/transactions"];

const UPSTREAM_BODY_LOG_MAX = 200;

export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as Request & { user?: { id?: string } }).user?.id;
  if (!userId) {
    throw new UnauthorizedError("Потрібна автентифікація");
  }

  let creds: Awaited<ReturnType<typeof loadPrivatCredentials>>;
  try {
    creds = await loadPrivatCredentials(userId);
  } catch (err) {
    // Рядок є, але не розшифровується (знятий key version / пошкоджений
    // ciphertext). Fail closed: краще 500, ніж піти в банк з чужим токеном.
    logger.error({
      msg: "privat_credentials_decrypt_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    throw new AppError("Не вдалося прочитати credentials", {
      status: 500,
      code: "PRIVAT_CREDENTIALS_UNREADABLE",
    });
  }
  if (!creds) {
    throw new AppError("ПриватБанк не підключено", {
      status: 409,
      code: "PRIVAT_NOT_CONNECTED",
    });
  }

  const parsedQ = parseQuery(PrivatQuerySchema, req);
  const path = String(parsedQ.path || "/statements/balance/final");

  const pathAllowed = ALLOWED_PATHS.some(
    (p) => path === p || path.startsWith(p + "/"),
  );
  if (!pathAllowed) {
    throw new ValidationError("Недозволений API шлях");
  }

  // Відкидаємо небезпечні символи у значеннях заголовків (CRLF-injection захист).
  const safeHeader = (v: unknown): string | null => {
    const s = String(v);
    if (/[\r\n]/.test(s)) return null;
    return s;
  };
  // Креденшели тепер із БД, але CRLF-фільтр лишається: це все ще межа
  // довіри в бік upstream-HTTP, а значення колись прийшло від користувача
  // через `/api/privat/connect`.
  const safeId = safeHeader(creds.merchantId);
  const safeToken = safeHeader(creds.token);
  if (!safeId || !safeToken) {
    throw new ValidationError("Недозволені credentials");
  }

  const queryParams = new URLSearchParams(req.query as Record<string, string>);
  queryParams.delete("path");
  const query = Object.fromEntries(queryParams.entries());

  const { status, body, contentType, retryAfter } = await bankProxyFetch({
    upstream: "privatbank",
    baseUrl: "https://acp.privatbank.ua/api",
    path,
    query,
    headers: {
      id: safeId,
      token: safeToken,
      "Content-Type": "application/json;charset=utf-8",
    },
    cacheKeySecret: `${safeId}|${safeToken}`,
  });

  if (status < 200 || status >= 300) {
    // PrivatBank на 429 може віддати Retry-After — пропагуємо клієнту, як
    // раніше робив legacy `/api/mono` proxy.
    if (status === 429 && retryAfter) {
      res.setHeader("Retry-After", retryAfter);
    }

    logger.warn({
      msg: "privatbank_proxy_upstream_error",
      status,
      path,
      upstreamBody: body.slice(0, UPSTREAM_BODY_LOG_MAX),
    });

    if (status === 429) {
      throw new AppError("Занадто багато запитів", {
        status: 429,
        code: "RATE_LIMIT",
      });
    }
    if (status === 401 || status === 403) {
      throw new AppError("Неправильні дані входу PrivatBank", {
        status,
        code: "PRIVAT_CREDENTIALS_INVALID",
      });
    }
    throw new AppError(`Помилка ${status}`, {
      status,
      code: "PRIVAT_UPSTREAM_ERROR",
    });
  }

  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    res.setHeader("Content-Type", contentType || "text/plain; charset=utf-8");
    res.status(status).send(body);
    return;
  }
  res.status(200).json(data);
}
