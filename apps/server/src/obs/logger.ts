import pino, { type Logger, type LoggerOptions } from "pino";
import pinoHttp, { type HttpLogger } from "pino-http";
import { REDACT_KEY_NAMES } from "@sergeant/shared";
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
// Контракт (для пов'язаного `Sentry.beforeSend` PII-скрабера в `sentry.ts`
// і браузерного аналога в `apps/web/src/core/observability/sentry.ts`):
//   - `redactKeyNames` — імена полів, які потрібно маскувати на будь-якій
//     глибині. Sentry-скрабер ходить рекурсивно і маскує ці ключі у
//     `extra/contexts/breadcrumbs.data`. Це доповнення до Pino-redaction,
//     бо Sentry не використовує pino, а будує власний payload.
//
// Канонічний список з 2026-05-13 живе у `@sergeant/shared/lib/pii.ts` як
// `REDACT_KEY_NAMES` (DOM-free) — однакові ключі потрібні web-Sentry SDK
// (audit §6.5 outstanding). Тут лишаємо back-compat-алиас, який і досі
// імпортує `apps/server/src/sentry.ts` і mock-и в інтеграційних тестах.
export const redactKeyNames = REDACT_KEY_NAMES;

// Lower-cased set для O(1) case-insensitive lookup у `redactKeysRecursively`.
// Імена ключів у `REDACT_KEY_NAMES` зберігають канонічну casing для grep-у,
// але матч у логах — case-insensitive (наприклад, axios прокидає
// `err.config.headers.Authorization` з великої літери).
const REDACT_KEY_SET: ReadonlySet<string> = new Set(
  REDACT_KEY_NAMES.map((k) => k.toLowerCase()),
);

/**
 * S4 (audit `docs/audits/2026-05-13-security-observability-roast.md`) —
 * рекурсивний non-mutating редактор, що ходить по всіх рівнях лог-обʼєкта
 * і маскує значення ключів з `REDACT_KEY_NAMES` за іменем (case-insensitive).
 *
 * Раніше pino-конфіг покладався на статичні `*.password`, `*.*.password`
 * patterns, які працювали тільки 1–2 рівні вглиб; `req.body.nested.user.password`
 * (3 рівні) тихо потрапляв у Loki через axios `err.config.data` capture.
 * Тепер цей walker викликається у `formatters.log` і покриває довільну глибину.
 *
 * Інваріанти:
 *   - Non-mutating: повертає той самий reference, якщо нічого не змінилось;
 *     новий обʼєкт/масив будується тільки коли реально треба замаскувати
 *     поле. Це критично, бо pino передає сюди merged-обʼєкт, який ділить
 *     nested-references із caller-обʼєктами — мутація би пошкодила бізнес-стан.
 *   - Cycle-safe: `WeakSet` ловить self-referencing обʼєкти (`Error.cause`
 *     chains, OTel span attributes), щоб walker не зациклився.
 *   - Object-valued sensitive keys мапляться у `null`, щоб не лишати
 *     структуру дочірніх полів (наприклад, `{ password: { hash: ... } }` →
 *     `{ password: null }`); primitive-значення стають `"[redacted]"`.
 */
export function redactKeysRecursively(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value == null || typeof value !== "object") return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);

  if (Array.isArray(value)) {
    let mutated = false;
    const next: unknown[] = new Array<unknown>(value.length);
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      const redacted = redactKeysRecursively(item, seen);
      if (redacted !== item) mutated = true;
      next[i] = redacted;
    }
    return mutated ? next : value;
  }

  const src = value as Record<string, unknown>;
  let mutated = false;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    const v = src[key];
    if (REDACT_KEY_SET.has(key.toLowerCase())) {
      next[key] = v != null && typeof v === "object" ? null : "[redacted]";
      mutated = true;
      continue;
    }
    const redacted = redactKeysRecursively(v, seen);
    if (redacted !== v) mutated = true;
    next[key] = redacted;
  }
  return mutated ? next : value;
}

// Explicit path-based redaction для documented sensitive-полів. Це defense-in-depth
// поверх `formatters.log → redactKeysRecursively`: pino-fast-redact швидший за
// recursive walk, тож для гарячих відомих path-ів (headers, body) лишаємо явну
// конфігурацію. Нові sensitive-ключі додавай у `REDACT_KEY_NAMES` у
// `packages/shared/src/lib/pii.ts` — recursive walker одразу їх покриє;
// сюди потрібно дописувати тільки якщо path не матиметься за іменем
// (наприклад, `req.headers["x-csrf-token"]` — ключ містить дефіс, але вже
// у списку, тож достатньо). Старі статичні `*.password`, `*.*.password`,
// `*.email`, `req.body.email`-варіанти видалено (S4 closed): рекурсивний
// walker покриває їх детерміновано.
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
  // M3 — provider-specific API keys у root.
  "groqKey",
  "anthropicKey",
  "voyageKey",
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
  // PII — root-level fallback. Усі вкладені `*.email`, `req.body.email`,
  // `result.user.email` рівні тепер покриваються `redactKeysRecursively`.
  "email",
  "phone",
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
    // S4 (audit §6.5) — рекурсивний редактор для довільної глибини.
    // Pino `redact.paths` ловить лише статичні шляхи (1–2 рівні через
    // `*.foo` / `*.*.foo`); `redactKeysRecursively` ходить по всіх
    // рівнях merged-обʼєкта і маскує ключі з `REDACT_KEY_NAMES` за іменем.
    // Це закриває гап для `req.body.nested.user.password` (3+ рівні) та
    // axios `err.config.data` capture-ів.
    log(obj) {
      const redacted = redactKeysRecursively(obj);
      // pino-fast-redact очікує object на виході; `redactKeysRecursively`
      // зберігає форму (object → object, array → array), повертає той самий
      // reference коли немає чого редагувати — алокацій нуль у hot path.
      return redacted as Record<string, unknown>;
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
