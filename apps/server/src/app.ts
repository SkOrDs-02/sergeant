import express from "express";
import type {
  Express,
  Handler,
  NextFunction,
  Request,
  Response,
} from "express";

import { pool } from "./db.js";
import { applyBodySizePolicy } from "./http/bodySizePolicy.js";
import {
  apiCorsMiddleware,
  apiHelmetMiddleware,
  createCompressionMiddleware,
  errorHandler,
  requestIdMiddleware,
  requestLogMiddleware,
  requestTimeout,
  requireCsrfHeader,
  traceMiddleware,
  withRequestContext,
} from "./http/index.js";
import { httpLogger } from "./obs/logger.js";
import { registerRoutes } from "./routes/index.js";
import { createFrontendMiddleware } from "./routes/frontend.js";
import { attachSentryErrorHandler } from "./sentry.js";

const API_V1_PREFIX = "/api/v1";
const API_PREFIX = "/api";

/**
 * API versioning shim. Рівно один router зареєстрований на `/api/*` (див.
 * `registerRoutes`), але ми хочемо, щоб той самий роутер віддавав дзеркало
 * під `/api/v1/*` — це дає мобільним клієнтам явну версію, при цьому веб
 * (що ходить у `/api/*`) не ламається.
 *
 * Замість двох `app.use(router)` ми переписуємо `req.url` на канонічний
 * `/api/...` шлях ДО маршрутизації. `req.originalUrl` зберігає оригінальний
 * префікс, тому middleware, які читають `originalUrl` (напр. auth-метрики),
 * бачать факт версійного виклику — без додаткової логіки.
 */
function apiVersionRewrite(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const url = req.url;
  if (url === API_V1_PREFIX) {
    req.url = API_PREFIX;
  } else if (url.startsWith(`${API_V1_PREFIX}/`)) {
    req.url = API_PREFIX + url.slice(API_V1_PREFIX.length);
  }
  next();
}

interface CreateAppOptions {
  /**
   * If true, CSP is disabled and the built SPA from `distPath` is served.
   * Used by the Replit deploy where one process hosts both API and frontend.
   */
  servesFrontend?: boolean;
  /**
   * Absolute path to the Vite build output (the folder containing `index.html`).
   * Required when `servesFrontend=true`.
   */
  distPath?: string | null;
  /**
   * Forwarded to `app.set('trust proxy', …)`. Pass `undefined` to skip (Replit
   * historically did not configure this).
   *
   * **M2** Accepts the same union as `parseTrustProxy` returns:
   *   - `number` — hop count (1 for Railway, 2 for Cloudflare+Railway).
   *   - `string[]` — explicit CIDR/keyword allowlist.
   *   - `false` — disable XFF parsing entirely.
   *   - `undefined` — keep Express defaults (no `app.set` call).
   *
   * `true` is intentionally NOT accepted — it makes every `req.ip`
   * client-controlled. `parseTrustProxy` rejects it at boot.
   */
  trustProxy?: number | boolean | string[] | undefined;
}

interface FrontendMiddlewareBundle {
  assetsStatic: Handler;
  rootStatic: Handler;
  sendIndex: Handler;
}

/**
 * Construct a fully-wired Express application.
 *
 * This factory is environment-agnostic: it reads nothing from `process.env` and
 * does not call `app.listen()`. The caller (`server/index.ts`) is responsible
 * for bootstrapping Sentry, process-level handlers, and starting the HTTP
 * listener. Keeping `createApp` pure makes it trivial to smoke-test routes in
 * Vitest without spinning up a real server.
 *
 * Routing itself is delegated to `server/routes/` — per-domain routers are
 * mounted through `registerRoutes`. The order matters and is preserved there.
 */
export function createApp({
  servesFrontend = false,
  distPath = null,
  trustProxy = 1,
}: CreateAppOptions = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  if (trustProxy !== undefined && trustProxy !== false) {
    app.set("trust proxy", trustProxy);
  }

  app.use(requestIdMiddleware);
  app.use(withRequestContext);
  app.use(traceMiddleware);
  // Global request timeout - prevents zombie requests from consuming resources
  app.use(requestTimeout());
  // Response compression (gzip/br) - must be early in the chain
  app.use(createCompressionMiddleware());
  // pino-http: додає req.log (child logger) до кожного запиту. autoLogging
  // вимкнено — access-log генерується requestLogMiddleware (з метриками).
  app.use(httpLogger);
  app.use(requestLogMiddleware);
  // Rewrite /api/v1/* → /api/* ДО helmet/json-body/CORS: всі подальші
  // path-base-middleware (body-parsers на конкретних шляхах, `/api` CORS,
  // роутери) мусять бачити вже канонізований `req.url`.
  app.use(apiVersionRewrite);
  app.use(apiHelmetMiddleware({ servesFrontend }));

  // Body-size policy: declarative table в `http/bodySizePolicy.ts` — єдине
  // джерело правди про per-route ліміти. ESLint-rule
  // `sergeant-design/no-inline-body-size-limit` блокує inline
  // `express.json({ limit })` поза тим файлом, щоб новий route випадково
  // не обійшов policy і не зламав specificity-order.
  applyBodySizePolicy(app);

  // Global CORS for the whole /api surface. Individual handlers may re-set
  // headers (e.g. to widen allow-headers) — `setCorsHeaders` is idempotent.
  app.use("/api", apiCorsMiddleware());

  // M10 — CSRF guard для state-changing запитів на `/api/*`.
  // Браузер не дасть cross-origin сторінці поставити non-simple header
  // `X-Requested-With` без preflight-у; preflight зупиняється на нашому
  // CORS allowlist (`apiCorsMiddleware()` вище) → SOP + CSRF guard.
  // Винятки і деталі — у `requireCsrfHeader.ts`. Mount-имо ПІСЛЯ CORS,
  // щоб OPTIONS-preflight встиг відповісти 200 до того, як ми спитаємо
  // про XRW header.
  // Карта: `docs/security/hardening/M10-csrf-token-check.md`.
  app.use("/api", requireCsrfHeader());

  registerRoutes(app, { pool });

  if (servesFrontend && distPath) {
    const fe = createFrontendMiddleware({ distPath }) as
      | Handler
      | FrontendMiddlewareBundle;
    if (typeof fe === "function") {
      app.get("*", fe);
    } else {
      app.use("/assets", fe.assetsStatic);
      app.use(fe.rootStatic);
      app.get("*", fe.sendIndex);
    }
  }

  // Sentry's error handler must run before ours so it can capture stack traces
  // before we translate the error into a JSON body. Both are no-ops without
  // `SENTRY_DSN`, so this is safe in Replit-mode and local dev.
  attachSentryErrorHandler(app);
  app.use(errorHandler);

  return app;
}
