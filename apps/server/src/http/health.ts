import type { Request, RequestHandler, Response } from "express";
import { logger } from "../obs/logger.js";
import { getRedisStats, pingRedis } from "../lib/redis.js";
import { getPoolStats } from "../db.js";
import { backgroundQueue } from "../lib/backgroundQueue.js";
import { anthropicCircuitBreaker } from "../lib/circuitBreaker.js";
import { elapsedMs } from "../lib/timing.js";
import { appState } from "../lib/appState.js";

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
    if (dbOk) res.status(200).type("text/plain").send("ok");
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
      checks["database"] = {
        status: "unhealthy",
        details: { error: e instanceof Error ? e.message : String(e) },
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

    // Background queue
    const queueStats = backgroundQueue.getStats();
    checks["backgroundQueue"] = {
      status: queueStats.isShuttingDown ? "shutting_down" : "healthy",
      details: queueStats,
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
