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
import getRecentImportsHandler from "../modules/finyk/import/recent.js";

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
 *     ДВА ліміти: per-user 30/хв (дешевий відсів) + ГЛОБАЛЬНИЙ добовий
 *     бюджет 800/добу з фіксованим subject-ом — ДПС-токен один на всіх
 *     користувачів із квотою 1000 запитів/добу (ревʼю PR #818: per-user
 *     ліміт сам по собі квоту не обмежує), 200 лишаємо на запас/ретраї.
 *     failMode closed: при деградації лімітера краще відмовити, ніж
 *     спалити спільну квоту (vision-шлях і так працює).
 *   - `POST /receipts/analyze` — vision-fallback (фото без QR), draft без
 *     запису в БД. Тісніший rate-limit — платний AI-виклик; failMode
 *     closed (ревʼю PR #818): при відмові Redis+PG per-process бакети
 *     множили б дозволений спенд на кількість інстансів.
 *   - `POST /receipts` — save: matcher → receipt+items+link (mono) АБО
 *     receipt+items+manual-expense+link (unmatched). Ідемпотентний
 *     повторний скан.
 *   - `GET /receipts/:id` — чек з позиціями для розгортки; явний
 *     per-route ліміт (дешевий read, але CodeQL/консистентність — кожен
 *     DB-роут несе власний ліміттер; скоуп по user_id у handler-і).
 *
 * Масове ведення — Фаза 2а/2б (той самий документ § «Фаза 2 — Масове
 * ведення»), модуль `modules/finyk/import/`. Batch-чеки (N × v1-ендпоінтів
 * вище) — НЕ поверхня цих роутів; журнал `import_batches` тут покриває
 * лише transaction-рядки (скріни банкінгу / виписки CSV):
 *   - `POST /import/screenshot/analyze` — vision-розпізнавання скріна
 *     банкінгу, draft без запису в БД. Платний AI-виклик — той самий
 *     тісніший rate-limit клас і failMode closed, що `/receipts/analyze`.
 *   - `POST /import/statement/preview` — CSV-only парсинг виписки
 *     (автопрофілі mono/Privat24 + ручний column-mapper), без запису в БД.
 *   - `POST /import/commit` — триярусний дедуп (mono-matcher +
 *     between-imports row-key) → `import_batches` + `finyk_manual_expenses`
 *     рядки. Найтісніший rate-limit — єдиний write-шлях цього модуля.
 *   - `GET /import/batches/:id` — статус/підсумок батчу; явний
 *     per-route ліміт (скоуп по user_id у самому handler-і).
 *   - `DELETE /import/batches/:id` — undo батчу (tombstone
 *     `created_row_ids`), ідемпотентний повторний виклик; явний
 *     per-route ліміт.
 */
const DPS_DAILY_GLOBAL_SUBJECT = "dps-token-daily";
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
    rateLimitExpress({
      key: "finyk:dps-daily-budget",
      limit: 800,
      windowMs: 86_400_000,
      subject: () => DPS_DAILY_GLOBAL_SUBJECT,
      failMode: "closed",
    }),
    lookupReceiptHandler,
  );
  r.post(
    "/api/finyk/receipts/analyze",
    rateLimitExpress({
      key: "finyk:receipts-analyze",
      limit: 20,
      windowMs: 60_000,
      failMode: "closed",
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
  r.get(
    "/api/finyk/receipts/:id",
    rateLimitExpress({
      key: "finyk:receipts-get",
      limit: 60,
      windowMs: 60_000,
    }),
    getReceiptHandler,
  );

  r.post(
    "/api/finyk/import/screenshot/analyze",
    rateLimitExpress({
      key: "finyk:import-screenshot-analyze",
      limit: 20,
      windowMs: 60_000,
      failMode: "closed",
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
  r.get(
    "/api/finyk/import/batches/:id",
    rateLimitExpress({
      key: "finyk:import-batches-get",
      limit: 60,
      windowMs: 60_000,
    }),
    getImportBatchHandler,
  );
  r.delete(
    "/api/finyk/import/batches/:id",
    rateLimitExpress({
      key: "finyk:import-batches-undo",
      limit: 20,
      windowMs: 60_000,
    }),
    deleteImportBatchHandler,
  );
  r.get(
    "/api/finyk/import/recent",
    rateLimitExpress({
      key: "finyk:import-recent",
      limit: 60,
      windowMs: 60_000,
    }),
    getRecentImportsHandler,
  );

  return r;
}
