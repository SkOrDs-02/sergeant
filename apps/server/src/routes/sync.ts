import { Router } from "express";
import { rateLimitExpress, requireSession, setModule } from "../http/index.js";
import { listSyncAudit } from "../modules/sync/audit.js";
import { syncV2Pull, syncV2Push } from "../modules/sync/syncV2.js";
import { syncV2Stream } from "../modules/sync/syncV2Stream.js";
import { requireSyncV2StreamEnabled } from "../modules/sync/syncV2StreamGuard.js";

/**
 * `/api/sync/*` — read-only audit log лишається за авторизованою сесією.
 * `setModule`, pre-auth IP-лімітер, `requireSession` і per-user лімітер
 * унесені з handler-ів сюди: handler тепер просто читає `req.user` і
 * виконує бізнес-логіку.
 *
 * Порядок гейтів на кожному з двох префіксів навмисно трирівневий —
 * pre-auth IP-лімітер → `requireSession()` → per-user лімітер. Рецидив
 * знахідки B31 (PR-A3) уже вчив, що per-user лімітер має йти ПІСЛЯ сесії
 * (див. коментар біля `requireSession()` нижче); ревʼю того ж фіксу
 * знайшло зворотний бік: `requireSession()` при невдачі відповідає 401 і
 * НЕ кличе `next()`, тож поставивши лімітер ПІСЛЯ сесії, ми водночас
 * прибрали єдиний захист від безсесійного флуду — раніше спільний
 * `r.use(...)`-лімітер різав такий трафік по IP ще ДО спроби резолву
 * сесії, а `getSessionUser` усе одно йде в session-store (робота БД) на
 * кожен запит. Pre-auth IP-лімітер повертає цей захист, не займаючи
 * бакет per-user лімітера (окремий `key` із суфіксом `:ip`).
 *
 * `/api/sync/audit` (PR #005) — read-only audit log. Self-режим або
 * admin-allowlist для чужих юзерів; ділить ту ж auth/rate-limit-обгортку
 * (модуль `sync`), але навмисно НЕ використовує канал push/pull —
 * incident-response не повинен ділити budget з нормальною sync-операцією.
 *
 * `/api/v2/sync/*` (Stage 2 / PR #021) — per-row op-log sync. Єдиний
 * sync-канал починаючи з 2026-05-06 (Initiative 0003 Phase 5, ADR-0047).
 * v1 push/pull endpoint-и та їх sunset/survey middleware остаточно
 * видалено (Initiative 0003 Phase 7) — старі клієнти тепер отримують
 * голий 404 замість 410 Gone, що прийнятно після 90-денного deprecation
 * window. Власний rate-limit-budget v2 (`api:v2:sync`, 60/min — щедріший,
 * бо op-log push може бути частим) і `module=syncV2` для логів/метрик.
 */
export function createSyncRouter(): Router {
  const r = Router();
  r.use("/api/sync", setModule("sync"));
  // Pre-auth IP-лімітер — ПЕРЕД requireSession() навмисно. `requireSession()`
  // на невдачі шле 401 і не кличе `next()`, тож без цього гейта запит без
  // валідної сесії (відсутня чи підроблена кука) взагалі не діставався б до
  // per-user бакета нижче — а `getSessionUser` усе одно робить lookup у
  // session-store, тобто такий флуд коштував би роботи БД без жодного
  // ліміту. Окремий `key` (суфікс `:ip`) — інакше лічильник ділився б із
  // per-user бакетом `api:sync` і зіпсував би обидва. Ліміт 150/хв = 5×
  // per-user 30/хв: щедро для NAT/офісу з кількома залогіненими
  // користувачами (у кожного власний per-user бакет), і на порядок нижче
  // за необмежений флуд.
  r.use(
    "/api/sync",
    rateLimitExpress({ key: "api:sync:ip", limit: 150, windowMs: 60_000 }),
  );
  // requireSession() йде ПЕРЕД per-user rateLimitExpress навмисно (рецидив
  // знахідки B31, PR-A3 у `docs/work/specs/audits/2026-09-13-product-full-review.md`):
  // `rateLimitSubject` (`http/rateLimit.ts`) читає `req.user.id` і
  // фолбечиться на `ip:<addr>` лише коли сесії немає. Якщо лімітер стоїть ДО
  // requireSession, `req.user` завжди unset у момент перевірки — бакет
  // завжди per-IP, а не per-user (спільний NAT/офіс/CGNAT ділить один
  // бакет). Див. еталон у `chat.ts`.
  r.use("/api/sync", requireSession());
  r.use(
    "/api/sync",
    rateLimitExpress({ key: "api:sync", limit: 30, windowMs: 60_000 }),
  );
  r.get("/api/sync/audit", listSyncAudit);

  // sec-09: стрім закритий прапорцем `SYNC_V2_STREAM_ENABLED` (дефолт off →
  // 404), поки немає споживача. Стоїть ПЕРШИМ на цьому префіксі, щоб
  // вимкнений маршрут не відрізнявся для анонімного і залогіненого клієнта
  // (без 401 від `requireSession()` перед 404).
  r.use("/api/v2/sync/stream", requireSyncV2StreamEnabled());
  r.use("/api/v2/sync", setModule("syncV2"));
  // Той самий трирівневий порядок (pre-auth IP → сесія → per-user), той
  // самий аргумент — див. коментарі вище. Ліміт 300/хв = 5× per-user 60/хв.
  r.use(
    "/api/v2/sync",
    rateLimitExpress({
      key: "api:v2:sync:ip",
      limit: 300,
      windowMs: 60_000,
    }),
  );
  r.use("/api/v2/sync", requireSession());
  r.use(
    "/api/v2/sync",
    rateLimitExpress({ key: "api:v2:sync", limit: 60, windowMs: 60_000 }),
  );
  r.post("/api/v2/sync/push", syncV2Push);
  r.get("/api/v2/sync/pull", syncV2Pull);
  // Stage 5 / PR #041: SSE long-polling. Окрема rate-limit-категорія,
  // бо connection-handshake — це 1 hit; ми не хочемо, щоб stream-
  // reconnect-loop при flapping-мережі зʼїдав push-budget.
  r.get(
    "/api/v2/sync/stream",
    rateLimitExpress({
      key: "api:v2:sync:stream",
      limit: 30,
      windowMs: 60_000,
    }),
    syncV2Stream,
  );

  return r;
}
