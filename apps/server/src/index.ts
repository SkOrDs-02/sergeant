/**
 * Server entrypoint (Railway, API-only). Runtime config lives in
 * `server/config.js`.
 *
 * IMPORTANT: `./sentry.js` is imported FIRST, before `express` or any
 * transitively-loaded HTTP module. ESM evaluates imports depth-first in
 * declaration order, so `Sentry.init()` at the top of that module runs
 * before `http`/`express` are pulled in — which is the only way Sentry's
 * auto-instrumentation (it uses OTel internally) can monkey-patch them.
 * See `apps/server/src/sentry.ts`.
 */
import "./sentry.js";

import { assertStartupEnv } from "./env/env.js";
import { assertBetterAuthStartupEnv } from "./env/betterAuthEnv.js";

assertStartupEnv();
assertBetterAuthStartupEnv();

import type { Server } from "http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { drainReplicaPool } from "./dbReplica.js";
import { env } from "./env.js";
import { providerUpstreamReady } from "./http/requireAnthropicKey.js";
import { markStartupComplete } from "./lib/appState.js";
import {
  markSchemaDriftCheckStarted,
  reportSchemaDriftAtBoot,
} from "./lib/schemaDrift.js";
import { seedGenericFoods } from "./modules/nutrition/genericFoods.js";
import {
  startAuthMailWorker,
  type StartedAuthMailWorker,
} from "./lib/jobs/authMail.js";
import {
  startFtuxDripWorker,
  type StartedFtuxDripWorker,
} from "./lib/jobs/ftuxDrip.js";
import {
  startReminderScheduler,
  type StartedReminderScheduler,
} from "./lib/reminders/scheduler.js";
import { endPoolWithAbortTimeout } from "./lib/poolShutdown.js";
import { shutdownPostHogAi } from "./lib/posthogAi.js";
import { connectRedis, disconnectRedis } from "./lib/redis.js";
import {
  startMemoryIngestWorker,
  type StartedMemoryIngestWorker,
} from "./modules/ai-memory/ingestQueue.js";
import {
  startMonoEnrichmentWorker,
  type StartedWorker,
} from "./modules/mono/enrichmentWorker.js";
import {
  startMonoMccBatchWorker,
  type StartedBatchWorker,
} from "./modules/mono/batchEnrichmentWorker.js";
import { logger, serializeError } from "./obs/logger.js";
// Імпорт ініціалізує `registerAuthMailDispatcher` як side-effect, тож worker
// має кому делегувати job-и. Винесено вище за `startAuthMailWorker`, щоб
// інакше lazy-import з Better-Auth-callback-у міг race-нути з першим job-ом.
import "./email/authTransactionalMail.js";
// Той самий register-pattern для FTUX-drip-у. Імпорт реєструє dispatcher,
// `configureFtuxDripDispatcher` нижче передає pg-pool.
import { configureFtuxDripDispatcher } from "./email/ftuxDripMail.js";
import {
  startPoolSampler,
  uncaughtExceptionsTotal,
  unhandledRejectionsTotal,
} from "./obs/metrics.js";
import { applyInfraMonthlyCosts, applyVoyageDailyBudget } from "./obs/cost.js";
import { anthropicBudgetGuard } from "./obs/anthropicBudgetGuard.js";
import {
  pingSecurityRoom,
  registerSecurityEventsRoom,
} from "./obs/securityEventsRoom.js";
import { LogArchivePoller } from "./modules/logRetention/archivePoller.js";
import { WebhookEventsRetentionPoller } from "./modules/webhooks/retentionPoller.js";
import { PlataSyncPoller } from "./modules/billing/plataSync.js";
import { GdprCleanupPoller } from "./modules/gdpr/cleanupPoller.js";
import { AccountDeletionPoller } from "./modules/me/deletionPoller.js";
import { SilpoSyncPoller } from "./modules/silpo/syncScheduler.js";
import { Sentry } from "./sentry.js";

const app = createApp({
  servesFrontend: config.servesFrontend,
  distPath: config.distPath,
  trustProxy: config.trustProxy,
});

startPoolSampler(pool);
// PR-33 — push env-driven monthly USD subscription cost-и у Prometheus
// Gauge `infra_monthly_cost_usd`. Idempotent; запускається до listen()
// щоб /metrics експозовував cost-серії з самого старту.
applyInfraMonthlyCosts();
// PR-38 (48-plan) — soft daily-burn threshold для Voyage embeddings.
// Gauge `voyage_daily_budget_usd` зчитується Prometheus-rule-ом
// `voyage-cost.yml` (warn @ 80%, page @ 100%). No-op коли env
// `VOYAGE_DAILY_BUDGET_USD` ≤ 0.
applyVoyageDailyBudget();
connectRedis();
// PR-14 (48-plan) — Anthropic daily budget alert ($3 soft / $5 hard).
// Periodic background tick рахує `aiCostEstimateUsd{provider="anthropic"}`
// delta за поточну UTC-добу і кидає Sentry-event при перевищенні
// порогів. Sentry → n8n `03-sentry-alert-routing` → Telegram (existing pipeline).
// Idempotency через Redis `SET NX EX` з fallback на in-memory Set.
// No-op коли `ANTHROPIC_BUDGET_ALERT_ENABLED=false`.
anthropicBudgetGuard.start();
// I7 — Register security events Telegram push listener.
// Must run after process env is fully loaded (assertStartupEnv runs before
// this point via app.ts). Fail-open: errors are logged, never fatal.
registerSecurityEventsRoom();

