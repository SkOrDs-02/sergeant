import { Router } from "express";
import {
  rateLimitExpress,
  requireAiQuota,
  requireLlmUpstream,
  requireSession,
  setModule,
} from "../http/index.js";
import weeklyDigest from "../modules/digest/weekly-digest.js";

export function createWeeklyDigestRouter(): Router {
  const r = Router();
  r.post(
    "/api/weekly-digest",
    setModule("weekly-digest"),
    rateLimitExpress({
      key: "api:weekly-digest",
      limit: 10,
      windowMs: 60 * 60_000,
    }),
    // Дайджест — звіт про дані конкретної людини й ще один витратний
    // Anthropic-виклик. Сесія обовʼязкова з тих самих причин, що в `chat.ts`
    // (знахідка A1, `docs/90-work/audits/ai-abuse-2026-08-05.md`).
    requireSession(),
    // Той самий аргумент, що в `coach.ts`: `LLM_DIGEST_PROVIDER` типово
    // `openrouter`. Див. докстрінг `requireLlmUpstream`.
    requireLlmUpstream("digest"),
    requireAiQuota(),
    weeklyDigest,
  );
  return r;
}
