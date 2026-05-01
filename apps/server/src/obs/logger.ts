import pino, { type Logger, type LoggerOptions } from "pino";
import pinoHttp, { type HttpLogger } from "pino-http";
import { als } from "./requestContext.js";

/**
 * Єдиний JSON-логер для сервера. Railway, Sentry, Grafana Loki — всі
 * споживають JSON-рядок на `stdout` без налаштувань. Правила:
 *  - Ніколи не логувати тіла запитів (фото, паролі, Monobank-токени).
 *  - `requestId`/`userId`/`module` додаються автоматично з ALS (див.
 *    `requestContext.js`) — не передавай їх вручну.
 *  - `LOG_LEVEL` керує рівнем; за замовчуванням `info` в prod, `debug`
 *    локально (див. гілку `NODE_ENV` нижче). Ніколи не змінюй рівень у коді.
 *  - В dev можна увімкнути pino-pretty через `LOG_PRETTY=1`.
 */

const isDev = process.env.NODE_ENV !== "production";
const level = process.env.LOG_LEVEL || (isDev ? "debug" : "info");

// Список шляхів, які pino маскуватиме на `[redacted]`, щоб PII та секрети
// ніколи не просочувались у JSON-логи. Розширюємо консервативно: email і phone
// — навіть у вкладених user-об'єктах; усі типові варіанти токенів і secret.
// Якщо треба додати новий шлях — додавай тут, а НЕ робиш `logger.info({...})`
// з плейнтекстовим email, обходячи редакцію.
export const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',
  'req.headers["x-token"]',
  "password",
  "newPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "apiKey",
  "secret",
  "clientSecret",
  // PII — емейл/телефон в корені і всередині `user`/`body`.
  "email",
  "phone",
  "*.email",
  "*.phone",
  "user.email",
  "user.phone",
  "body.email",
  "body.phone",
];

const usePretty = process.env.LOG_PRETTY === "1";

const pinoOptions: LoggerOptions = {
  level,
  base: {
    service: "sergeant-api",
    env: process.env.NODE_ENV || "development",
    release:
      process.env.SENTRY_RELEASE ||
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      undefined,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { paths: redactPaths, censor: "[redacted]" },
  formatters: {
    // `level` як string замість числа — зручніше для grep у Railway.
    level(label) {
      return { level: label };
    },
  },
  mixin() {
    const ctx = als.getStore();
    if (!ctx) return {};
    const out: Record<string, string> = {};
    if (ctx.requestId) out.requestId = ctx.requestId;
    if (ctx.traceId) out.traceId = ctx.traceId;
    if (ctx.userId) out.userId = ctx.userId;
    if (ctx.module) out.module = ctx.module;
    return out;
  },
  transport: usePretty
    ? {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
      }
    : undefined,
};

export const logger: Logger = pino(pinoOptions);

/**
 * pino-http middleware — додає `req.log` (child logger, прив'язаний до запиту)
 * до кожного Request. `autoLogging` вимкнено, бо access-log + Prometheus
 * метрики вже генеруються `requestLogMiddleware`. Мета — тільки `req.log`.
 */
export const httpLogger: HttpLogger = pinoHttp({
  logger,
  autoLogging: false,
  // Підхоплюємо requestId з уже наявного (встановленого requestIdMiddleware).
  genReqId: (req) =>
    (req as typeof req & { requestId?: string }).requestId ?? "unknown",
});

export interface SerializedError {
  name?: string;
  message: string;
  code?: string;
  status?: number;
  stack?: string;
  cause?: SerializedError;
}

export interface SerializeErrorOptions {
  includeStack?: boolean;
  depth?: number;
}

type ErrorShape = {
  name?: string;
  message?: string;
  code?: string;
  status?: number;
  stack?: string;
  cause?: unknown;
};

/**
 * Розгортає `err.cause` ланцюжком у plain об'єкт, безпечний для JSON/pino.
 * Корисно в `errorHandler` і process-level hooks, щоб у Loki/Grafana причину
 * бачити без розгортання stack.
 */
export function serializeError(
  err: unknown,
  { includeStack = false, depth = 4 }: SerializeErrorOptions = {},
): SerializedError | undefined {
  if (err == null || depth < 0) return undefined;
  if (typeof err !== "object") {
    return { message: String(err) };
  }
  const e = err as ErrorShape;
  const out: SerializedError = {
    name: e.name,
    message: e.message || String(err),
  };
  if (e.code !== undefined) out.code = e.code;
  if (e.status !== undefined) out.status = e.status;
  if (includeStack && e.stack) out.stack = e.stack;
  if (e.cause) {
    const cause = serializeError(e.cause, {
      includeStack,
      depth: depth - 1,
    });
    if (cause) out.cause = cause;
  }
  return out;
}
