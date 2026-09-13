import { Router } from "express";
import {
  rateLimitExpress,
  requireGroqKey,
  requireSession,
  setModule,
} from "../http/index.js";
import transcribeHandler from "../modules/transcribe/transcribe.js";

/**
 * `/api/transcribe` — голосова транскрипція через Groq Whisper.
 *
 * Чейн middleware:
 *   - `setModule("transcribe")` — теги в логах/метриках;
 *   - pre-auth IP-лімітер (`api:transcribe:ip`, 300/хв) — ПЕРЕД
 *     `requireSession()`: `requireSession()` на невдачі шле 401 і не кличе
 *     `next()`, тож без цього гейта безсесійний флуд (відсутня/підроблена
 *     кука) взагалі не діставався б до per-user бакета нижче, а
 *     `getSessionUser` усе одно робить lookup у session-store на кожен
 *     такий запит. Окремий `key` (суфікс `:ip`), ліміт 300/хв = 5×
 *     per-user 60/хв;
 *   - `requireSession()` — це per-user фіча, не публічний proxy;
 *   - rate-limit 60/хв per-user (`rateLimitSubject` резолвить `req.user.id`,
 *     бо `requireSession()` стоїть ПЕРЕД цим лімітером — рецидив знахідки
 *     B31, PR-A3 у `docs/work/specs/audits/2026-09-13-product-full-review.md`;
 *     без сесії перед лімітером бакет завжди фолбечиться на `ip:<addr>`, а
 *     IPv6-клієнт має /64, тож per-user ліміт обходиться зміною адреси);
 *   - `requireGroqKey()` — 503 без ключа, фронт переходить на Web Speech.
 *
 * Body parser змонтовано окремо в `app.ts` як `express.raw({ type: "audio/*" })`
 * — JSON-парсер тут НЕ потрібен, бо тіло сире.
 */
export function createTranscribeRouter(): Router {
  const r = Router();
  r.post(
    "/api/transcribe",
    setModule("transcribe"),
    rateLimitExpress({
      key: "api:transcribe:ip",
      limit: 300,
      windowMs: 60_000,
    }),
    requireSession(),
    rateLimitExpress({ key: "api:transcribe", limit: 60, windowMs: 60_000 }),
    requireGroqKey(),
    transcribeHandler,
  );
  return r;
}
