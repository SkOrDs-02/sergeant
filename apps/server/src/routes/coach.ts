import { Router } from "express";
import {
  AI_MEMORY_BROWSE_IP_RATE_LIMIT,
  AI_MEMORY_BROWSE_RATE_LIMIT,
} from "../config/rateLimit.js";
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
 *   - `GET /memory`     — дешеве читання памʼяті; сесія + бакет дешевих
 *                          читань памʼяті AI (`api:ai-memory:browse`).
 *   - `POST /memory`    — запис памʼяті; сесія + `api:coach` 20/год.
 *   - `POST /insight`   — генерація поради через модель; сесія + `api:coach`
 *                          20/год + ключ + квота.
 *
 * AI-CONTEXT (С-3 (а), 2026-11-18): до цього `api:coach` 20/год висів на
 * весь префікс, і читання памʼяті, яке хаб робить перед автогенерацією звіту
 * тижня, ділило бюджет із викликами моделі: могло отримати 429 або зʼїсти
 * квоту коуча. Читання без виклику моделі тепер іде під той самий бакет, що
 * list/delete памʼяті AI (`config/rateLimit.ts`), з тими самими числами.
 */
export function createCoachRouter(): Router {
  const r = Router();
  r.use("/api/coach", setModule("coach"));
  // Читання памʼяті реєструється ОДНИМ роутом і ПЕРЕД роутерним
  // `requireSession()` нижче: pre-auth IP-бакет мусить стояти до сесії (та
  // на невдачі шле 401 без `next()`, тож безсесійний флуд інакше не
  // діставався б до жодного бакета), а per-user бакет після неї. Два окремі
  // `r.get` на той самий шлях давали дубль у знімку `registerRoutes`.
  // Імена ідентифікаторів важать: гейт `check-auth-before-rate-limit.mjs`
  // відрізняє pre-auth IP-бакет від per-user лімітера за `preAuthIp` в імені
  // (або суфіксом `:ip` в інлайновому ключі), як у `routes/ai-memory.ts`.
  const browsePreAuthIp = rateLimitExpress(AI_MEMORY_BROWSE_IP_RATE_LIMIT);
  const browseRateLimit = rateLimitExpress(AI_MEMORY_BROWSE_RATE_LIMIT);
  r.get(
    "/api/coach/memory",
    browsePreAuthIp,
    requireSession(),
    browseRateLimit,
    coachMemoryGet,
  );
  // Усі coach-роути потребують сесії, тож вона стоїть на рівні роутера і
  // ПЕРЕД per-user лімітерами (B31 у `chat.ts`; тут — SEC-1 продуктового
  // аудиту 2026-09): `rateLimitSubject` бакетить по `req.user.id`, а без
  // сесії в момент перевірки — по `ip:<addr>`. З лімітером попереду «20/год
  // на юзера» насправді було per-IP.
  r.use("/api/coach", requireSession());
  const coachRateLimit = rateLimitExpress({
    key: "api:coach",
    limit: 20,
    windowMs: 60 * 60_000,
  });
  r.post("/api/coach/memory", coachRateLimit, coachMemoryPost);
  r.post(
    "/api/coach/insight",
    coachRateLimit,
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
