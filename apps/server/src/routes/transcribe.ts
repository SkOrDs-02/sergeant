import { Router } from "express";
import {
  asyncHandler,
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
 *   - rate-limit 60/хв на subject (per-user або per-IP) — генерують короткі
 *     аудіо-фрагменти (5–15с) під час активної сесії, треба простір;
 *   - `requireSession()` — це per-user фіча, не публічний proxy;
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
    rateLimitExpress({ key: "api:transcribe", limit: 60, windowMs: 60_000 }),
    requireSession(),
    requireGroqKey(),
    asyncHandler(transcribeHandler),
  );
  return r;
}
