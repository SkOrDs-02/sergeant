import type { Request, RequestHandler, Response } from "express";
import type { Pool } from "pg";
import { logger, serializeError } from "../obs/logger.js";
import { toPublicErrorCode } from "../obs/errorCode.js";
import { getRedisStats, pingRedis } from "../lib/redis.js";
import { getPoolStats } from "../db.js";
import { anthropicCircuitBreaker } from "../lib/circuitBreaker.js";
import { elapsedMs } from "../lib/timing.js";
import { appState } from "../lib/appState.js";
import { getMemoryIngestWorkerStats } from "../modules/ai-memory/ingestQueue.js";
import { getMonoEnrichmentWorkerStatus } from "../modules/mono/enrichmentWorker.js";
import { getGdprCleanupWorkerStatus } from "../modules/gdpr/cleanupPoller.js";
import {
  driftBlocksReadiness,
  getLastSchemaDriftReport,
  getSchemaDriftCheckState,
} from "../lib/schemaDrift.js";

interface DbPool {
  query(sql: string): Promise<unknown>;
}

/** Liveness: процес живий. Дешево і не чіпає БД. */
export function livezHandler(_req: Request, res: Response): void {
  res.status(200).type("text/plain").send("ok");
}

/**
 * Startup: чи завершилася стартова послідовність. Платформа (Railway /
 * k8s) налаштовує startup-probe з більшим `failureThreshold` ніж
 * liveness/readiness, щоб не вбити pod під час cold-start. Поки
 * `app.listen` callback не відпрацював — повертаємо 503 і платформа
 * терпляче чекає; як тільки startup завершився — повертаємо 200 і
 * платформа перемикається на читання liveness/readiness.
 *
 * Дешева перевірка: жодних DB-пінгів, тільки прапор з `appState`.
 */
export function startupzHandler(_req: Request, res: Response): void {
  if (appState.startupComplete) {
    res.status(200).type("text/plain").send("ok");
  } else {
    res.status(503).type("text/plain").send("starting");
  }
}

/**
 * Readiness: процес готовий обслуговувати трафік. Пінгує БД; якщо БД не
 * відповідає — 503, платформа перестає маршрутизувати запити сюди.
 */
export function createReadyzHandler(pool: DbPool): RequestHandler {
  return async (_req, res) => {
    let dbOk = false;
    try {
      await pool.query("SELECT 1");
      dbOk = true;
    } catch (e: unknown) {
      const err = (e && typeof e === "object" ? e : {}) as {
        message?: string;
        code?: string | number;
      };
      logger.error({
        msg: "readyz_db_ping_failed",
        err: { message: err.message || String(e), code: err.code },
      });
    }

    // Дрейф схеми читаємо з кешу, порахованого на старті: проба смикається
    // кожні кілька секунд, а схема між рестартами не міняється (pre-deploy
    // відпрацьовує до старту процесу). Гейт опційний — ціна хибного
    // спрацювання тут повний простій, див. `lib/schemaDrift.ts`.
    //
    // Коли гейт увімкнено, «ще не знаємо» трактуємо як «не готові». Інакше
    // між `app.listen` і резолвом запиту в `schema_migrations` лишалось би
    // вікно, у якому проба зелена, а схема ще не перевірена — і платформа
    // встигала б завести трафік саме на той контейнер, який гейт мав відсіяти.
    //
    // `failed` при цьому НЕ блокує — свідомо. Звірка виконується один раз на
    // буті, тож разовий мережевий збій у момент старту назавжди лишив би
    // контейнер не-ready і відкотив би справний деплой. Реально недоступну БД
    // ловить `SELECT 1` вище в цьому ж хендлері.
    const drift = getLastSchemaDriftReport();
    const driftState = getSchemaDriftCheckState();
    const schemaUnverified = driftState === "idle" || driftState === "checking";
    const schemaBlocks =
      driftBlocksReadiness() &&
      (schemaUnverified || (drift !== null && !drift.inSync));
    if (schemaBlocks) {
      logger.error({
        msg: "readyz_schema_drift_block",
        state: driftState,
        pending: drift?.pending ?? null,
      });
    }

    if (dbOk && !schemaBlocks) res.status(200).type("text/plain").send("ok");
    else res.status(503).type("text/plain").send("unhealthy");
  };
}

/**
 * Detailed health check endpoint for debugging/monitoring.
 * Returns JSON with status of all subsystems.
 */
