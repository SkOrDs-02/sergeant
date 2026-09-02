import { Router } from "express";
import {
  rateLimitExpress,
  requireAiQuota,
  requireLlmUpstream,
  requireSession,
  setModule,
} from "../http/index.js";
import {
  coachInsight,
  coachMemoryGet,
  coachMemoryPost,
} from "../modules/chat/coach.js";

/**
 * `/api/coach/*` — розведено на окремі route-и з точним HTTP-методом і своїм
 * ланцюгом middleware:
 *   - `GET/POST /memory` — читання/запис памʼяті; тільки session.
 *   - `POST /insight`   — генерація пораду через Anthropic; session + ключ + квота.
 */
export function createCoachRouter(): Router {
  const r = Router();
  r.use("/api/coach", setModule("coach"));
  // Усі coach-роути потребують сесії, тож вона стоїть на рівні роутера і
  // ПЕРЕД лімітером (B31 у `chat.ts`; тут — SEC-1 продуктового аудиту
  // 2026-09): `rateLimitSubject` бакетить по `req.user.id`, а без сесії в
  // момент перевірки — по `ip:<addr>`. З лімітером попереду «20/год на
  // юзера» насправді було per-IP.
  r.use("/api/coach", requireSession());
  r.use(
    "/api/coach",
    rateLimitExpress({ key: "api:coach", limit: 20, windowMs: 60 * 60_000 }),
  );
  r.get("/api/coach/memory", coachMemoryGet);
  r.post("/api/coach/memory", coachMemoryPost);
  r.post(
    "/api/coach/insight",
    // Коуч типово ходить шлюзом (`LLM_COACH_PROVIDER=openrouter`), тож
    // Anthropic-ключ йому потрібен лише як фолбек. Гейт питає про ключ
    // ТОГО провайдера, який реально обере `getLLMProvider()` — інакше
    // роут або 503-ив дарма, або (гірше) віддавав stub-текст із 200.
    // Докстрінг `requireLlmUpstream`, знахідка B31 у решті роутів.
    requireLlmUpstream("coach"),
    requireAiQuota(),
    coachInsight,
  );
  return r;
}
