import { Router } from "express";
import type { Pool } from "pg";
import {
  rateLimitExpress,
  requireAiQuota,
  requireLlmUpstream,
  requireSession,
  setModule,
} from "../http/index.js";
import { requireFeature } from "../modules/billing/index.js";
import {
  requireHealthConsent,
  scrubGoalWithoutHealthConsent,
} from "../lib/healthConsent.js";
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
 *   - pre-auth IP-лімітер ("api:nutrition:ip") — стоїть ПЕРЕД
 *     `requireSession()`. `requireSession()` на невдачі шле 401 і не кличе
 *     `next()`, тож без цього гейта безсесійний флуд (відсутня/підроблена
 *     кука) взагалі не діставався б до per-user бакета нижче, а
 *     `getSessionUser` усе одно робить lookup у session-store на кожен
 *     такий запит. Окремий `key` (суфікс `:ip`), ліміт 600/хв = 5×
 *     per-user 120/хв.
 *   - `requireSession()` — лише авторизовані користувачі (cookie або Bearer)
 *   - broad rate-limit ("api:nutrition") — гасить shotgun-атаки, per-user
 *     (`requireSession()` стоїть ПЕРЕД лімітером, щоб `rateLimitSubject`
 *     бачив `req.user.id`, а не фолбечився на IP — PR-A3)
 *
 * Per-endpoint rate-limit + AI-guards навішуємо нижче: backup-endpoint-и не
 * ходять у Anthropic і не мають тратити квоту, тому `requireAnthropicKey` /
 * `requireAiQuota` до них не застосовуємо.
 *
 * Пакетування за реєстром доступу (`docs/work/specs/access-tiers.md`):
 *   - `analyze-photo` списує 1 з окремого тижневого відра фото (`week:photo`,
 *     Free 3 на тиждень) і не чіпає спільні дії. `refine-photo` того самого
 *     знімка нічого не списує: це продовження тієї самої дії.
 *   - `week-plan` тільки для Premium (`requireFeature("nutrition.weekPlan")`),
 *     гейт стоїть ПЕРЕД квотою, щоб Free отримав 402 до списання.
 *   - Решта nutrition-AI (денний план, рецепти, покупки, комора) коштує 1 дію
 *     з тижневих `ai.actions`.
 */
export function createNutritionRouter({ pool }: { pool: Pool }): Router {
  const r = Router();
  r.use("/api/nutrition", setModule("nutrition"));
  r.use(
    "/api/nutrition",
    rateLimitExpress({
      key: "api:nutrition:ip",
      limit: 600,
      windowMs: 60_000,
    }),
  );
  // requireSession() йде ПЕРЕД per-user rateLimitExpress навмисно (рецидив
  // знахідки B31, PR-A3 у `docs/work/specs/audits/2026-09-13-product-full-review.md`):
  // `rateLimitSubject` (`http/rateLimit.ts`) читає `req.user.id` і
  // фолбечиться на `ip:<addr>` лише коли сесії немає. Якщо лімітер стоїть ДО
  // requireSession, `req.user` завжди unset у момент перевірки — бакет
  // завжди per-IP. Див. еталон у `chat.ts`.
  r.use("/api/nutrition", requireSession());
  r.use(
    "/api/nutrition",
    rateLimitExpress({ key: "api:nutrition", limit: 120, windowMs: 60_000 }),
  );

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
    // Фото страв — дані про здоровʼя (GDPR Art. 9, `privacyDocument.ts`). Гейт
    // стоїть ПЕРЕД квотою: людина, якій треба дати згоду, не платить за це.
    requireHealthConsent(),
    requireLlmUpstream("vision"),
    requireAiQuota("photo"),
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
    // ponytail: refine не має власної квоти, стелю тримає лише rate limit
    // 20/хв; окреме відро, якщо refine почнуть ганяти без analyze.
    requireHealthConsent(),
    requireLlmUpstream("vision"),
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
    scrubGoalWithoutHealthConsent(),
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
    requireFeature(pool, "nutrition.weekPlan"),
    scrubGoalWithoutHealthConsent(),
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
    // День-план будується від КБЖВ-цілей: це калорії, тобто дані про здоровʼя.
    requireHealthConsent(),
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
