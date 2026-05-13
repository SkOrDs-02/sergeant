import type { ErrorRequestHandler, Request, Response } from "express";
import * as Sentry from "@sentry/node";
import { logger, serializeError } from "../obs/logger.js";
import { als } from "../obs/requestContext.js";
import { appErrorsTotal } from "../obs/metrics.js";
import { isOperationalError } from "../obs/errors.js";
import { redactSensitiveUrl } from "../obs/sensitiveUrl.js";

/**
 * Термінальний error handler Express. Має стояти ПІСЛЯ
 * `attachSentryErrorHandler(app)` — той захопить stack і передасть далі.
 *
 * Правила:
 *  - `AppError` і підкласи → 4xx + `warn` + стабільне JSON body з `code`.
 *  - Все інше → 500 + `error` + generic message; деталі лише в логах/Sentry.
 *  - Клієнт завжди отримує `requestId`, щоб було що вставити в тікет.
 */
type AppLikeError = Error & {
  status?: number | string;
  code?: string;
  message: string;
  cause?: unknown;
};

/**
 * Витягує `details` із `AppError.cause`, якщо там JSON-обʼєкт із полем
 * `details: Array`. Це формат, який кидають `parseBody` / `parseQuery` з
 * `http/validate.ts`. Решту causes ігноруємо: уникаємо випадкового
 * витоку внутрішніх Error-обʼєктів (з stack-ом, PII) у відповідь клієнту.
 */
function extractClientDetails(cause: unknown): unknown[] | undefined {
  if (!cause || typeof cause !== "object") return undefined;
  const obj = cause as { details?: unknown };
  if (!Array.isArray(obj.details)) return undefined;
  return obj.details;
}

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next,
) => {
  const operational = isOperationalError(err);
  const e = (err && typeof err === "object" ? err : {}) as AppLikeError;
  const status = Number(e.status) || (operational ? 400 : 500);
  const code =
    (typeof e.code === "string" && e.code) ||
    (status === 429 ? "RATE_LIMIT" : operational ? "BAD_REQUEST" : "INTERNAL");
  const mod = als.getStore()?.module || "unknown";

  try {
    appErrorsTotal.inc({
      kind: operational ? "operational" : "programmer",
      status: String(status),
      code,
      module: mod,
    });
  } catch {
    /* metrics must never break error handling */
  }

  const level = status >= 500 ? "error" : "warn";
  // C1 — `req.originalUrl` для шляхів типу `/api/mono/webhook/<secret>` несе
  // сам секрет; `redactSensitiveUrl` знає про чутливі префікси і замінює
  // path-segment на `[redacted]`. Шлях через `req.route?.path` (route
  // pattern) безпечний за замовчуванням, але fallback ловить випадки, коли
  // запит не дійшов до route-резолвера (404, body-parser помилка тощо).
  logger[level]({
    msg: "request_failed",
    method: req.method,
    path: req.route?.path || redactSensitiveUrl(req.originalUrl),
    status,
    code,
    module: mod,
    err: serializeError(err, { includeStack: status >= 500 }),
  });

  // Явний виклик `Sentry.captureException` на справжні помилки (5xx /
  // не-operational). `setupExpressErrorHandler` з `server/sentry.js` теж це
  // ловить, але дубль-safe: якщо порядок middleware колись зміниться і
  // Sentry-хендлер не спрацює, ми все одно отримаємо подію. Sentry сам дедупає
  // однакові events, тому подвійних подій у проді не буде.
  if (status >= 500 && !operational) {
    try {
      Sentry.captureException(err);
    } catch {
      /* Sentry must never break error handling */
    }
  }

  if (res.headersSent) return;

  // `error` залишається для прямих `fetch`-споживачів (які звикли до цього
  // поля з самого початку), `message` дублюється поряд для бібліотек на
  // кшталт Better Auth client / better-fetch, що читають саме його при
  // десеріалізації не-2xx body. Без цього все, що не йде через Better
  // Auth-власний хендлер (rate-limit, AppError, generic 500), приходить у
  // фронт без `message` → ловиться загальним fallback-ом на кшталт
  // «Помилка входу» без жодних деталей.
  const userMessage = operational ? e.message : "Server error";
  // Surfacing `details` лише для operational помилок (4xx). Це формат,
  // який кидають `parseBody`/`parseQuery` через `cause: { details }`.
  // Для programmer-помилок (5xx) клієнт отримує тільки generic
  // `Server error` без cause, щоб уникнути витоку внутрішніх обʼєктів.
  const details = operational ? extractClientDetails(e.cause) : undefined;
  res.status(status).json({
    error: userMessage,
    message: userMessage,
    code,
    requestId: (req as Request & { requestId?: string }).requestId,
    ...(details ? { details } : {}),
  });
};
