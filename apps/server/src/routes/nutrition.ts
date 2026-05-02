import { Router } from "express";
import {
  asyncHandler,
  rateLimitExpress,
  requireAiQuota,
  requireAnthropicKey,
  requireSession,
  setModule,
} from "../http/index.js";
import analyzePhoto from "../modules/nutrition/analyze-photo.js";
import parsePantry from "../modules/nutrition/parse-pantry.js";
import refinePhoto from "../modules/nutrition/refine-photo.js";
import recommendRecipes from "../modules/nutrition/recommend-recipes.js";
import dayHint from "../modules/nutrition/day-hint.js";
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
 */
export function createNutritionRouter(): Router {
  const r = Router();
  r.use("/api/nutrition", setModule("nutrition"));
  r.use(
    "/api/nutrition",
    rateLimitExpress({ key: "api:nutrition", limit: 120, windowMs: 60_000 }),
  );
  r.use("/api/nutrition", requireSession());

  const ai = [requireAnthropicKey(), requireAiQuota()];

  r.post(
    "/api/nutrition/analyze-photo",
    rateLimitExpress({
      key: "nutrition:analyze-photo",
      limit: 20,
      windowMs: 60_000,
    }),
    ...ai,
    asyncHandler(analyzePhoto),
  );
  r.post(
    "/api/nutrition/parse-pantry",
    rateLimitExpress({
      key: "nutrition:parse-pantry",
      limit: 60,
      windowMs: 60_000,
    }),
    ...ai,
    asyncHandler(parsePantry),
  );
  r.post(
    "/api/nutrition/refine-photo",
    rateLimitExpress({
      key: "nutrition:refine-photo",
      limit: 20,
      windowMs: 60_000,
    }),
    ...ai,
    asyncHandler(refinePhoto),
  );
  r.post(
    "/api/nutrition/recommend-recipes",
    rateLimitExpress({
      key: "nutrition:recommend-recipes",
      limit: 20,
      windowMs: 60_000,
    }),
    ...ai,
    asyncHandler(recommendRecipes),
  );
  r.post(
    "/api/nutrition/day-hint",
    rateLimitExpress({
      key: "nutrition:day-hint",
      limit: 30,
      windowMs: 60_000,
    }),
    ...ai,
    asyncHandler(dayHint),
  );
  r.post(
    "/api/nutrition/week-plan",
    rateLimitExpress({
      key: "nutrition:week-plan",
      limit: 10,
      windowMs: 60_000,
    }),
    ...ai,
    asyncHandler(weekPlan),
  );
  r.post(
    "/api/nutrition/day-plan",
    rateLimitExpress({
      key: "nutrition:day-plan",
      limit: 15,
      windowMs: 60_000,
    }),
    ...ai,
    asyncHandler(dayPlan),
  );
  r.post(
    "/api/nutrition/shopping-list",
    rateLimitExpress({
      key: "nutrition:shopping-list",
      limit: 12,
      windowMs: 60_000,
    }),
    ...ai,
    asyncHandler(shoppingList),
  );
  r.post(
    "/api/nutrition/backup-upload",
    rateLimitExpress({
      key: "nutrition:backup-upload",
      limit: 20,
      windowMs: 60_000,
    }),
    asyncHandler(backupUpload),
  );
  r.post(
    "/api/nutrition/backup-download",
    rateLimitExpress({
      key: "nutrition:backup-download",
      limit: 30,
      windowMs: 60_000,
    }),
    asyncHandler(backupDownload),
  );
  return r;
}
