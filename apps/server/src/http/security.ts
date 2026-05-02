import type { RequestHandler } from "express";
import helmet from "helmet";
import { logger } from "../obs/logger.js";

export type ApiCspDirectives = Record<string, string[]>;

export interface ApiHelmetOptions {
  servesFrontend?: boolean;
}

/**
 * CSP директиви для API-only сервера.
 *
 * Railway сервер віддає лише JSON (або мінімальні текст/plain для health) і не
 * обслуговує HTML фронтенду — той живе на Vercel. Тому CSP може бути дуже
 * суворою: ніякий контент із цього origin не має виконувати скрипти / бути
 * вбудованим у фрейм / завантажувати щось. Це захищає на випадок помилки
 * middleware, яка випадково поверне HTML.
 *
 * Для фронтенду CSP треба задавати в `vercel.json` з урахуванням PWA
 * (script-src + worker-src blob:, connect-src — Railway + Anthropic-free, бо
 * AI виклики проксовані через API).
 */
export function buildApiCspDirectives(): ApiCspDirectives {
  return {
    defaultSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'none'"],
    formAction: ["'none'"],
    connectSrc: ["'self'"],
    imgSrc: ["'self'", "data:"],
    // Навіть якщо колись повернеться HTML з сервера — ніяких зовнішніх скриптів
    scriptSrc: ["'none'"],
    styleSrc: ["'none'"],
  };
}

/**
 * Helmet middleware для Express.
 *
 * - `servesFrontend: true` — цей процес окрім API віддає ще й React SPA
 *   (режим Replit, `SERVER_MODE=replit`). У цьому режимі CSP вимикається, бо
 *   API-CSP з `script-src 'none'` зламала б фронтенд (Vite-PWA вбудовує
 *   інлайн-скрипт реєстрації SW, плюс `blob:` worker). Для розгортань, де
 *   потрібна CSP на SPA, політика задається на CDN-рівні (Vercel headers).
 * - `servesFrontend: false` (дефолт) — API-only (Railway). CSP буде строгою
 *   (див. buildApiCspDirectives). `CSP_REPORT_ONLY=1` переводить у
 *   report-only, `CSP_DISABLE=1` — повне вимкнення без re-deploy.
 *
 * `crossOriginResourcePolicy: 'cross-origin'` — щоб fetch з іншого домену
 * (Vercel → Railway) не ламався.
 */
export function apiHelmetMiddleware({
  servesFrontend = false,
}: ApiHelmetOptions = {}): RequestHandler {
  const cspEnvDisabled = process.env.CSP_DISABLE === "1";
  const cspDisabled = cspEnvDisabled || servesFrontend;
  const reportOnly = process.env.CSP_REPORT_ONLY === "1";

  // Без явного лога CSP_DISABLE=1 став би тихою деградацією — ревʼю
  // security-headers легко пропускає факт, що CSP взагалі не застосована.
  // Логуємо один раз на boot з рівнем warn у проді і info у дев-режимі.
  if (cspEnvDisabled) {
    const isProd = process.env.NODE_ENV === "production";
    // pino-методи читають `this` внутрішньо (this[writeSym], this[msgPrefixSym]),
    // тож витягання у змінну без .bind() крашне процес у strict-mode ESM.
    const payload = {
      msg: "csp_disabled",
      reason: "CSP_DISABLE=1",
      env: process.env.NODE_ENV || "unknown",
    };
    if (isProd) logger.warn(payload);
    else logger.info(payload);
  } else if (reportOnly) {
    logger.info({ msg: "csp_report_only" });
  }

  return helmet({
    contentSecurityPolicy: cspDisabled
      ? false
      : {
          useDefaults: false,
          directives: buildApiCspDirectives(),
          reportOnly,
        },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // HSTS тільки у production — на localhost він заблокував би всі HTTP-запити
    // у браузері надовго (max-age 1 рік без можливості скинути без devtools).
    hsts:
      process.env.NODE_ENV === "production"
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
  });
}
