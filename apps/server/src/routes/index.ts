import type { Express } from "express";
import type { Pool } from "pg";
import { createInternalRouter } from "./internal/index.js";
import { createAiMemoryRouter } from "./ai-memory.js";
import { createAuthRouter } from "./auth.js";
import { createBanksRouter } from "./banks.js";
import { createMonoWebhookRouter } from "./mono-webhook.js";
import { createBarcodeRouter } from "./barcode.js";
import { createChatRouter } from "./chat.js";
import { createCoachRouter } from "./coach.js";
import { createCspReportRouter } from "./csp-report.js";
import { createFoodSearchRouter } from "./food-search.js";
import { createHealthRouter } from "./health.js";
import { createMeRouter } from "./me.js";
import { createNutritionRouter } from "./nutrition.js";
import { createPushRouter } from "./push.js";
import { createSyncRouter } from "./sync.js";
import { createTranscribeRouter } from "./transcribe.js";
import { createWaitlistRouter } from "./waitlist.js";
import { createWebVitalsRouter } from "./web-vitals.js";
import { createWeeklyDigestRouter } from "./weekly-digest.js";

/**
 * Реєструє всі доменні роутери на переданому Express-додатку. Кожен роутер
 * мапить повний шлях (`/api/...`) і мoнтується без префіксу, щоб `req.url`
 * лишався ідентичним тому, що бачили handler-и до рефактору — це гарантує
 * нуль поведінкових змін.
 *
 * Порядок реєстрації відповідає тому, що був inline у `server/app.js`: спочатку
 * health/metrics, потім auth (перед глобальним CORS на /api — див. коментар у
 * `app.js`), потім решта доменних роутерів.
 */
export function registerRoutes(app: Express, { pool }: { pool: Pool }): void {
  // Internal machine-to-machine routes (n8n → server). Registered first so
  // they are never accidentally matched by a wildcard further down.
  app.use(createInternalRouter({ pool }));
  app.use(createHealthRouter({ pool }));
  app.use(createAuthRouter());
  app.use(createMeRouter());
  app.use(createSyncRouter());
  app.use(createChatRouter());
  app.use(createMonoWebhookRouter());
  app.use(createBanksRouter());
  app.use(createBarcodeRouter());
  app.use(createNutritionRouter());
  app.use(createWeeklyDigestRouter());
  app.use(createCoachRouter());
  app.use(createFoodSearchRouter());
  app.use(createWebVitalsRouter());
  app.use(createCspReportRouter());
  app.use(createPushRouter());
  app.use(createTranscribeRouter());
  app.use(createWaitlistRouter());
  app.use(createAiMemoryRouter());
}
