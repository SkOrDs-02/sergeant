import { Router } from "express";
import type { Pool } from "pg";
import {
  createReadyzHandler,
  createHealthzHandler,
  livezHandler,
  startupzHandler,
} from "../http/index.js";
import { metricsHandler } from "../obs/metrics.js";

/**
 * Health / readiness / metrics endpoints.
 *
 * Probe-and-alias mapping:
 *
 * | Probe       | Short alias | Nested alias          | Що повертає                            |
 * | ----------- | ----------- | --------------------- | -------------------------------------- |
 * | liveness    | `/livez`    | `/health/liveness`    | 200 поки event-loop живий              |
 * | readiness   | `/readyz`   | `/health/readiness`   | 200 коли БД відповідає, інакше 503     |
 * | startup     | `/startupz` | `/health/startup`     | 200 коли `app.listen` callback зайшов  |
 *
 * `/health` лишається аліасом на readiness через історичні platform-probe-и
 * (Railway, старі Replit-пайплайни) — не видаляти без координації з деплоєм.
 * Nested-paths (`/health/liveness`, `/health/readiness`, `/health/startup`)
 * додані за ініціативою 0008 (platform hardening) — це дозволяє
 * Render/k8s-style конфігам брати всі три probe-и з одного префіксу,
 * залишаючи короткі `/livez|/readyz|/startupz` для існуючих manifest-ів.
 *
 * `/healthz` — детальний JSON endpoint для debugging/monitoring (не probe).
 */
export function createHealthRouter({ pool }: { pool: Pool }): Router {
  const r = Router();
  const readyzHandler = createReadyzHandler(pool);

  // Short-alias probes (legacy + dashboards).
  r.get("/livez", livezHandler);
  r.get("/readyz", readyzHandler);
  r.get("/startupz", startupzHandler);
  r.get("/health", readyzHandler);

  // Nested probes (initiative 0008). Колишній RFC-неоформлений `/health`
  // у платформ-конфігах поступово мігрує на ці три.
  r.get("/health/liveness", livezHandler);
  r.get("/health/readiness", readyzHandler);
  r.get("/health/startup", startupzHandler);

  r.get("/healthz", createHealthzHandler(pool));
  r.get("/metrics", metricsHandler);
  return r;
}
