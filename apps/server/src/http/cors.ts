import type { IncomingMessage, ServerResponse } from "http";
import { logger } from "../obs/logger.js";

/**
 * CORS origins. Додаткові домени: змінна ALLOWED_ORIGINS (через кому).
 * Приклад: https://app.example.com,https://preview-xxx.vercel.app
 *
 * Для Vercel preview-деплойменотів із плаваючими hash-префіксами
 * (`sergeant-git-branch-user.vercel.app`) перераховувати кожен URL в
 * ALLOWED_ORIGINS незручно — для цього додана змінна `ALLOWED_ORIGIN_REGEX`
 * (один regex, що тестується проти `req.headers.origin`).
 *
 * Патерн має бути максимально вузьким. Простір імен проєктів на
 * `*.vercel.app` глобальний, тож широке `^https://sergeant(?:-[a-z0-9-]+)?
 * \.vercel\.app$` віддало б credentialed CORS будь-кому, хто зареєструє
 * сумісний піддомен у власному акаунті. Привʼязуйте патерн до фіксованого
 * суфікса своєї команди/акаунта, напр.:
 *   `^https://sergeant-git-[a-z0-9-]+-myteam\.vercel\.app$`
 *
 * Жодних wild-card defaults — щоб випадково не відкрити CORS на чуже
 * Vercel-тенант. Regex треба явно виставити.
 */
const PROD_ORIGINS = [
  "https://sergeant.vercel.app",
  "https://sergeant.2dmanager.com.ua",
  "https://app.sergeant.com.ua",
];

// Локальні dev-поверхні: Vite :5173, `vite preview` :4173, unified-mode
// сервер :5000 і Metro/Expo web :8081 (нативні клієнти Origin не шлють і
// CORS не перевіряють, але Expo-web симулятор і браузерна превʼюшка —
// шлють). У production у список НЕ потрапляють: session-cookie там
// `SameSite=None; Secure`, тож сторінка на localhost жертви інакше робила б
// credentialed cross-site запити до прода і читала б відповідь. Той самий
// NODE_ENV-гейт, що в `getTrustedOrigins()` (`auth.ts`). Якщо localhost
// потрібен у проді свідомо — додайте його через `ALLOWED_ORIGINS`.
const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  "http://localhost:8081",
];

const DEFAULT_ALLOW_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Requested-With",
  "X-Api-Secret",
  "X-Origin-Device-Id",
  "traceparent",
  "tracestate",
].join(", ");

export function getAllowedOrigins() {
  const extra = (process.env["ALLOWED_ORIGINS"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const defaults =
    process.env["NODE_ENV"] === "production"
      ? PROD_ORIGINS
      : [...PROD_ORIGINS, ...DEV_ORIGINS];
  return [...new Set([...defaults, ...extra])];
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
    allowHeaders = DEFAULT_ALLOW_HEADERS,
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