// I7 follow-on — preflight reachability check for the Telegram push channel
// via `getMe`. Surfaces rotated/expired bot tokens or unset env at boot,
// instead of silently when the first security event fires. Counter bumps
// fan out to Grafana (`security_room_unreachable_total`).
void pingSecurityRoom().then(({ ok, reason }) => {
  if (ok) {
    logger.info({
      msg: "security_events_room_reachable",
      ...(reason ? { reason } : {}),
    });
  } else {
    logger.error({ msg: "security_events_room_unreachable", reason });
  }
});

// Mono AI enrichment worker — polling-консьюмер `mono_ai_enrichment_queue`.
// Стартує у тому ж процесі, що API (in-process worker). Це свідомий вибір:
// при поточному обʼємі трафіку (десятки tx/min) виносити окремий worker-сервіс
// — оверкіл, а multi-replica-safety гарантує `FOR UPDATE SKIP LOCKED` у
// `runEnrichmentTick`. Гейт по ключу — того провайдера, яким worker реально
// категоризує (`LLM_READONLY_PROVIDER`, дефолт `openrouter`): до 2026-08-29
// тут стояв `ANTHROPIC_API_KEY`, і на gateway-only проді worker мовчки не
// стартував, хоча OpenRouter-шлях був робочий. Default state: off; вмикається
// env-флагом, щоб локальний dev випадково не палив квоту.
let enrichmentWorker: StartedWorker | null = null;
if (env.MONO_ENRICHMENT_WORKER_ENABLED && providerUpstreamReady("readonly")) {
  enrichmentWorker = startMonoEnrichmentWorker(pool, {
    batchSize: env.MONO_ENRICHMENT_BATCH_SIZE,
    intervalMs: env.MONO_ENRICHMENT_INTERVAL_MS,
    maxAttempts: env.MONO_ENRICHMENT_MAX_ATTEMPTS,
  });
} else if (env.MONO_ENRICHMENT_WORKER_ENABLED) {
  logger.warn({
    msg: "mono_enrichment_worker_disabled_no_api_key",
    reason:
      "no upstream key for LLM_READONLY_PROVIDER (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)",
  });
}

// Hourly batch fallback worker для unknown-MCC tx (PR-18 з pr-plan-2026-05,
// WF-06 mono optimization). Дренажить in-memory буфер, заповнений
// `enrichmentWorker`-ом, і батчить в один Anthropic-виклик. Default off;
// при вимкненому flag-у enrichmentWorker працює по-старому (per-row).
let mccBatchWorker: StartedBatchWorker | null = null;
if (
  env.MCC_BATCH_HOURLY_ENABLED &&
  env.MONO_ENRICHMENT_WORKER_ENABLED &&
  env.ANTHROPIC_API_KEY
) {
  mccBatchWorker = startMonoMccBatchWorker(pool, {
    batchSize: env.MCC_BATCH_MAX_SIZE,
    intervalMs: env.MCC_BATCH_INTERVAL_MS,
  });
} else if (env.MCC_BATCH_HOURLY_ENABLED) {
  logger.warn({
    msg: "mono_mcc_batch_worker_disabled",
    reason: !env.MONO_ENRICHMENT_WORKER_ENABLED
      ? "MONO_ENRICHMENT_WORKER_ENABLED is false (batch worker depends on per-row producer)"
      : "ANTHROPIC_API_KEY is not configured",
  });
}

// BullMQ-worker для durable auth-mail jobs. Якщо `REDIS_URL` не заданий —
// `startAuthMailWorker()` повертає null, і `enqueueAuthMail()` падає у
// in-process fallback (як було до цього PR-а). Це збережено для CI / dev.
const authMailWorker: StartedAuthMailWorker | null = startAuthMailWorker();

// FTUX-drip BullMQ worker. Контракт ідентичний `auth-mail`-черзі: без
// REDIS_URL → null → `enqueueFtuxDripMail` падає у sync fallback ТІЛЬКИ
// для Day 0; Day 1 і Day 3 відверто пропускаються із warn-логом. Pool
// проброшуємо явно, бо dispatcher робить opt-out check + idempotent INSERT
// у `email_campaigns_log` через той самий pg-pool, що й решта server-у.
configureFtuxDripDispatcher({ pool });
const ftuxDripWorker: StartedFtuxDripWorker | null = startFtuxDripWorker();

