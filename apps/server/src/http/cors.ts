import type { IncomingMessage, ServerResponse } from "http";
import { logger } from "../obs/logger.js";

/**
 * CORS origins. Додаткові домени: змінна ALLOWED_ORIGINS (через кому).
 * Приклад: https://app.example.com,https://preview-xxx.vercel.app
 *
 * Для Vercel preview-деплойменотів із плаваючими hash-префіксами
 * (`sergeant-git-branch-user.vercel.app`) перераховувати кожен URL в
 * ALLOWED_ORIGINS незручно — для цього додана змінна `ALLOWED_ORIGIN_REGEX`
 * (один regex, що тестується проти `req.headers.origin`). Приклад значення:
 *   `^https://(?:sergeant|fizruk)(?:-[a-z0-9-]+)?\.vercel\.app$`
 *
 * Жодних wild-card defaults — щоб випадково не відкрити CORS на чуже
 * Vercel-тенант. Regex треба явно виставити.
 */
const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:5000",
  // Expo web dev (Metro bundler) за замовчуванням слухає 8081. Нативні
  // клієнти CORS не перевіряють (Origin не шлють), але Expo-web симулятор
  // і браузерна прев'юшка у dev-режимі — шлють, тому явно дозволяємо.
  "http://localhost:8081",
  "https://fizruk.vercel.app",
  "https://sergeant.vercel.app",
  "https://sergeant.2dmanager.com.ua",
];

function getReplitOrigins() {
  const domains = process.env["REPLIT_DOMAINS"] || "";
  return domains
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => `https://${d}`);
}

export function getAllowedOrigins() {
  const extra = (process.env["ALLOWED_ORIGINS"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ORIGINS, ...getReplitOrigins(), ...extra])];
}

// Кешуємо скомпільований regex, щоб не пересправляти його на кожен запит.
// Якщо regex невалідний — логуємо один раз (одне повідомлення на значення env)
// і ігноруємо (fail-closed). Для test-оточення логування придушене, щоб не
// спамити тестовий stdout — у тестах помилка перевіряється через `isOriginAllowed`.
let cachedRegexSrc: string | null = null;
let cachedRegex: RegExp | null = null;
function getAllowedOriginRegex(): RegExp | null {
  const src = process.env["ALLOWED_ORIGIN_REGEX"] || "";
  if (src === cachedRegexSrc) return cachedRegex;
  cachedRegexSrc = src;
  if (!src) {
    cachedRegex = null;
    return null;
  }
  try {
    // eslint-disable-next-line security/detect-non-literal-regexp -- src is operator-controlled env (ALLOWED_ORIGIN_REGEX) by design; pattern is fail-closed (try/catch + null-cache).
    cachedRegex = new RegExp(src);
  } catch (err) {
    cachedRegex = null;
    if (process.env["NODE_ENV"] !== "test") {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({
        msg: "cors_invalid_allowed_origin_regex",
        err: { message },
      });
    }
  }
  return cachedRegex;
}

export function isOriginAllowed(origin: string | undefined) {
  if (!origin) return false;
  if (getAllowedOrigins().includes(origin)) return true;
  const re = getAllowedOriginRegex();
  return re ? re.test(origin) : false;
}

export interface CorsHeaderOptions {
  allowHeaders?: string;
  methods?: string;
  /**
   * Заголовки, які сервер хоче зробити видимими для JS у браузері через
   * `Access-Control-Expose-Headers`. Без цього `fetch().headers.get("...")` у
   * cross-origin запитах повертає `null` навіть якщо сервер заголовок
   * встановив. Потрібен, щоб клієнт побачив `Retry-After` на 429.
   */
  exposeHeaders?: string;
}

export function setCorsHeaders(
  res: ServerResponse,
  req: IncomingMessage,
  opts: CorsHeaderOptions = {},
): void {
  const {
    allowHeaders = "Content-Type",
    methods = "GET, POST, OPTIONS",
    exposeHeaders,
  } = opts;
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", allowHeaders);
  res.setHeader("Access-Control-Allow-Methods", methods);
  if (exposeHeaders) {
    res.setHeader("Access-Control-Expose-Headers", exposeHeaders);
  }
}
