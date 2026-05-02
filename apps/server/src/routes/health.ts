import { Router } from "express";
import type { Pool } from "pg";
import {
  createReadyzHandler,
  createHealthzHandler,
  livezHandler,
} from "../http/index.js";
import { metricsHandler } from "../obs/metrics.js";

/**
 * Health / readiness / metrics endpoints.
 *
 * `/health` лишається аліасом для `/readyz` через історичні platform-probe-и
 * (Railway, старі Replit-пайплайни). Не видаляти без координації з деплоєм.
 *
 * `/healthz` — детальний JSON endpoint для debugging/monitoring.
 */
export function createHealthRouter({ pool }: { pool: Pool }): Router {
  const r = Router();
  r.get("/livez", livezHandler);
  r.get("/readyz", createReadyzHandler(pool));
  r.get("/health", createReadyzHandler(pool));
  r.get("/healthz", createHealthzHandler(pool));
  r.get("/metrics", metricsHandler);
  return r;
}
