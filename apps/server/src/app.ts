import express from "express";
import type {
  Express,
  Handler,
  NextFunction,
  Request,
  Response,
} from "express";

import { pool } from "./db.js";
import {
  apiCorsMiddleware,
  apiHelmetMiddleware,
  createCompressionMiddleware,
  errorHandler,
  requestIdMiddleware,
  requestLogMiddleware,
  requestTimeout,
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
   */
  trustProxy?: number | boolean | undefined;
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

  // Body-size policy: tight default, explicit loosening on routes that
  // legitimately carry large payloads.
  //
  // Контекст. Раніше глобально стояв `express.json({ limit: "12mb" })`, що
  // робило будь-який POST-ендпоінт потенційним каналом для 12MB сміття
  // (OOM-amplifier, повільний парс, зайва RSS на Railway-інстансі з
  // скромним лімітом пам'яті). 99% наших ендпоінтів обмінюються пейлоадами
  // <4KB — дефолт 128KB дає комфортний запас навіть під великий textarea
  // і одразу закриває 413 до того, як handler/zod навіть побачать тіло.
  //
  // Порядок важливий. Mount-и на конкретні шляхи мусять іти ПЕРЕД
  // глобальним мініатюрним, інакше 128KB-парсер спрацює першим і вб'є
  // великий legit-payload. `express.json()` no-op-ить, якщо body вже
  // розпарсене, тож другий виклик на тому самому request-і безпечний.
  //
  // Ліміти підібрані: schema-level max + невеликий запас під JSON-оверхед:
  //   analyze-photo / refine-photo : 10mb (schema допускає base64 до ~7MB)
  //   backup-upload                : 4mb  (internal cap 2.5MB post-stringify)
  //   sync push/pull               : 6mb  (MAX_BLOB_SIZE = 5MB)
  //   coach memory                 : 6mb  (той самий MAX_BLOB_SIZE)
  //   chat                         : 1mb  (ChatRequestSchema: context 40KB +
  //                                        50 messages × 8KB + 20 tool_results ×
  //                                        8KB + 20 tool_calls_raw ≈ до ~1MB
  //                                        на активній сесії з tool-calling)
  app.use("/api/nutrition/analyze-photo", express.json({ limit: "10mb" }));
  app.use("/api/nutrition/refine-photo", express.json({ limit: "10mb" }));
  app.use("/api/nutrition/backup-upload", express.json({ limit: "4mb" }));
  app.use("/api/sync", express.json({ limit: "6mb" }));
  app.use("/api/coach/memory", express.json({ limit: "6mb" }));
  app.use("/api/chat", express.json({ limit: "1mb" }));
  app.use("/api/mono/webhook", express.json({ limit: "32kb" }));
  // Voice transcription: raw audio blob, NOT JSON. Mount раніше за глобальний
  // `express.json({ limit: "128kb" })`, щоб 10mb-блоб не різався 128KB-парсером
  // (хоч `express.json()` no-op-ить на не-JSON, явний raw-парсер чіткіший).
  app.use("/api/transcribe", express.raw({ type: "audio/*", limit: "10mb" }));
  app.use(express.json({ limit: "128kb" }));

  // Global CORS for the whole /api surface. Individual handlers may re-set
  // headers (e.g. to widen allow-headers) — `setCorsHeaders` is idempotent.
  app.use("/api", apiCorsMiddleware());

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