// Нагадування про звички / їжу / тренування. Свідомо НЕ BullMQ, на відміну
// від сусідів вище — але не через відсутність Redis (він у проді є з
// 2026-07-11): дедуп уже живе в Postgres, а робота тут — періодичний скан,
// не дискретні задачі. Хвилинний таймер + claim-before-send дають ту саму
// гарантію «не більше одного пушу на подію» навіть при кількох репліках.
// Деталі — `lib/reminders/sweep.ts`.
const reminderScheduler: StartedReminderScheduler | null =
  env.REMINDER_SWEEP_ENABLED ? startReminderScheduler(pool) : null;

// AI memory ingestion BullMQ worker. Так само як `authMailWorker`, повертає
// null коли `REDIS_URL` не задано (CI / local dev) — у такому разі
// producer-и (`weekly-digest`, `profileMirror`) падають у in-process
// fallback. `POST /api/ai-memory/ingest` (клієнт-driven) і `mono/webhook`
// (source=finyk) видалені ініціативою 0024 (PR-1, 2026-09-03) — жодне з
// клієнт-driven джерел не мало продюсера в дереві. Стартує тільки при
// `AI_MEMORY_ENABLED=true`,
// щоб не тримати Redis-connection відкритим у environment-ах, де AI memory
// pipeline не використовується.
const memoryIngestWorker: StartedMemoryIngestWorker | null =
  startMemoryIngestWorker();

// PR-28 — in-process retention cron для `n8n_webhook_events`. Чистить
// рядки старші за `WEBHOOK_EVENTS_RETENTION_DAYS` (default 30). 0 → off.
// Той самий Node-процес, що API (Tier-A); idempotent start/stop.
const webhookEventsRetentionPoller = new WebhookEventsRetentionPoller({
  pool,
  retentionDays: env.WEBHOOK_EVENTS_RETENTION_DAYS,
  intervalMs: env.WEBHOOK_EVENTS_RETENTION_POLL_INTERVAL_MS,
});
webhookEventsRetentionPoller.start();

// GDPR cleanup queue drain — in-process годинний полер (Tier-A). Раніше
// чергу мав смикати Railway/n8n cron через `/api/internal/gdpr/
// cleanup-queue/process`, але Railway decommissioned (ADR-0074), а n8n у
// проді на паузі — без цього полера черга не дренувалась ВЗАГАЛІ
// (compliance-дефект, ADR-0016 § ADR-6.3). 0 → off. Idempotent start/stop.
const gdprCleanupPoller = new GdprCleanupPoller({
  pool,
  intervalMs: env.GDPR_CLEANUP_POLL_INTERVAL_MS,
});
gdprCleanupPoller.start();

// Добивач акаунтів, у яких минуло 30-денне вікно на скасування видалення
// (спека docs/work/specs/user-deletion-grace-window.md, ADR-0016
// § ADR-6.1). Без нього `DELETE /api/me` лише позначає акаунт, і ніхто
// ніколи не доводить видалення до кінця. 0 означає off.
const accountDeletionPoller = new AccountDeletionPoller({
  pool,
  intervalMs: env.ACCOUNT_DELETION_POLL_INTERVAL_MS,
});
accountDeletionPoller.start();

// Log-retention archive cron — opt-in (`LOG_ARCHIVE_ENABLED=true`).
// Streams `openclaw_invocations` / `tg_alert_acks` / `n8n_webhook_events`
// rows older than `LOG_RETENTION_DAYS` to GCS as gzipped JSONL, then
// DELETE-s them. Fail-closed on archive errors (rows stay in DB).
// Co-exists with `webhookEventsRetentionPoller` — both pollers are
// idempotent on overlapping rows.
const logArchivePoller = new LogArchivePoller({
  pool,
  enabled: env.LOG_ARCHIVE_ENABLED,
  retentionDays: env.LOG_RETENTION_DAYS,
  intervalMs: env.LOG_ARCHIVE_POLL_INTERVAL_MS,
  batchSize: env.LOG_ARCHIVE_BATCH_SIZE,
  bucket: env.GCS_LOG_ARCHIVE_BUCKET,
});
logArchivePoller.start();

// Plata (monobank) native subscriptions — звірка проти subscription/status
// (webhook лише прискорювач, полінг — арбітр стану). Off, поки
// `PLATA_ENABLED=false`. Той самий Tier-A in-process poller-патерн,
// idempotent start/stop, два таймери (fast/slow tick).
const plataSyncPoller = new PlataSyncPoller({ pool });
plataSyncPoller.start();

