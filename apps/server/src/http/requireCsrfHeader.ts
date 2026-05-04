import type { RequestHandler } from "express";

/**
 * `requireCsrfHeader` — глобальний CSRF guard для `/api/*` поверх state-
 * changing запитів (POST/PUT/PATCH/DELETE).
 *
 * Контекст ([M10](../../../../docs/security/hardening/M10-csrf-token-check.md)).
 * До цього midllware-а ми покладались виключно на CORS allowlist + cookie
 * `SameSite=Lax`/`None`. Якщо допустимий origin compromise-ється XSS-ом, або
 * атакер використовує Lax-friendly top-level navigation (`<form action="…">
 * method="POST"` від evil.com), браузер цілком може приклеїти Better Auth
 * cookie до запиту. Single-page-app дешевий патерн захисту — вимагати
 * non-simple header `X-Requested-With: XMLHttpRequest`. Браузер НЕ дасть
 * cross-origin сторінці виставити такий header без preflight-у, а наш
 * preflight зупиняється на CORS allowlist.
 *
 * Allowlist:
 *   - Safe-methods (GET/HEAD/OPTIONS) пропускаємо без перевірки —
 *     ідемпотентні і не змінюють стан.
 *   - `/api/auth/*` (Better Auth + OAuth callbacks) — Better Auth має
 *     свої CSRF-механізми (PKCE для OAuth, signed-state cookies), і
 *     OAuth-redirect-и приходять як top-level GET без можливості
 *     виставити XRW.
 *   - `/api/mono/webhook[/...]` — Monobank сервер шле POST з HMAC у
 *     header-і; CSRF-токен від нашого фронту тут нерелевантний.
 *   - `/api/csp-report` — браузерний `report-uri` POST без custom
 *     header-ів (browser-controlled).
 *   - `/api/metrics/web-vitals` — sendBeacon-style телеметрія,
 *     обмежена per-IP rate-limiter-ом і body-size cap-ом 10kb (M12).
 *     Окремі raw-fetch шляху виставляють header через `httpClient.ts`,
 *     але `navigator.sendBeacon` не дозволяє custom header-и взагалі —
 *     тому endpoint exempt-имо.
 *   - `/api/internal/*` — server-to-server bearer-protected (n8n, cron).
 *   - Запити з `X-Api-Secret` header-ом — server-to-server (cron-worker),
 *     CSRF-вектор на них не діє (cookie-сесія не задіяна, секрет
 *     валідується наступним middleware-ом константним порівнянням).
 *
 * Будь-який інший state-changing запит без `X-Requested-With:
 * XMLHttpRequest` повертає 403 з кодом `CSRF_HEADER_REQUIRED`.
 *
 * Перевірка регістронезалежна, але точна: ми вимагаємо саме рядок
 * `XMLHttpRequest` (canonical jQuery / fetch-wrapper форма) — це навмисно,
 * щоб опечатки типу `XmlHttpRequest` від нового SDK ловились локально на
 * dev-машині, а не сипались тихо у проді.
 */

const STATE_CHANGING_METHODS: ReadonlySet<string> = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

const HEADER_NAME = "x-requested-with";
const REQUIRED_VALUE = "XMLHttpRequest";

const EXEMPT_PATH_PREFIXES: readonly string[] = [
  "/api/auth/",
  "/api/auth", // exact match для самого root-у Better Auth (рідко, але можливо)
  "/api/mono/webhook",
  "/api/csp-report",
  "/api/metrics/web-vitals",
  "/api/internal/",
  "/api/internal", // exact match
];

function isExemptPath(path: string): boolean {
  for (const p of EXEMPT_PATH_PREFIXES) {
    if (p.endsWith("/")) {
      if (path === p.slice(0, -1) || path.startsWith(p)) return true;
    } else {
      if (path === p || path.startsWith(`${p}/`)) return true;
    }
  }
  return false;
}

export interface RequireCsrfHeaderOptions {
  /**
   * Custom logger callback for diagnostics. Default: no-op. Tests
   * перевіряють самі факт відмови; продові інтеграції можуть пушити
   * у Sentry / pino через цю callback-у.
   */
  onReject?: (req: { method: string; path: string }) => void;
}

export function requireCsrfHeader(
  opts: RequireCsrfHeaderOptions = {},
): RequestHandler {
  return (req, res, next) => {
    if (!STATE_CHANGING_METHODS.has(req.method)) {
      next();
      return;
    }
    if (isExemptPath(req.path)) {
      next();
      return;
    }
    // S2S calls з `X-Api-Secret` — bypass. `requireApiSecret(...)` далі
    // в ланцюжку звалить запит, якщо секрет невалідний; CSRF тут просто
    // нерелевантний.
    if (req.headers["x-api-secret"]) {
      next();
      return;
    }
    const raw = req.headers[HEADER_NAME];
    const value =
      typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
    if (value !== REQUIRED_VALUE) {
      opts.onReject?.({ method: req.method, path: req.path });
      res.status(403).json({
        error: "CSRF header required",
        code: "CSRF_HEADER_REQUIRED",
      });
      return;
    }
    next();
  };
}
