import pino, { type Logger, type LoggerOptions } from "pino";
import pinoHttp, { type HttpLogger } from "pino-http";
import { hashUserId } from "../lib/userIdHash.js";
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

const isDev = process.env["NODE_ENV"] !== "production";
const baseLevel = process.env["LOG_LEVEL"] || (isDev ? "debug" : "info");

// Runtime debug-window state. A /debug-window CLI command can temporarily
// lower the log level to "debug" for a bounded duration without a restart.
let debugUntilMs: number | null = null;
const DEBUG_WINDOW_MAX_MS = 30 * 60 * 1000; // 30 minutes hard ceiling

export function enableDebugWindow(
  durationMs: number,
  requestedBy: string,
): void {
  const capped = Math.min(durationMs, DEBUG_WINDOW_MAX_MS);
  debugUntilMs = Date.now() + capped;
  logger.info({ requestedBy, durationMs: capped }, "Debug window enabled");
}

export function disableDebugWindow(): void {
  debugUntilMs = null;
}

export function debugWindowRemainingMs(): number {
  if (debugUntilMs === null) return 0;
  return Math.max(0, debugUntilMs - Date.now());
}

export function currentLogLevel(): string {
  if (debugUntilMs !== null && Date.now() < debugUntilMs) return "debug";
  return baseLevel;
}

// Список шляхів, які pino маскуватиме на `[redacted]`, щоб PII та секрети
// ніколи не просочувались у JSON-логи. Розширюємо консервативно: email і phone
// — навіть у вкладених user-об'єктах; усі типові варіанти токенів і secret.
// Якщо треба додати новий шлях — додавай тут, а НЕ робиш `logger.info({...})`
// з плейнтекстовим email, обходячи редакцію.
//
// Контракт (для пов'язаного `Sentry.beforeSend` PII-скрабера в `sentry.ts`):
//   - `redactKeyNames` — імена полів, які потрібно маскувати на будь-якій
//     глибині. Sentry-скрабер ходить рекурсивно і маскує ці ключі у
//     `extra/contexts/breadcrumbs.data`. Це доповнення до Pino-redaction,
//     бо Sentry не використовує pino, а будує власний payload.
export const redactKeyNames = [
  "password",
  "newPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "sessionToken",
  "apiKey",
  "secret",
  "clientSecret",
  "privateKey",
  "signature",
  "dsn",
  "connectionString",
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-token",
  "x-csrf-token",
  // M3 — webhook secrets, які приходять як заголовки. Sentry-скрабер
  // використовує case-insensitive match, тож одного рядка достатньо
  // для будь-якого casing-у (X-Mono-Webhook-Secret, x-mono-webhook-secret).
  "x-mono-webhook-secret",
  "x-openclaw-webhook-secret",
  "x-api-secret",
  "x-internal-token",
  // M3 — provider-specific API keys, які можуть з'явитись у `extra`-діагностиці
  // (HubChat, embedding-debug, OpenClaw insights). Зберігаємо їх в одному
  // конкретному casing-у (Sentry-скрабер сам нормалізує case).
  "groqKey",
  "anthropicKey",
  "voyageKey",
  // PII — на будь-якій глибині.
  "email",
  "phone",
];

