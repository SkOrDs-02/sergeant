/**
 * Unified server entrypoint.
 *
 * Replaces the previous `server/railway.mjs` + `server/replit.mjs` pair,
 * which duplicated ~80% of their code and had silently diverged (missing
 * `/api/push/*` routes and Sentry init on Replit). The runtime mode is
 * selected by `SERVER_MODE` (or auto-detected from `REPLIT_DOMAINS`) in
 * `server/config.js`.
 *
 * IMPORTANT: `./obs/tracing.js` is imported FIRST, then `./sentry.js`,
 * before `express` or any transitively-loaded HTTP module. ESM evaluates
 * imports depth-first in declaration order, so OTel `NodeSDK.start()` and
 * `Sentry.init()` at the top of those modules run before `http`/`express`
 * are pulled in — which is the only way OpenTelemetry auto-instrumentation
 * (and Sentry's, which uses OTel internally) can monkey-patch them. The
 * order is OTel → Sentry: OTel registers global tracer provider, Sentry
 * then either coexists (when both enabled) or is the only tracer source
 * (when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset and OTel module is no-op).
 * See `apps/server/src/obs/tracing.ts` and `apps/server/src/sentry.ts`.
 */
import "./obs/tracing.js";
import "./sentry.js";

import { assertStartupEnv } from "./env/env.js";
import { assertBetterAuthStartupEnv } from "./env/betterAuthEnv.js";

assertStartupEnv();
assertBetterAuthStartupEnv();

import type { Server } from "http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { env } from "./env.js";
import { markStartupComplete } from "./lib/appState.js";
import {
  startAuthMailWorker,
  type StartedAuthMailWorker,
} from "./lib/jobs/authMail.js";
import {
  startFtuxDripWorker,
  type StartedFtuxDripWorker,
} from "./lib/jobs/ftuxDrip.js";
import { connectRedis, disconnectRedis } from "./lib/redis.js";
import {
  startMemoryIngestWorker,
  type StartedMemoryIngestWorker,
} from "./modules/ai-memory/ingestQueue.js";
import {
  startMonoEnrichmentWorker,
  type StartedWorker,
} from "./modules/mono/enrichmentWorker.js";
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
// порогів. Sentry → n8n WF-22 alert-routing → Telegram (existing pipeline).
// Idempotency через Redis `SET NX EX` з fallback на in-memory Set.
// No-op коли `ANTHROPIC_BUDGET_ALERT_ENABLED=false`.
anthropicBudgetGuard.start();

