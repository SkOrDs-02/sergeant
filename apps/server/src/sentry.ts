import * as Sentry from "@sentry/node";
import type { Express } from "express";
import { als } from "./obs/requestContext.js";
import { redactKeyNames } from "./obs/logger.js";
import { redactSensitiveUrl } from "./obs/sensitiveUrl.js";

function parseRate(val: string | undefined, fallback: number): number {
  if (val == null || val === "") return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Рекурсивно ходить по об'єкту і маскує значення для ключів з
 * `redactKeyNames` (case-insensitive). Контракт синхронізований з
 * Pino-redaction (`logger.ts`): один список — два енфорсера.
 *
 * Sentry-payload-и можуть бути nested як завгодно (`event.contexts.runtime`,
 * `event.extra.user.profile.email`), тому regex-pino-paths не працюють.
 * Беремо ім'я ключа замість шляху.
 *
 * Цикли об'єктів захищені через WeakSet (Sentry payload не повинен
 * містити їх, але Error.cause і подібні самопосилання — можливі).
 */
const REDACT_KEY_SET = new Set(redactKeyNames.map((k) => k.toLowerCase()));
const PII_REDACTED = "[redacted]";

export function scrubPII(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (value == null || typeof value !== "object") return;
  if (seen.has(value as object)) return;
  seen.add(value as object);

  if (Array.isArray(value)) {
    for (const item of value) scrubPII(item, seen);
    return;
  }

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (REDACT_KEY_SET.has(key.toLowerCase())) {
      // Зберігаємо тип (string vs object) щоб Sentry UI не падав.
      obj[key] = typeof obj[key] === "object" ? null : PII_REDACTED;
      continue;
    }
    scrubPII(obj[key], seen);
  }
}

const dsn = process.env.SENTRY_DSN;

/**
 * Чистий beforeSend-хук — extracted у named-функцію (а не inline-closure
 * всередині `Sentry.init`), щоб тести могли його викликати напряму без
 * Sentry-моків. Контракт: мутує `event` in-place і повертає його ж (як того
 * хоче Sentry SDK).
 */
export function applyBeforeSend<E extends Sentry.ErrorEvent>(event: E): E {
  if (event.request?.data) delete event.request.data;
  if (event.request?.cookies) delete event.request.cookies;
  if (event.request?.headers) {
    // Headers можуть містити Authorization/Cookie/X-Csrf-Token.
    scrubPII(event.request.headers);
  }
  // C1 — `req.originalUrl` для `/api/mono/webhook/<secret>` несе сам секрет,
  // і Sentry capture-ить його у `event.request.url`. Рятуємо до того, як
  // подія йде на ingest. Хелпер ідемпотентний — викликати двічі безпечно,
  // якщо `requestDataIntegration` колись стане сам редагувати ці шляхи.
  if (typeof event.request?.url === "string") {
    event.request.url = redactSensitiveUrl(event.request.url);
  }
  // Глибокий рекурсивний скраб PII з extra/contexts/breadcrumbs. Ловимо
  // випадки, коли user-payload потрапив у `event.extra` через
  // `Sentry.setExtra('payload', req.body)` або
  // `Sentry.captureException(e, { extra })`.
  if (event.extra) scrubPII(event.extra);
  if (event.contexts) scrubPII(event.contexts);
  if (event.breadcrumbs) {
    for (const bc of event.breadcrumbs) {
      if (bc.data) scrubPII(bc.data);
      // breadcrumb.message — string; нічого скрабити (occurrence rate низький
      // і парсинг рядка на email/phone дав би false-positive-и).
    }
  }
  // user.email/phone не пускаємо — лишаємо тільки id. `sendDefaultPii=false`
  // вже це робить, але duplicate-захист дешевий.
  if (event.user) {
    const safe: { id?: string | number; ip_address?: string } = {};
    if (
      typeof event.user.id === "string" ||
      typeof event.user.id === "number"
    ) {
      safe.id = event.user.id;
    }
    event.user = safe;
  }
  // Підмішуємо контекст із ALS, якщо подія народилася в рамках запиту.
  const ctx = als.getStore();
  if (ctx) {
    event.tags = {
      ...(event.tags || {}),
      ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
      ...(ctx.module ? { module: ctx.module } : {}),
    };
    if (ctx.userId) {
      event.user = { ...(event.user || {}), id: ctx.userId };
    }
  }
  return event;
}

/**
 * Чистий beforeBreadcrumb-хук — extracted з тих самих міркувань, що й
 * `applyBeforeSend`. Повертає `null`, якщо breadcrumb треба викинути; інакше
 * мутує `data` і повертає той самий breadcrumb.
 */
export function applyBeforeBreadcrumb(
  breadcrumb: Sentry.Breadcrumb,
): Sentry.Breadcrumb | null {
  if (breadcrumb?.category === "http" && breadcrumb.data) {
    delete breadcrumb.data.request_body_size;
    delete breadcrumb.data.response_body_size;
    // C1 — http breadcrumb-и несуть `data.url` як key для запитів outbound
    // HTTP (axios/fetch). Якщо колись виявимо, що outbound ходить на чужий
    // API з секрет-у-path-і, той самий хелпер redact-не його. Inbound-leak
    // (`/api/mono/webhook/<secret>`) сюди не потрапляє — Sentry HTTP-breadcrumb-и
    // для inbound-у не створюються.
    if (typeof breadcrumb.data.url === "string") {
      breadcrumb.data.url = redactSensitiveUrl(breadcrumb.data.url);
    }
    scrubPII(breadcrumb.data);
  }
  return breadcrumb;
}

// ВАЖЛИВО: ініціалізація робиться у module top-level, а не в окремій функції,
// яку треба викликати. У ESM (`"type": "module"`) усі `import` хостяться і
// оцінюються ДО виконання тіла модуля, тому якщо викликати `Sentry.init()` з
// тіла `server/index.js`, `express`/`http` уже будуть завантажені й
// OpenTelemetry-інструментація стане no-op.
//
// Рішення: ставимо `Sentry.init()` саме тут, а у `server/index.js` цей файл
// імпортується ПЕРШИМ — завдяки depth-first evaluation ESM-імпортів тіло
// `sentry.js` виконається до того, як станеться `import express`.
if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    release: process.env.SENTRY_RELEASE || process.env.RAILWAY_GIT_COMMIT_SHA,
    // `SENTRY_TRACES_SAMPLE_RATE=0` має вимикати трейсинг — тому не `|| 0.1`.
    tracesSampleRate: parseRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
    // Приберемо request body зі звітів — там можуть бути фото/паролі.
    sendDefaultPii: false,
    beforeSend: applyBeforeSend,
    beforeBreadcrumb: applyBeforeBreadcrumb,
  });

  // AI-NOTE: console.log тут навмисний — sentry.ts оцінюється ДО logger.ts
  // (ESM depth-first import order), тому pino-логер ще не ініціалізований.
  // Формат — JSON-рядок, сумісний з Railway/Loki ingestion.
  console.log(
    JSON.stringify({
      level: "info",
      msg: "sentry_initialized",
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    }),
  );
}

/**
 * Підключає Sentry-обробник помилок до Express-додатка.
 * Має викликатись *після* всіх роутерів і *перед* власним error handler-ом.
 */
export function attachSentryErrorHandler(app: Express): void {
  if (!dsn) return;
  Sentry.setupExpressErrorHandler(app);
}

export { Sentry };
