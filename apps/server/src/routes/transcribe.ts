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
 *   - `requireSession()` — це per-user фіча, не публічний proxy;
 *   - rate-limit 60/хв per-user (`rateLimitSubject` резолвить `req.user.id`,
 *     бо `requireSession()` стоїть ПЕРЕД лімітером — рецидив знахідки B31,
 *     PR-A3 у `docs/work/specs/audits/2026-09-13-product-full-review.md`;
 *     без сесії перед лімітером бакет завжди фолбечиться на `ip:<addr>`, а
 *     IPv6-клієнт має /64, тож денний ліміт обходиться зміною адреси);
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
    requireSession(),
    rateLimitExpress({ key: "api:transcribe", limit: 60, windowMs: 60_000 }),
    requireGroqKey(),
    transcribeHandler,
  );
  return r;
}