// Mono AI enrichment worker — polling-консьюмер `mono_ai_enrichment_queue`.
// Стартує у тому ж процесі, що API (in-process worker). Це свідомий вибір:
// при поточному об'ємі трафіку (десятки tx/min) виносити окремий worker-сервіс
// — оверкіл, а multi-replica-safety гарантує `FOR UPDATE SKIP LOCKED` у
// `runEnrichmentTick`. Якщо ANTHROPIC_API_KEY не заданий — worker не стартує
// (інакше кожен tick впаде на upstream-call). Default state: off; вмикається
// через Railway env var, щоб локальний dev випадково не палив квоту.
let enrichmentWorker: StartedWorker | null = null;
if (env.MONO_ENRICHMENT_WORKER_ENABLED && env.ANTHROPIC_API_KEY) {
  enrichmentWorker = startMonoEnrichmentWorker(pool, {
    batchSize: env.MONO_ENRICHMENT_BATCH_SIZE,
    intervalMs: env.MONO_ENRICHMENT_INTERVAL_MS,
    maxAttempts: env.MONO_ENRICHMENT_MAX_ATTEMPTS,
  });
} else if (env.MONO_ENRICHMENT_WORKER_ENABLED) {
  logger.warn({
    msg: "mono_enrichment_worker_disabled_no_api_key",
    reason: "ANTHROPIC_API_KEY is not configured",
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

// AI memory ingestion BullMQ worker. Так само як `authMailWorker`, повертає
// null коли `REDIS_URL` не задано (CI / local dev) — у такому разі
// producer-и (`mono/webhook`, `weekly-digest`, `POST /api/ai-memory/ingest`)
// падають у in-process fallback. Стартує тільки при `AI_MEMORY_ENABLED=true`,
// щоб не тримати Redis-connection відкритим у environment-ах, де AI memory
// pipeline не використовується.
const memoryIngestWorker: StartedMemoryIngestWorker | null =
  startMemoryIngestWorker();

// ──────────────────────────────────────────────────────────────────────────────
// Graceful shutdown
//
// Railway і Replit надсилають SIGTERM при deploy/restart з grace-period ~30с.
// Без власного обробника Node просто обриває event loop — усі in-flight
// запити отримують ECONNRESET, а клієнт — 502 від проксі. Правильна
// послідовність:
//
//   1. Залогувати причину зупинки.
//   2. `server.close()` — перестаємо приймати нові з'єднання, але вже
//      прийняті запити допрацьовують свій цикл.
//   3. Дочекатись до `SHUTDOWN_GRACE_MS` на завершення in-flight.
//   4. `pool.end()` — коректно закрити pg-з'єднання.
//   5. `Sentry.flush()` — до виходу допостити події, бо transport асинхронний.
//   6. `process.exit(code)`.
//
// `uncaughtException` свідомо теж веде сюди з exit=1: після некерованого
// throw-у стан процесу невідомий (leaked timers, dirty pool, partial TX),
// ресайкл — єдиний безпечний шлях. Railway health-probe піднімає нову
// інстанцію. Стара поведінка ("лишаємо процес жити щоб не обривати
// запити") ризикованіша за 502 від рестарту: наступні відповіді можуть
// бути з пошкодженого state-у.
// ──────────────────────────────────────────────────────────────────────────────

const { SHUTDOWN_GRACE_MS, SHUTDOWN_HARD_TIMEOUT_MS } = env;

let httpServer: Server | null = null;
let shuttingDown = false;

async function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ msg: "shutdown_begin", reason, exitCode });

  // Hard timeout: якщо щось зависне (дропнутий `await`, довгий AI-стрім
  // без heartbeat-а, pg-connection у підвішеному стані), гарантовано
  // виходимо. Без цього процес може зависнути у "terminating" назавжди.
  const hardTimer = setTimeout(() => {
    logger.error({
      msg: "shutdown_hard_timeout",
      reason,
      timeoutMs: SHUTDOWN_HARD_TIMEOUT_MS,
    });
    process.exit(exitCode || 1);
  }, SHUTDOWN_HARD_TIMEOUT_MS);
  hardTimer.unref();

  try {
    if (httpServer) {
      const server = httpServer;
      await new Promise<void>((resolve) => {
        // `server.close` чекає, поки всі активні з'єднання завершаться. Якщо
        // у нас довгі SSE-стріми (AI chat), grace-період обмежує це зверху.
        const graceTimer = setTimeout(() => {
          logger.warn({
            msg: "shutdown_grace_expired_closing_idle",
            graceMs: SHUTDOWN_GRACE_MS,
          });
          resolve();
        }, SHUTDOWN_GRACE_MS);
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
      });
    }

    // Auth-mail BullMQ worker завершує inflight job-и ДО того, як ми
    // закриваємо pg-pool — bullmq-worker сам не пише у pg, але якщо у нас
    // у майбутньому з'являться pg-залежні processor-и, цей порядок
    // (workers → pool) запобіжить ECONNRESET у середині процесінгу.
    if (authMailWorker) {
      try {
        await authMailWorker.close();
        logger.info({ msg: "auth_mail_worker_closed" });
      } catch (err) {
        logger.warn({
          msg: "auth_mail_worker_close_error",
          err: serializeError(err, { includeStack: false }),
        });
      }
    }

    if (ftuxDripWorker) {
      try {
        await ftuxDripWorker.close();
        logger.info({ msg: "ftux_drip_worker_closed" });
      } catch (err) {
        logger.warn({
          msg: "ftux_drip_worker_close_error",
          err: serializeError(err, { includeStack: false }),
        });
      }
    }

    if (memoryIngestWorker) {
      try {
        // Дочекатися in-flight memory-ingest job-ів і закрити BullMQ-обʼязки
        // та ioredis-connections, ПЕРЕД pool.end(): майбутні retrieval-job-и
        // будуть пг-залежними, тож порядок важливий.
        await memoryIngestWorker.close();
        logger.info({ msg: "ai_memory_ingest_worker_closed" });
      } catch (err) {
        logger.warn({
          msg: "ai_memory_ingest_worker_close_error",
          err: serializeError(err, { includeStack: false }),
        });
      }
    }

    if (enrichmentWorker) {
      try {
        // Чекаємо, поки in-flight enrichment-tick завершиться, ПЕРЕД
        // `pool.end()`. Інакше pg-клієнт у середині tick-а отримає
        // ECONNRESET і queue.row залишиться у `processing` без cleanup-у.
        await enrichmentWorker.stop();
      } catch (err) {
        logger.warn({
          msg: "mono_enrichment_worker_stop_error",
          err: serializeError(err, { includeStack: false }),
        });
      }
    }

    try {
      // Anthropic budget guard timer — synchronous stop, не блокує shutdown.
      anthropicBudgetGuard.stop();
    } catch (err) {
      logger.warn({
        msg: "anthropic_budget_guard_stop_error",
        err: serializeError(err, { includeStack: false }),
      });
    }

    try {
      await pool.end();
      logger.info({ msg: "pg_pool_ended" });
    } catch (err) {
      logger.warn({
        msg: "pg_pool_end_error",
        err: serializeError(err, { includeStack: false }),
      });
    }

    try {
      await disconnectRedis();
      logger.info({ msg: "redis_disconnected" });
    } catch {
      /* ignore on shutdown */
    }

    try {
      // 2с на flush — Sentry transport батчує події, синхронно скинути
      // неможливо. Довше чекати сенсу немає: перевищимо hard-timeout.
      await Sentry.flush(2000);
    } catch {
      /* sentry flush не має блокувати shutdown */
    }
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
httpServer = app.listen(config.port, "0.0.0.0", () => {
  // Сигнал для `/startupz` (a.k.a. `/health/startup`): процес завершив
  // env-assert, Sentry-init і прив'язку до порту, тож платформа може
  // переключитися з startup-probe на readiness/liveness. Idempotent.
  markStartupComplete();
  logger.info({
    msg: "server_listening",
    role: config.role,
    port: config.port,
  });
});