export function createHealthzHandler(pool: DbPool): RequestHandler {
  return async (_req, res) => {
    const checks: Record<string, { status: string; details?: unknown }> = {};
    let overallHealthy = true;

    // Database check
    try {
      const start = process.hrtime.bigint();
      await pool.query("SELECT 1");
      const latencyMs = elapsedMs(start);
      checks["database"] = {
        status: "healthy",
        details: { latencyMs, ...getPoolStats() },
      };
    } catch (e) {
      overallHealthy = false;
      // `/healthz` анонімний і без rate-limit (щоб probe платформи не
      // голодували), а `e.message` від `pg` носить внутрішній хост, порт і
      // імʼя DB-користувача — `password authentication failed for user
      // "sergeant_app"`. Назовні йде лише клас помилки, повний текст —
      // у лог, де його читає ops. Контракт: `obs/errorCode.ts`.
      logger.error({ msg: "healthz_db_check_failed", err: serializeError(e) });
      checks["database"] = {
        status: "unhealthy",
        details: { errorCode: toPublicErrorCode(e) },
      };
    }

    // Schema drift. Читається з кешу стартової перевірки; `null` означає, що
    // вона не встигла або впала — це «невідомо», а не «здорово».
    const drift = getLastSchemaDriftReport();
    if (drift === null) {
      checks["schema"] = { status: "unknown" };
    } else if (drift.inSync) {
      checks["schema"] = {
        status: "healthy",
        details: { applied: drift.applied, shipped: drift.shipped },
      };
    } else {
      // Незастосовані міграції = гарантовані 500 на роутах, що читають нові
      // колонки. Це не degraded, це зламано — навіть якщо `SELECT 1` зелений.
      overallHealthy = false;
      // `pendingCount`, а не список імен: імена міграцій — це карта стану
      // схеми прода (що саме зараз їде) плюс точне вікно неузгодженості, і
      // віддавати її анонімові немає за що. Кількості вистачає і дашборду,
      // і алерту «схема відстала»; самі імена вже є в лозі
      // `readyz_schema_drift_block` і у відповіді `migrate.mjs`.
      checks["schema"] = {
        status: "unhealthy",
        details: {
          applied: drift.applied,
          shipped: drift.shipped,
          pendingCount: drift.pending.length,
        },
      };
    }

    // Redis check
    const redisStats = getRedisStats();
    const redisHealthy = await pingRedis();
    checks["redis"] = {
      status: redisHealthy ? "healthy" : "degraded",
      details: {
        connected: redisStats.connected,
        reconnectAttempts: redisStats.reconnectAttempts,
        // Redis being down is degraded, not unhealthy (we have fallback)
      },
    };

    // Circuit breakers
    const anthropicCb = anthropicCircuitBreaker.getStats();
    checks["circuitBreakers"] = {
      status: anthropicCb.state === "open" ? "degraded" : "healthy",
      details: {
        anthropic: anthropicCb,
      },
    };

    const statusCode = overallHealthy ? 200 : 503;
    res.status(statusCode).json({
      status: overallHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      checks,
    });
  };
}

/**
 * Worker-fleet health (PR-31). Окремий endpoint поряд з `/healthz`, бо:
 *   1. Дашборд "які background-worker-и живі і скільки робота у черзі" — це
 *      окрема операційна площина від "DB/Redis ping". Платформа-probe
 *      (`/readyz`) має лишатись дешевим; цей endpoint дозволено робити
 *      кілька SQL/Redis-roundtrip-ів.
 *   2. Worker-incident-и (BullMQ Redis-disconnect, mono-enrichment-queue
 *      stuck) важко діагностувати з `/healthz`-стрічки — потрібен per-queue
 *      breakdown (waiting/active/delayed/failed для ai-memory + pending/
 *      processing/failed/dead_letter для mono-enrichment).
 *
 * Контракт відповіді: `{status, timestamp, workers:{aiMemoryIngest,
 * monoEnrichment, gdprCleanup}}`. Не включає `version`/`commit`/`sha`
 * (L7 audit `docs/security/hardening/L7-health-endpoint-info-leak.md` —
 * ті самі invariants, що й для `/healthz`), і **не включає текст помилки
 * воркера**: на фейлі sample-функції поле зветься `errorCode` і несе лише
 * клас (`ECONNREFUSED`, `28P01`). Роут анонімний і без rate-limit, а
 * `pg`/`ioredis` кладуть у `message` внутрішній хост, порт і імʼя
 * DB-користувача — повний текст лишається в логах воркера
 * (`obs/errorCode.ts`). Регресію стереже `routes/health.infoleak.test.ts`,
 * де `error` стоїть у `FORBIDDEN_KEYS`.
 *
 * Status code:
 *   - 200 — всі sub-worker-и відповіли (можуть бути fallbackMode/disabled,
 *     це не "unhealthy", це конфігурація).
 *   - 503 — хоч один sub-worker фейлить sample (Redis/DB unreachable). Це
 *     сигнал ops-у для investigate; платформа-probe не використовує цей
 *     endpoint, тож 503 не виключає replica з трафіку.
 */
export function createWorkersHealthHandler(pool: Pool): RequestHandler {
  return async (_req, res) => {
    const [memoryIngest, monoEnrichment, gdprCleanup] = await Promise.all([
      getMemoryIngestWorkerStats(),
      getMonoEnrichmentWorkerStatus(pool),
      getGdprCleanupWorkerStatus(pool),
    ]);
    // Worker вважається "responsive": його sample-функція не повернула
    // `errorCode`. Disabled / fallback — все ще responsive.
    const memoryIngestResponsive = memoryIngest.errorCode === undefined;
    const monoEnrichmentResponsive = monoEnrichment.errorCode === undefined;
    const gdprCleanupResponsive = gdprCleanup.errorCode === undefined;
    const allResponsive =
      memoryIngestResponsive &&
      monoEnrichmentResponsive &&
      gdprCleanupResponsive;

    res.status(allResponsive ? 200 : 503).json({
      status: allResponsive ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      workers: {
        aiMemoryIngest: memoryIngest,
        monoEnrichment,
        gdprCleanup,
      },
    });
  };
}
