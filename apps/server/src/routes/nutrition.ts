import { Router } from "express";
import type { Pool } from "pg";
import {
  rateLimitExpress,
  requireAiQuota,
  requireLlmUpstream,
  requireSession,
  setModule,
} from "../http/index.js";
import { requirePlan } from "../modules/billing/index.js";
import analyzePhoto from "../modules/nutrition/analyze-photo.js";
import parsePantry from "../modules/nutrition/parse-pantry.js";
import refinePhoto from "../modules/nutrition/refine-photo.js";
import recommendRecipes from "../modules/nutrition/recommend-recipes.js";
import weekPlan from "../modules/nutrition/week-plan.js";
import backupUpload from "../modules/nutrition/backup-upload.js";
import backupDownload from "../modules/nutrition/backup-download.js";
import dayPlan from "../modules/nutrition/day-plan.js";
import shoppingList from "../modules/nutrition/shopping-list.js";

/**
 * Усі `/api/nutrition/*` endpoint-и мають спільний set guard-ів:
 *   - `setModule("nutrition")` — для логера/метрик
 *   - broad rate-limit ("api:nutrition") — гасить shotgun-атаки
 *   - `requireSession()` — лише авторизовані користувачі (cookie або Bearer)
 *
 * Per-endpoint rate-limit + AI-guards навішуємо нижче: backup-endpoint-и не
 * ходять у Anthropic і не мають тратити квоту, тому `requireAnthropicKey` /
 * `requireAiQuota` до них не застосовуємо.
 *
 * Vision-endpoint-и (`analyze-photo` / `refine-photo`) додатково гейтяться за
 * Pro-планом: вони йдуть через Sonnet 4.6 Vision (cost=3) — найдорожчий
 * AI-шлях. Решта nutrition-AI лишається метрованою (free отримує
 * `effectiveLimits.aiRequestsPerDay`), що збігається з клієнтським
 * `useFeatureGate("ai-photo-analysis")` та ADR-0051. `requirePlan` стоїть
 * ПЕРЕД `requireAnthropicKey`/`requireAiQuota`, щоб free-юзер отримав 402 до
 * витрати денної квоти; при `STRIPE_ENABLED=false` middleware — no-op.
 */
export function createNutritionRouter({ pool }: { pool: Pool }): Router {
  const r = Router();
  r.use("/api/nutrition", setModule("nutrition"));
  r.use(
    "/api/nutrition",
    rateLimitExpress({ key: "api:nutrition", limit: 120, windowMs: 60_000 }),
  );
  r.use("/api/nutrition", requireSession());

  // Два різні гейти, бо два різні транспорти — і це не косметика.
  //
  // `analyze-photo` / `refine-photo` кличуть `anthropicMessages()` напряму
  // (їм потрібен `image`-блок), тож ключ їм треба той, який обере
  // `pickTransport()` під `VISION_VIA_OPENROUTER`. Решта йде через
  // `getLLMProvider()` з `LLM_NUTRITION_PROVIDER`, який fail-soft віддає
  // `StubProvider` без потрібного ключа — тобто 200 із заглушкою замість
  // помилки. Спільний `requireAnthropicKey()` не описував ЖОДЕН із двох
  // випадків: питав про ключ, який під дефолтним шлюзом не використовується.
  // Докстрінг `requireLlmUpstream`, знахідка B31 у решті роутів.
  const aiVision = [requireLlmUpstream("vision"), requireAiQuota()];
  const aiText = [requireLlmUpstream("nutrition"), requireAiQuota()];

  // Vision API call (~5–10s upstream, ~10–20KB image upload). Cost 3 makes
  // a 20-token bucket effectively ~6 photo-analyses per minute. See
  // `RateLimitOptions.cost`.
  r.post(
    "/api/nutrition/analyze-photo",
    rateLimitExpress({
      key: "nutrition:analyze-photo",
      limit: 20,
      windowMs: 60_000,
      cost: () => 3,
    }),
    requirePlan(pool, "pro"),
    ...aiVision,
    analyzePhoto,
  );
  r.post(
    "/api/nutrition/parse-pantry",
    rateLimitExpress({
      key: "nutrition:parse-pantry",
      limit: 60,
      windowMs: 60_000,
    }),
    ...aiText,
    parsePantry,
  );
  // Same Vision shape as analyze-photo — same cost (3).
  r.post(
    "/api/nutrition/refine-photo",
    rateLimitExpress({
      key: "nutrition:refine-photo",
      limit: 20,
      windowMs: 60_000,
      cost: () => 3,
    }),
    requirePlan(pool, "pro"),
    ...aiVision,
    refinePhoto,
  );
  // Anthropic text generation — medium-weight (~5–8s, smaller payloads
  // than chat-stream). Cost 2.
  r.post(
    "/api/nutrition/recommend-recipes",
    rateLimitExpress({
      key: "nutrition:recommend-recipes",
      limit: 20,
      windowMs: 60_000,
      cost: () => 2,
    }),
    ...aiText,
    recommendRecipes,
  );
  // Heaviest plan — generates 7 days of meals at once (~10–15s, larger
  // prompt). Cost 3 leaves the bucket at ~3 plans/min before tightening.
  r.post(
    "/api/nutrition/week-plan",
    rateLimitExpress({
      key: "nutrition:week-plan",
      limit: 10,
      windowMs: 60_000,
      cost: () => 3,
    }),
    ...aiText,
    weekPlan,
  );
  // Day plan is ~3× lighter than week-plan — cost 2.
  r.post(
    "/api/nutrition/day-plan",
    rateLimitExpress({
      key: "nutrition:day-plan",
      limit: 15,
      windowMs: 60_000,
      cost: () => 2,
    }),
    ...aiText,
    dayPlan,
  );
  r.post(
    "/api/nutrition/shopping-list",
    rateLimitExpress({
      key: "nutrition:shopping-list",
      limit: 12,
      windowMs: 60_000,
    }),
    ...aiText,
    shoppingList,
  );
  r.post(
    "/api/nutrition/backup-upload",
    rateLimitExpress({
      key: "nutrition:backup-upload",
      limit: 20,
      windowMs: 60_000,
    }),
    backupUpload,
  );
  r.post(
    "/api/nutrition/backup-download",
    rateLimitExpress({
      key: "nutrition:backup-download",
      limit: 30,
      windowMs: 60_000,
    }),
    backupDownload,
  );
  return r;
}
