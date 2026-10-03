import { Router } from "express";
import type { Pool } from "pg";
import {
  rateLimitExpress,
  requireGroqKey,
  requireSession,
  setModule,
} from "../http/index.js";
import { TRANSCRIBE_HEALTH_MODULES } from "@sergeant/shared";
import { requireHealthConsent } from "../lib/healthConsent.js";
import { requireFeature } from "../modules/billing/index.js";
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
 *   - `requireHealthConsent` — лише для `?module=nutrition|fizruk`
 *     (`isHealthVoiceRequest`): 403 `HEALTH_CONSENT_REQUIRED` до плану,
 *     Groq і USD-cap;
 *   - `requirePlan(pool, "pro")` — голос є Pro-фічею (V1, рішення власника
 *     2026-09-11). Стоїть ПІСЛЯ обох лімітерів і ПЕРЕД `requireGroqKey` —
 *     той самий порядок, що в `nutrition.ts` для vision-ендпоінтів:
 *     спершу дешеві перевірки без БД, потім план (він робить SELECT), і аж
 *     тоді ключ, щоб free-юзер отримав 402 незалежно від того, чи
 *     налаштований Groq;
 *   - `requireGroqKey()` — 503 без ключа, фронт переходить на Web Speech.
 *
 * Body parser змонтовано окремо в `app.ts` як `express.raw({ type: "audio/*" })`
 * — JSON-парсер тут НЕ потрібен, бо тіло сире.
 *
 * AI-DANGER: `requirePlan` тут ЧИННИЙ — але так було не завжди, і це
 * варто знати, читаючи сусідні файли.
 *
 * До 2026-09-16 гейт починався з `if (!env.STRIPE_ENABLED) return next()`.
 * У проді Stripe вимкнений (продають LiqPay і Plata), тож умова
 * виконувалась завжди, і всі чотири платні поверхні — ця, `ai-memory` і
 * дві nutrition-vision — були відкриті безкоштовно. Тепер умова питає
 * `isBillingEnforced()`, тобто «чи ввімкнено ХОЧ ОДНОГО провайдера», і
 * байпас лишився рівно для середовищ, де білінг не запущено взагалі
 * (локальна розробка, preview).
 *
 * Денний USD-cap (`modules/transcribe/usdCap.ts`) від цього не стає
 * зайвим: гейт відповідає на «хто має право», cap — на «скільки це може
 * коштувати», і друге питання лишається чинним для платників теж.
 */
/**
 * Чи заявлено health-модуль у `?module=`.
 *
 * AI-NOTE: тег декларативний, клієнт може збрехати або не передати його
 * (старі клієнти) — тоді гейт мовчить. Це осмислений компроміс (рішення
 * власника 2026-09-30): сервер не бачить екрана, з якого пішов запит, а
 * гейт потрібен, щоб чесний клієнт не відправляв аудіо про їжу й тренування
 * в Groq без згоди (GDPR Art. 9). Невідомий тег = відсутній = відкрито.
 */
export function isHealthVoiceRequest(req: {
  query?: Record<string, unknown>;
}): boolean {
  const tag = req.query?.["module"];
  return (
    typeof tag === "string" &&
    TRANSCRIBE_HEALTH_MODULES.includes(tag.trim().toLowerCase())
  );
}

export function createTranscribeRouter({ pool }: { pool: Pool }): Router {
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
    // Згода — ДО плану, ключа, USD-cap і Groq: людина, якій треба дати
    // згоду, не платить за це квотою (той самий порядок, що в nutrition).
    requireHealthConsent(isHealthVoiceRequest),
    requireFeature(pool, "ai.voice"),
    requireGroqKey(),
    transcribeHandler,
  );
  return r;
}