// Фоновий синк чеків Сільпо — той самий Tier-A poller-патерн. Off, поки
// `SILPO_ENABLED=false`. Без нього чеки підтягуються ЛИШЕ по кнопці
// «Оновити чеки» в налаштуваннях, тобто для більшості — ніколи.
const silpoSyncPoller = new SilpoSyncPoller();
silpoSyncPoller.start();

// ──────────────────────────────────────────────────────────────────────────────
// Graceful shutdown
//
// Платформа надсилає SIGTERM при deploy/restart. Без власного обробника Node
// просто обриває event loop — усі in-flight запити отримують ECONNRESET, а
// клієнт — 502 від проксі. Правильна послідовність:
//
//   1. Залогувати причину зупинки.
//   2. `server.close()` + `closeIdleConnections()` — перестаємо приймати нові
//      зʼєднання, вже прийняті запити допрацьовують свій цикл.
//   3. Зупинити фонові воркери й полери (кожен зі своєю стелею).
//   4. `pool.end()` — коректно закрити pg-зʼєднання.
//   5. `Sentry.flush()` / PostHog — допостити події, бо transport асинхронний.
//   6. `process.exit(code)`.
//
// `uncaughtException` свідомо теж веде сюди з exit=1: після некерованого
// throw-у стан процесу невідомий (leaked timers, dirty pool, partial TX),
// ресайкл — єдиний безпечний шлях. Health-probe платформи піднімає нову
// інстанцію. Стара поведінка ("лишаємо процес жити щоб не обривати
// запити") ризикованіша за 502 від рестарту: наступні відповіді можуть
// бути з пошкодженого state-у.
//
// ── Чому дефолти саме 5 с / 9 с ────────────────────────────────────────────
// AI-CONTEXT: до 2026-09-16 тут стояло 15 с grace / 25 с hard і коментар про
// Railway з grace ~30 с. Railway виведено з експлуатації (ADR-0074) — зараз
// Coolify/Docker, а `docker stop` за замовчуванням дає **10 секунд** до
// SIGKILL. Тобто 15-секундний grace не встигав ніколи: процес отримував
// SIGKILL посеред drain-у, і весь цей код був декорацією.
//
// Обрано варіант, що працює БЕЗ ручного налаштування поза репо: увесь
// graceful-шлях мусить вміститись у 10 с Docker-івського вікна. Альтернатива
// (лишити 15/25 і вимагати `stop_grace_period ≥ 30s` у Coolify) відкинута —
// вона мовчки ламається на будь-якому новому середовищі, а помилка виглядає
// як випадкові ECONNRESET, а не як «забули налаштувати».
//
// ── Чому бюджет рахується від СПІЛЬНОГО дедлайну ──────────────────────────
// Раніше кожна фаза мала власну незалежну стелю, і сума не сходилась:
// GRACE 15000 + pool GRACE/2 7500 + Sentry 2000 + PostHog 2000 = 26500 при
// hard 25000 — ще ДО воркерів і полерів. Тобто hard-таймер був не запасним
// виходом, а штатним шляхом: він відстрілював процес посеред flush-у
// телеметрії на кожному деплої.
//
// Тепер `shutdownDeadline` фіксується один раз, а кожна фаза бере
// `min(власний номінал, скільки лишилось до дедлайну)`. Сума фаз за
// побудовою ≤ бюджету, тож `hardTimer` спрацьовує лише тоді, коли щось
// зависло ПОПРИ власну стелю — тобто справді як запасний вихід.
// ──────────────────────────────────────────────────────────────────────────────

const { SHUTDOWN_GRACE_MS, SHUTDOWN_HARD_TIMEOUT_MS } = env;

/**
 * Запас між кінцем розрахованого бюджету і hard-таймером. Без нього сума
 * фаз впритул дорівнює `SHUTDOWN_HARD_TIMEOUT_MS`, і hard-таймер стріляє
 * одночасно з останньою фазою — тобто знову стає штатним шляхом.
 */
const SHUTDOWN_TAIL_MARGIN_MS = 500;

/**
 * Номінал на один flush телеметрії (Sentry, далі PostHog). Обидва транспорти
 * батчать події, синхронно скинути неможливо; більше за секунду чекати немає
 * сенсу — при 9-секундному hard-таймері це просто зʼїло б бюджет drain-у.
 */
const TELEMETRY_FLUSH_MS = 750;

/**
 * Номінал на зупинку ОДНОГО фонового воркера/полера. Їх близько десяти, тож
 * фіксована стеля тут — не гарантія: справжню межу дає спільний дедлайн
 * нижче, а це число лише не дає одному повільному з'їсти все вікно.
 */
const BACKGROUND_STOP_MS = 1_000;

let httpServer: Server | null = null;
let shuttingDown = false;

