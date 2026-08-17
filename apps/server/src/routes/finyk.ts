import { Router } from "express";
import { rateLimitExpress, requireSession, setModule } from "../http/index.js";
import { createManualExpense } from "../modules/finyk/manualExpenses.js";
import lookupReceiptHandler from "../modules/finyk/receipts/lookup.js";
import analyzeReceiptHandler from "../modules/finyk/receipts/analyze.js";
import saveReceiptHandler from "../modules/finyk/receipts/save.js";
import getReceiptHandler from "../modules/finyk/receipts/get.js";
import screenshotAnalyzeHandler from "../modules/finyk/import/screenshotAnalyze.js";
import statementPreviewHandler from "../modules/finyk/import/statementPreview.js";
import commitImportHandler from "../modules/finyk/import/commit.js";
import {
  deleteImportBatchHandler,
  getImportBatchHandler,
} from "../modules/finyk/import/batches.js";

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
 *
 * Масове ведення — Фаза 2а/2б (той самий документ § «Фаза 2 — Масове
 * ведення»), модуль `modules/finyk/import/`. Batch-чеки (N × v1-ендпоінтів
 * вище) — НЕ поверхня цих роутів; журнал `import_batches` тут покриває
 * лише transaction-рядки (скріни банкінгу / виписки CSV):
 *   - `POST /import/screenshot/analyze` — vision-розпізнавання скріна
 *     банкінгу, draft без запису в БД. Платний AI-виклик — той самий
 *     тісніший rate-limit клас, що `/receipts/analyze`.
 *   - `POST /import/statement/preview` — CSV-only парсинг виписки
 *     (автопрофілі mono/Privat24 + ручний column-mapper), без запису в БД.
 *   - `POST /import/commit` — триярусний дедуп (mono-matcher +
 *     between-imports row-key) → `import_batches` + `finyk_manual_expenses`
 *     рядки. Найтісніший rate-limit — єдиний write-шлях цього модуля.
 *   - `GET /import/batches/:id` — статус/підсумок батчу; широкий
 *     module-limit (скоуп по user_id у самому handler-і).
 *   - `DELETE /import/batches/:id` — undo батчу (tombstone
 *     `created_row_ids`), ідемпотентний повторний виклик; широкий
 *     module-limit.
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

  r.post(
    "/api/finyk/import/screenshot/analyze",
    rateLimitExpress({
      key: "finyk:import-screenshot-analyze",
      limit: 20,
      windowMs: 60_000,
    }),
    screenshotAnalyzeHandler,
  );
  r.post(
    "/api/finyk/import/statement/preview",
    rateLimitExpress({
      key: "finyk:import-statement-preview",
      limit: 30,
      windowMs: 60_000,
    }),
    statementPreviewHandler,
  );
  r.post(
    "/api/finyk/import/commit",
    rateLimitExpress({
      key: "finyk:import-commit",
      limit: 10,
      windowMs: 60_000,
    }),
    commitImportHandler,
  );
  r.get("/api/finyk/import/batches/:id", getImportBatchHandler);
  r.delete("/api/finyk/import/batches/:id", deleteImportBatchHandler);

  return r;
}
