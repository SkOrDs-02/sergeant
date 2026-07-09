import { Router } from "express";
import { rateLimitExpress, requireSession, setModule } from "../http/index.js";
import { createManualExpense } from "../modules/finyk/manualExpenses.js";

/**
 * `/api/finyk/*` — server-side доменні endpoint-и Фініка.
 *
 * Шлях канонізований під `/api/*`: `apiVersionRewrite` у `app.ts` переписує
 * `/api/v1/*` → `/api/*` ДО роутерів, тому той самий handler віддає дзеркало
 * під `/api/v1/finyk/*` (явна версія для мобільних клієнтів) без окремої
 * реєстрації. Реєструвати тут напряму `/api/v1/...` НЕ можна — після
 * rewrite такий шлях ніколи не зматчиться.
 *
 * Спільний guard-ланцюг (як у `coach`/`nutrition`):
 *   - `setModule("finyk")` — логер/метрики
 *   - broad rate-limit ("api:finyk")
 *   - `requireSession()` — лише авторизовані; кладе `req.user.id`
 *     (Better Auth opaque string), на який скоупиться запис. `user_id`
 *     ніколи не приймається з body.
 *
 * `POST /manual-expenses` замінює клієнтський `safeWriteLS`-bypass для
 * ручних витрат (state-write-paths doctrine) — це precondition для
 * downstream-міграції `chatActions` (поза скоупом цього PR).
 */
export function createFinykRouter(): Router {
  const r = Router();
  r.use("/api/finyk", setModule("finyk"));
  r.use(
    "/api/finyk",
    rateLimitExpress({ key: "api:finyk", limit: 120, windowMs: 60_000 }),
  );
  r.use("/api/finyk", requireSession());

  r.post(
    "/api/finyk/manual-expenses",
    rateLimitExpress({
      key: "finyk:manual-expenses",
      limit: 60,
      windowMs: 60_000,
    }),
    createManualExpense,
  );

  return r;
}
