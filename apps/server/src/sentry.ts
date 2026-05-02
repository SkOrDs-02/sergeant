import * as Sentry from "@sentry/node";
import type { Express } from "express";
import { als } from "./obs/requestContext.js";

function parseRate(val: string | undefined, fallback: number): number {
  if (val == null || val === "") return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

const dsn = process.env.SENTRY_DSN;

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
    beforeSend(event) {
      if (event.request?.data) delete event.request.data;
      if (event.request?.cookies) delete event.request.cookies;
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
    },
    beforeBreadcrumb(breadcrumb) {
      // Не тягнемо тіла HTTP-запитів у breadcrumbs.
      if (breadcrumb?.category === "http" && breadcrumb.data) {
        delete breadcrumb.data.request_body_size;
        delete breadcrumb.data.response_body_size;
      }
      return breadcrumb;
    },
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