/**
 * Момент, після якого graceful-шлях зобов'язаний завершитись. Виставляється
 * на початку `shutdown()`; усі фази звіряються з ним через `phaseBudgetMs`.
 */
let shutdownDeadline = 0;

/** Скільки ще можна витратити до спільного дедлайну (ніколи не відʼємне). */
function remainingBudgetMs(): number {
  return Math.max(0, shutdownDeadline - Date.now());
}

/**
 * Стеля для конкретної фази: менше з «її власного номіналу» і «залишку
 * спільного бюджету», ще й мінус `reserveMs`. Саме це робить hard-таймер
 * запасним, а не штатним.
 *
 * `reserveMs` — те, що фаза НЕ має права зачепити, бо воно належить
 * пізнішим фазам. Без нього порядок виконання мовчки ставав пріоритетом:
 * одинадцять зупинок фонових воркерів з'їдали вікно, і дренаж пулу —
 * єдина фаза, що впливає на цілісність даних, — не отримував нічого.
 */
function phaseBudgetMs(nominalMs: number, reserveMs = 0): number {
  return Math.max(0, Math.min(nominalMs, remainingBudgetMs() - reserveMs));
}

/**
 * Бюджет, зарезервований за хвостом shutdown-у: дренаж обох pg-пулів плюс
 * два flush-и телеметрії. Фази, що йдуть ДО них, зобов'язані його не чіпати.
 *
 * Пріоритет тут свідомий: у найгіршому випадку краще НЕ встигнути чисто
 * зупинити полери (вони ідемпотентні, повторний tick після рестарту
 * нешкідливий), ніж обірвати дренаж пулу посеред транзакції або втратити
 * подію про падіння, яке саме зараз і відбувається.
 */
function tailReserveMs(): number {
  return Math.floor(SHUTDOWN_GRACE_MS / 2) + TELEMETRY_FLUSH_MS * 2;
}

/**
 * Виконати одну фазу shutdown-у під стелею часу.
 *
 * Три речі, які тут важливі:
 *   - фаза НІКОЛИ не кидає нагору: впала зупинка одного полера не має
 *     зривати зупинку решти й flush телеметрії;
 *   - на вичерпаному бюджеті фаза навіть не стартує (лог `..._skipped`) —
 *     інакше остання в черзі завжди програвала б часу;
 *   - таймер `unref`-нутий, щоб сам не тримав event loop живим.
 *
 * `Promise.race` лишає зависле завдання працювати у фоні — це свідомо:
 * перервати чужий `await` ми не можемо, а от не чекати на нього — можемо.
 */
