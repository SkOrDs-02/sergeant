import { Router } from "express";
import { rateLimitExpress, requireSession, setModule } from "../http/index.js";
import { createManualExpense } from "../modules/finyk/manualExpenses.js";
import lookupReceiptHandler from "../modules/finyk/receipts/lookup.js";
import analyzeReceiptHandler from "../modules/finyk/receipts/analyze.js";
import saveReceiptHandler from "../modules/finyk/receipts/save.js";
import getReceiptHandler from "../modules/finyk/receipts/get.js";

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
 *
 * Чек-скан v1 (`docs/90-work/planning/specs/receipt-scan.md`):
 *   - `POST /receipts/lookup` — QR/ДПС-шлях, draft без запису в БД.
 *     Тісніший rate-limit — спільний ліміт ДПС-токена 1000 запитів/добу.
 *   - `POST /receipts/analyze` — vision-fallback (фото без QR), draft без
 *     запису в БД. Тісніший rate-limit — платний AI-виклик.
 *   - `POST /receipts` — save: matcher → receipt+items+link (mono) АБО
 *     receipt+items+manual-expense+link (unmatched). Ідемпотентний
 *     повторний скан.
 *   - `GET /receipts/:id` — чек з позиціями для розгортки; під широким
 *     module-limit-ом (дешевий read, скоуп по user_id у самому handler-і).
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

  r.post(
    "/api/finyk/receipts/lookup",
    rateLimitExpress({
      key: "finyk:receipts-lookup",
      limit: 30,
      windowMs: 60_000,
    }),
    lookupReceiptHandler,
  );
  r.post(
    "/api/finyk/receipts/analyze",
    rateLimitExpress({
      key: "finyk:receipts-analyze",
      limit: 20,
      windowMs: 60_000,
    }),
    analyzeReceiptHandler,
  );
  r.post(
    "/api/finyk/receipts",
    rateLimitExpress({
      key: "finyk:receipts-save",
      limit: 30,
      windowMs: 60_000,
    }),
    saveReceiptHandler,
  );
  r.get("/api/finyk/receipts/:id", getReceiptHandler);

  return r;
}
