import { Router } from "express";
import type { Pool } from "pg";
import {
  rateLimitExpress,
  requireGroqKey,
  requireSession,
  setModule,
} from "../http/index.js";
import { requirePlan } from "../modules/billing/index.js";
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
 *   - `requirePlan(pool, "pro")` — голос є Pro-фічею (V1, рішення власника
 *     2026-09-11). Стоїть ПІСЛЯ лімітера й ПЕРЕД `requireGroqKey` — той
 *     самий порядок, що в `nutrition.ts` для vision-ендпоінтів: спершу
 *     дешева перевірка без БД, потім план, і аж тоді ключ, щоб free-юзер
 *     отримав 402 незалежно від того, чи налаштований Groq;
 *   - `requireGroqKey()` — 503 без ключа, фронт переходить на Web Speech.
 *
 * Body parser змонтовано окремо в `app.ts` як `express.raw({ type: "audio/*" })`
 * — JSON-парсер тут НЕ потрібен, бо тіло сире.
 *
 * AI-DANGER: `requirePlan` — NO-OP при `STRIPE_ENABLED=false`, тобто
 * СЬОГОДНІ він не закриває нічого. Це не недогляд і не привід його
 * прибрати: гейт стане чинним у ту саму хвилину, коли ввімкнуть білінг,
 * і поставити його зараз дешевше, ніж згадати потім. Але сам по собі він
 * НЕ є відповіддю на «ендпоінт доступний в обхід UI» — цю діру тримає
 * закритою денний USD-cap (`modules/transcribe/usdCap.ts`), і саме його
 * треба рухати, якщо потрібен ефект тут і зараз. Плутати ці два важелі —
 * рівно та помилка, через яку гейт виглядає робочим і мовчить.
 */
export function createTranscribeRouter({ pool }: { pool: Pool }): Router {
  const r = Router();
  r.post(
    "/api/transcribe",
    setModule("transcribe"),
    requireSession(),
    rateLimitExpress({ key: "api:transcribe", limit: 60, windowMs: 60_000 }),
    requirePlan(pool, "pro"),
    requireGroqKey(),
    transcribeHandler,
  );
  return r;
}