async function runShutdownPhase(
  phase: string,
  nominalMs: number,
  run: () => Promise<unknown>,
  reserveMs = 0,
): Promise<void> {
  const budgetMs = phaseBudgetMs(nominalMs, reserveMs);
  if (budgetMs <= 0) {
    logger.warn({ msg: "shutdown_phase_skipped", phase });
    return;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), budgetMs);
    timer.unref?.();
  });

  try {
    const outcome = await Promise.race([
      run().then(() => "done" as const),
      expired,
    ]);
    if (outcome === "timeout") {
      logger.warn({ msg: "shutdown_phase_timeout", phase, budgetMs });
    }
  } catch (err) {
    logger.warn({
      msg: "shutdown_phase_error",
      phase,
      err: serializeError(err, { includeStack: false }),
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Зупинка одного фонового воркера/полера.
 *
 * Політика в одному місці, а не на одинадцяти call-site-ах: номінал
 * `BACKGROUND_STOP_MS` і — головне — резерв хвоста. Без резерву порядок
 * виконання мовчки ставав пріоритетом: одинадцять зупинок з'їдали вікно, і
 * дренаж пулу, єдина фаза, що впливає на цілісність даних, не отримував
 * нічого.
 *
 * Компроміс свідомий: у найгіршому разі полери лишаються незупиненими
 * (`shutdown_phase_skipped` у логах). Вони ідемпотентні — повторний tick
 * після рестарту нешкідливий, а обірваний посеред транзакції пул — ні.
 */
function runBackgroundStop(
  phase: string,
  run: () => Promise<unknown>,
): Promise<void> {
  return runShutdownPhase(phase, BACKGROUND_STOP_MS, run, tailReserveMs());
}

async function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  shutdownDeadline =
    Date.now() + SHUTDOWN_HARD_TIMEOUT_MS - SHUTDOWN_TAIL_MARGIN_MS;

  logger.info({ msg: "shutdown_begin", reason, exitCode });

  // Hard timeout: якщо щось зависне (дропнутий `await`, довгий AI-стрім
  // без heartbeat-а, pg-connection у підвішеному стані), гарантовано
  // виходимо. Після переходу на спільний дедлайн (див. шапку) це справді
  // ЗАПАСНИЙ вихід: штатний шлях завершується за `SHUTDOWN_TAIL_MARGIN_MS`
  // до нього.
  const hardTimer = setTimeout(() => {
    logger.error({
      msg: "shutdown_hard_timeout",
      reason,
      timeoutMs: SHUTDOWN_HARD_TIMEOUT_MS,
    });
    // AI-DANGER: НЕ `exitCode || 1`. Для штатного SIGTERM `exitCode === 0`,
    // а `0 || 1` дає 1 — тобто кожен звичайний деплой, що доїхав до
    // hard-таймера, рапортував платформі аварійний вихід. Перевіряємо саме
    // на «не число», щоб 0 лишався 0.
    process.exit(typeof exitCode === "number" ? exitCode : 1);
  }, SHUTDOWN_HARD_TIMEOUT_MS);
  hardTimer.unref();

  try {
    if (httpServer) {
      const server = httpServer;
      await new Promise<void>((resolve) => {
        // Резерв хвоста віднімається і тут: HTTP-drain іде першим, а
        // «перший» не має означати «забирає все».
        const graceMs = phaseBudgetMs(SHUTDOWN_GRACE_MS, tailReserveMs());
        // `server.close` НЕ розриває idle keep-alive сокети — він на них
        // ЧЕКАЄ. За проксі таких сокетів завжди кілька, тож без наступного
        // рядка grace вигоряв повністю на КОЖНОМУ деплої, хоча жодного
        // in-flight запиту не лишалось.
        const graceTimer = setTimeout(() => {
          logger.warn({
            msg: "shutdown_grace_expired_closing_all",
            graceMs,
          });
          // Бюджет вичерпано: рвемо решту з'єднань примусово, інакше
          // `close()` ніколи не покличе колбек і ми дочекаємось лише
          // hard-таймера. Node ≥18.2; `?.` — бо в юніт-тестах сервер
          // підмінений мінімальним моком з одним `close`.
          server.closeAllConnections?.();
          resolve();
        }, graceMs);
        graceTimer.unref();

        server.close((err) => {
          clearTimeout(graceTimer);
          if (err) {
            logger.warn({
              msg: "http_server_close_error",
              err: serializeError(err, { includeStack: false }),
            });
          } else {
            logger.info({ msg: "http_server_closed" });
          }
          resolve();
        });

        // Одразу після `close()`: прибрати сокети, які НІЧОГО не роблять.
        // In-flight запити це не чіпає — вони дограють свій цикл і закриються
        // самі, і саме на них grace і має витрачатись.
        server.closeIdleConnections?.();
      });
    }

    // Фонові воркери й полери. Порядок має значення:
    //   - усі вони зупиняються ДО `pool.end()` — bullmq-воркери самі у pg не
    //     пишуть, але pg-залежні processor-и вже є (memory-ingest, enrichment),
    //     і зворотний порядок дав би ECONNRESET посеред процесінгу;
    //   - `mccBatchWorker` — ПІСЛЯ `enrichmentWorker`, щоб batch-worker не
    //     дренажив буфер, який enrichment усе ще наповнює.
    //
    // Кожен іде через `runShutdownPhase`: власна стеля `BACKGROUND_STOP_MS`
    // плюс залишок спільного бюджету. Раніше тут було десять незалежних
    // `try/await` без жодної стелі — один завислий `close()` з'їдав усе
    // вікно, і до flush-у телеметрії черга не доходила ніколи.
    if (authMailWorker) {
      await runBackgroundStop("auth_mail_worker", () => authMailWorker.close());
    }

    if (ftuxDripWorker) {
      await runBackgroundStop("ftux_drip_worker", () => ftuxDripWorker.close());
    }

    if (reminderScheduler) {
      // `stop()` тепер асинхронний і дочікується: якщо прохід нагадувань
      // саме в процесі, частина слоту вже застовплена у `push_reminder_log`,
      // але пуш ще не пішов. Закрити пул під ним означало б, що людина не
      // отримає нагадування ВЗАГАЛІ — рядок дедупу є, пуша немає.
      await runBackgroundStop("reminder_scheduler", () =>
        reminderScheduler.stop(),
      );
    }

    if (memoryIngestWorker) {
      await runBackgroundStop("ai_memory_ingest_worker", () =>
        memoryIngestWorker.close(),
      );
    }

    if (enrichmentWorker) {
      await runBackgroundStop("mono_enrichment_worker", () =>
        enrichmentWorker.stop(),
      );
    }

    if (mccBatchWorker) {
      await runBackgroundStop("mono_mcc_batch_worker", () =>
        mccBatchWorker.stop(),
      );
    }

    await runBackgroundStop("silpo_sync_poller", () => silpoSyncPoller.stop());
    await runBackgroundStop("plata_sync_poller", () => plataSyncPoller.stop());
    await runBackgroundStop("webhook_events_retention_poller", () =>
      webhookEventsRetentionPoller.stop(),
    );
    await runBackgroundStop("gdpr_cleanup_poller", () =>
      gdprCleanupPoller.stop(),
    );
    await runBackgroundStop("account_deletion_poller", () =>
      accountDeletionPoller.stop(),
    );
    await runBackgroundStop("log_archive_poller", () =>
      logArchivePoller.stop(),
    );

    try {
      // Anthropic budget guard timer — synchronous stop, не блокує shutdown.
      anthropicBudgetGuard.stop();
    } catch (err) {
      logger.warn({
        msg: "anthropic_budget_guard_stop_error",
        err: serializeError(err, { includeStack: false }),
      });
    }

    // Audit P2-5: bounded drain з AbortController-ом. На abort helper
    // лог-warn-ить `pg_pool_end_timeout`; shutdown продовжує йти далі
    // (Redis, телеметрія), а `hardTimer` залишається last-resort safety net.
    //
    // Primary і replica пули дренуємо ПАРАЛЕЛЬНО (`Promise.all`): пули
    // незалежні, а кожен drain уже bounded тим самим таймаутом. Послідовний
    // дренаж подвоїв би витрату бюджету, паралельний лишає її ≤ одного
    // таймауту. `pool: "primary"|"replica"` у логах розрізняє два пули;
    // replica-drain — no-op, якщо `DATABASE_URL_REPLICA` не заданий.
    //
    // Номінал — GRACE/2, але обрізаний залишком спільного бюджету МІНУС
    // резерв на два flush-и телеметрії. Без цього віднімання drain міг
    // забрати весь залишок, і Sentry з PostHog не встигали б нічого
    // відправити — саме той стан, у якому падіння на shutdown-і невидиме.
    const poolDrainTimeoutMs = phaseBudgetMs(
      Math.floor(SHUTDOWN_GRACE_MS / 2),
      TELEMETRY_FLUSH_MS * 2,
    );
    await Promise.all([
      endPoolWithAbortTimeout(pool, {
        timeoutMs: poolDrainTimeoutMs,
        logger,
        poolLabel: "primary",
      }),
      drainReplicaPool({ timeoutMs: poolDrainTimeoutMs, logger }),
    ]);

    try {
      await disconnectRedis();
      logger.info({ msg: "redis_disconnected" });
    } catch {
      /* ignore on shutdown */
    }

    // Sentry transport батчує події, синхронно скинути неможливо. Номінал
    // `TELEMETRY_FLUSH_MS`, але не більше за залишок мінус резерв під
    // PostHog — інакше остання фаза завжди лишалась би без часу.
    await runShutdownPhase(
      "sentry_flush",
      Math.max(0, remainingBudgetMs() - TELEMETRY_FLUSH_MS),
      () => Sentry.flush(phaseBudgetMs(TELEMETRY_FLUSH_MS)),
    );

    // Ініціатива 0025: дофлашити чергу `$ai_generation` (posthog-node батчує
    // по 20 подій / 10 с). Helper fail-open — no-op, коли
    // `POSTHOG_AI_OBSERVABILITY_KEY` не задано.
    await runShutdownPhase("posthog_ai_flush", TELEMETRY_FLUSH_MS, () =>
      shutdownPostHogAi(phaseBudgetMs(TELEMETRY_FLUSH_MS)),
    );
  } finally {
    clearTimeout(hardTimer);
    logger.info({ msg: "shutdown_complete", exitCode });
    process.exit(exitCode);
  }
}

// Process-level error tracking: catches anything that escapes express's
// error-handling pipeline. Sentry instruments this on its own too, but we
// also bump a counter + emit a structured log so Grafana sees spikes even
// independently of Sentry retention/sampling.
process.on("unhandledRejection", (reason: unknown) => {
  try {
    unhandledRejectionsTotal.inc();
  } catch {
    /* ignore */
  }
  logger.error({
    msg: "unhandled_rejection",
    err: serializeError(reason, { includeStack: true }),
  });
  // Свідомо НЕ виходимо: unhandledRejection — це зазвичай баг у
  // конкретному хендлері, не corruption state-у процесу. Sentry капчить
  // стек, Grafana видно спайк. Якщо переведемо на exit — кожен поганий
  // AI-респонс = рестарт процесу. uncaughtException — інша історія.
});

process.on("uncaughtException", (err: Error) => {
  try {
    uncaughtExceptionsTotal.inc();
  } catch {
    /* ignore */
  }
  logger.fatal({
    msg: "uncaught_exception",
    err: serializeError(err, { includeStack: true }),
  });
  shutdown("uncaughtException", 1).catch(() => process.exit(1));
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    logger.info({ msg: "signal_received", signal: sig });
    shutdown(sig, 0).catch(() => process.exit(1));
  });
}

// Міграції свідомо НЕ запускаються з web-процесу — це задача release-stage
// (див. `scripts/migrate.mjs` / `npm run db:migrate`). При rolling deploy з 2+
// реплік race на `INSERT schema_migrations` раніше валив один із процесів,
// плюс readiness-проб затримувався часом виконання міграцій.
// Позначаємо звірку схеми як розпочату СИНХРОННО, до привʼязки до порту.
// Сам запит іде нижче, у `listen`-колбеку, але readiness мусить знати про
// «перевірка ще не завершена» вже з першої проби: інакше під увімкненим
// `MIGRATION_DRIFT_BLOCKS_READINESS` існує вікно, у якому `/readyz` зелений,
// а схема ще не звірена, і платформа встигає завести трафік.
markSchemaDriftCheckStarted();

// Бінд навмисно літеральний: контейнер має слухати всі інтерфейси, інакше
// зовнішній healthcheck Coolify не достукається. Поле `HOST` зі схеми env
// прибрано разом із цим рішенням — воно роками не читалось, і підключити
// його означало б дати змінній оточення тихо зламати деплой.
httpServer = app.listen(config.port, "0.0.0.0", () => {
  // Сигнал для `/startupz` (a.k.a. `/health/startup`): процес завершив
  // env-assert, Sentry-init і привʼязку до порту, тож платформа може
  // переключитися з startup-probe на readiness/liveness. Idempotent.
  markStartupComplete();
  logger.info({
    msg: "server_listening",
    role: config.role,
    port: config.port,
  });

  // Звірка «схема в образі ↔ схема в базі». Міграції тут НЕ запускаються (це
  // задача release-stage, див. коментар вище) — але результат release-stage
  // хтось мусить перевірити. Тричі за серпень 2026 не перевірив ніхто, і
  // єдиним сигналом ставав потік 500-ок від живих людей; найдовший епізод —
  // 106 хвилин. Тепер розбіжність стає алертом ще до першого запиту.
  //
  // Не блокує старт: перевірка асинхронна і навмисно не в `await`, щоб
  // недоступна на цю мить база не затримала readiness. Гейт на readiness —
  // опційний, через `MIGRATION_DRIFT_BLOCKS_READINESS`.
  void reportSchemaDriftAtBoot(pool, (message, report, signal) => {
    // Два сигнали розводяться і рівнем, і тегом. Рівень — бо наслідки різні:
    // образ попереду бази дає 500-ки живим людям (`error`), база попереду
    // образу нічого не ламає і означає відкат (`warning`). Тег — бо саме по
    // ньому їх видно окремо у фільтрі, а спільний заголовок склеїв би два
    // різні стани в одну issue.
    Sentry.captureMessage(message, {
      level: signal === "drift" ? "error" : "warning",
      tags: { area: "migrations", signal },
      extra: { ...report },
    });
  });

  // Довідник базової їжі без штрихкоду (міграція 124). Засівається на
  // старті, а не окремим скриптом: ці дані мусять бути в КОЖНОМУ
  // середовищі — прод, стейдж, машина розробника, CI з Testcontainers.
  // Скрипт, який треба не забути запустити, рано чи пізно не запустять, і
  // різниця вилізе як «у мене пошук знаходить огірок, а на стейджі ні».
  //
  // Не в `await` і не блокує readiness з тієї самої причини, що й
  // drift-звірка вище: недоступна на цю мить база не має затримувати
  // старт. Сама функція ковтає свої помилки — непосіяний довідник це
  // гірший пошук, а не зламаний сервер.
  void seedGenericFoods();
});

// ── Keep-alive за проксі ──────────────────────────────────────────────────
// AI-DANGER: не опускай `keepAliveTimeout` нижче за таймаут апстрім-проксі.
//
// Node за замовчуванням тримає keep-alive-сокет лише 5 секунд. Проксі
// (Coolify/Traefik, Vercel, будь-який ALB) тримає свій пул довше, тож існує
// гонка: проксі надсилає наступний запит у сокет, який Node САМЕ ЗАРАЗ
// закриває за таймаутом. Клієнт отримує 502 без жодного сліду в логах
// застосунку — запит до обробника просто не дійшов. Спорадичність тут
// оманлива: це не «мережа моргнула», а детермінована гонка, частота якої
// залежить від патерну трафіку.
//
// 65 с обрано з того ж міркування, що й у типових ALB-рекомендаціях: більше
// за звичні 60 с idle-таймауту проксі, тож сокет завжди закриває ПРОКСІ, а
// не ми. `headersTimeout` мусить бути СТРОГО більшим за `keepAliveTimeout`
// (інакше Node встигає відрахувати headers-таймаут на щойно переюзаному
// сокеті) — звідси 66 с.
if (httpServer) {
  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 66_000;
}
