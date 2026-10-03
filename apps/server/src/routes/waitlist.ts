import { Router } from "express";
import type { Request, Response } from "express";
import {
  WaitlistSubmitSchema,
  WaitlistSubmitResponseSchema,
  type WaitlistSubmitResponse,
} from "@sergeant/shared";
import { rateLimitExpress, setModule, parseBody } from "../http/index.js";
import { getSessionUser } from "../auth.js";
import pool from "../db.js";
import { submitWaitlistEntry } from "../modules/waitlist/waitlistService.js";

/**
 * Phase 0 monetization rails: `POST /api/v1/waitlist`.
 *
 * Анонімний endpoint — sign-up не потребує сесії, бо ми хочемо ловити
 * інтерес від відвідувачів `/pricing` (включно з тими, що ще не зробили
 * onboarding). Якщо сесія є — підвʼязуємо `user_id` для майбутньої
 * сегментації (наприклад, "скільки активних юзерів зацікавились Pro").
 *
 * Rate-limit: 10 submissions / IP / hour. Без цього endpoint може стати
 * email-spam vehicle (зловмисник флудить чужі адреси). Ліміт навмисно
 * генерозний — реальний користувач має залишити inquiry один раз, бот —
 * навіть один раз не зможе масштабувати.
 *
 * 200 OK з `{ created: boolean }`:
 *  - `created: true` — новий запис.
 *  - `created: false` — email уже у списку (idempotent).
 *
 * Що саме `created` розкриває, і чому це свідомо лишено. Попередня редакція
 * цього коментаря стверджувала, що ми «не розкриваємо чи email уже у БД» —
 * це було просто неправдою: `created` є рівно тим прапорцем, а
 * `WaitlistForm.tsx` показує на ньому два різні тости. Тобто endpoint —
 * оракул членства у ВЕЙТЛИСТІ, і вдавати інше не можна.
 *
 * Чому це прийнятно, на відміну від оракула по акаунтах. `waitlist_entries`
 * — окрема таблиця від акаунтів Better Auth: `created: false` означає «цей
 * email колись лишив інтерес до Pro», а не «на цей email є акаунт». Перше
 * не дає ні входу, ні підстав для цільового фішингу «ваш акаунт у
 * Sergeant»; друге давало б, і саме тому auth-роути (`sign-in`,
 * `request-password-reset`) поводяться однаково на існуючий і неіснуючий
 * email, а тутешній rate-limit (10/IP/год) ще й робить перебір списку
 * дорогим.
 *
 * **Інваріант, який тут легко зламати:** щойно цей endpoint почне
 * заглядати в таблицю користувачів (наприклад, «не дублюй waitlist для
 * вже зареєстрованих»), `created` МИТТЮ стане оракулом по акаунтах — і
 * тоді його треба прибирати з відповіді разом із двома тостами у
 * `WaitlistForm.tsx`, типом у `@sergeant/api-client` і
 * `WaitlistSubmitResponseSchema` (Hard Rule #3 — трійця рухається разом).
 * Жодного "уже зареєстровано" 4xx тут немає і бути не повинно.
 */
export function createWaitlistRouter(): Router {
  const r = Router();
  r.use("/api/v1/waitlist", setModule("waitlist"));
  r.use("/api/waitlist", setModule("waitlist"));

  const handler = async (req: Request, res: Response) => {
    const parsed = parseBody(WaitlistSubmitSchema, req);

    // Опційне привʼязування до сесії, якщо користувач залогінений. Не
    // вимагаємо сесію — це pricing-page CTA для анонімів так само.
    let userId: string | null = null;
    try {
      const sessionUser = await getSessionUser(req);
      userId = sessionUser?.id ?? null;
    } catch {
      // Будь-який збій резолюції сесії трактуємо як "анонімний" — sign-up
      // не має ламатись через тимчасову проблему з auth-таблицями.
      userId = null;
    }

    const userAgent =
      typeof req.headers["user-agent"] === "string"
        ? req.headers["user-agent"].slice(0, 256)
        : null;

    const result = await submitWaitlistEntry(pool, {
      email: parsed.email,
      tier_interest: parsed.tier_interest,
      source: parsed.source,
      locale: parsed.locale,
      user_id: userId,
      user_agent: userAgent,
    });

    const payload: WaitlistSubmitResponse = WaitlistSubmitResponseSchema.parse({
      ok: true,
      created: result.created,
    });
    res.json(payload);
  };

  r.post(
    "/api/v1/waitlist",
    rateLimitExpress({
      key: "api:waitlist",
      limit: 10,
      windowMs: 60 * 60 * 1000,
    }),
    handler,
  );
  // Legacy alias без `/v1` — `apiVersionRewrite` middleware вже мапить
  // `/api/v1/...` → `/api/...`, але реєструємо обидва, щоб не лежати від
  // порядку monter-ів у `app.ts`.
  r.post(
    "/api/waitlist",
    rateLimitExpress({
      key: "api:waitlist",
      limit: 10,
      windowMs: 60 * 60 * 1000,
    }),
    handler,
  );

  return r;
}