export const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',
  'req.headers["x-token"]',
  'req.headers["x-csrf-token"]',
  // M3 — Pino redaction для webhook-secret-headers і internal-tokens.
  // Це доповнює `redactSensitiveUrl()` (`apps/server/src/obs/sensitiveUrl.ts`),
  // що чистить URL-path; тут ми ловимо випадок, коли header-варіант
  // потрапляє у `req.log({ headers })` через помилкове логування.
  'req.headers["x-mono-webhook-secret"]',
  'req.headers["x-openclaw-webhook-secret"]',
  'req.headers["x-api-secret"]',
  'req.headers["x-internal-token"]',
  'res.headers["set-cookie"]',
  "password",
  "newPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "sessionToken",
  "session.token",
  "apiKey",
  "secret",
  "clientSecret",
  "privateKey",
  "signature",
  "dsn",
  "connectionString",
  // M3 — provider-specific API keys у root + 1 рівень.
  "groqKey",
  "anthropicKey",
  "voyageKey",
  "*.groqKey",
  "*.anthropicKey",
  "*.voyageKey",
  // M3 — типові ділянки `req.body` для login/register flows. Зазвичай ми
  // НЕ логуємо body, але якщо хтось зробить `logger.error({ req })` через
  // pino-std-serializer, body буде включений — і ми хочемо його зачистити.
  "req.body.password",
  "req.body.token",
  "req.body.currentPassword",
  "req.body.newPassword",
  // M3 — axios `err.config.headers.Authorization` (i.e. упав запит до
  // зовнішнього сервісу). Pino-std `err` serializer прокидає `config`
  // як частину помилки, тож Authorization потрапляв у лог як plaintext.
  "err.config.headers.Authorization",
  "err.config.headers.authorization",
  "err.config.headers.Cookie",
  "err.config.headers.cookie",
  'err.config.headers["x-mono-webhook-secret"]',
  // Wildcard-шляхи для типових 1-2 рівнів вкладеності (pino redact матчить
  // wildcard рівно на одну глибину, тому потрібно явно прописати обидва).
  // Ширша редакція (будь-яка глибина) робиться у `sentry.ts:scrubPII()`
  // через `redactKeyNames`.
  "*.password",
  "*.token",
  "*.apiKey",
  "*.secret",
  "*.clientSecret",
  "*.privateKey",
  "*.dsn",
  "*.connectionString",
  "*.*.password",
  "*.*.token",
  "*.*.apiKey",
  "*.*.secret",
  "*.*.clientSecret",
  "*.*.privateKey",
  // PII — емейл/телефон. Pino redact-wildcard матчиться рівно на одну
  // глибину: `*.email` ловить `user.email` / `body.email` / `ctx.email`,
  // але НЕ `req.body.email` (це 3 рівні: `req` → `body` → `email`).
  // Тому 2-level wildcards + явні `req.body.*` / `res.body.*` шляхи
  // додаються окремо. Round 17 — закриває гап для login/register/OTP
  // flow-ів, де email/phone приходять як body на API і виходять
  // як body у response (наприклад, `me`-endpoint, friend-pickers).
  // Sentry-скрабер ловить ці ж ключі рекурсивно через `redactKeyNames`,
  // тому за межами `req`/`res`/`body`-ієрархії покриття не страждає.
  "email",
  "phone",
  "*.email",
  "*.phone",
  "*.*.email",
  "*.*.phone",
  "user.email",
  "user.phone",
  "body.email",
  "body.phone",
  "req.body.email",
  "req.body.phone",
  "res.body.email",
  "res.body.phone",
];

const usePretty = process.env["LOG_PRETTY"] === "1";

const pinoOptions: LoggerOptions = {
  level: baseLevel,
  base: {
    service: "sergeant-api",
    env: process.env["NODE_ENV"] || "development",
    ...(process.env["SENTRY_RELEASE"] || process.env["RAILWAY_GIT_COMMIT_SHA"]
      ? {
          release:
            process.env["SENTRY_RELEASE"] ||
            process.env["RAILWAY_GIT_COMMIT_SHA"]!,
        }
      : {}),
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
    if (ctx.requestId) out["requestId"] = ctx.requestId;
    if (ctx.traceId) out["traceId"] = ctx.traceId;
    // L10 — `docs/security/hardening/L10-user-id-hash-in-logs.md`. Pino
    // logs go to Railway/Loki where retention + access policy is looser
    // than Sentry, so the raw UUID is replaced with a 16-hex prefix of
    // `sha256(userId)`. Sentry-traces and audit-tables continue to write
    // the raw `userId` (their access is restricted and PII-policy
    // already covers it).
    if (ctx.userId) {
      const hashed = hashUserId(ctx.userId);
      if (hashed) out["userIdHash"] = hashed;
    }
    if (ctx.module) out["module"] = ctx.module;
    return out;
  },
  ...(usePretty
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
        },
      }
    : {}),
};

export const logger: Logger = pino(pinoOptions);

// Sync pino's runtime level with the debug-window state every 5 seconds.
// Pino supports `logger.level = newLevel` at runtime without restart.
setInterval(() => {
  const desired = currentLogLevel();
  if (logger.level !== desired) logger.level = desired;
}, 5_000).unref();

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
  name?: string | undefined;
  message: string;
  code?: string | undefined;
  status?: number | undefined;
  stack?: string | undefined;
  cause?: SerializedError | undefined;
}

export interface SerializeErrorOptions {
  includeStack?: boolean | undefined;
  depth?: number | undefined;
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
