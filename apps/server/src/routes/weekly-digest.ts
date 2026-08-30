import { Router } from "express";
import {
  rateLimitExpress,
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
    // Дайджест ПОЗА добовою AI-квотою (рішення founder-а 2026-08-30):
    // один виклик flash-lite коштує частки цента, а квота списувала за
    // нього 1 із 5 денних Free-запитів — 20% бюджету за найдешевший шлях
    // шару. Це також єдиний шлях, що самозапускається (понеділкова
    // автогенерація), і opt-in юзер втрачав квоту без власної дії.
    // Захист від абʼюзу лишається: rate-limit 10/год вище + сесія.
    weeklyDigest,
  );
  return r;
}
