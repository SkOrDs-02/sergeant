import { Router } from "express";
import type { Pool } from "pg";
import { createStatusHandler } from "../http/status.js";

/**
 * Public status-page API (PR-41).
 *
 * Mounts `GET /api/status` — unauthenticated JSON endpoint consumed by
 * `apps/web/src/core/status/StatusPage.tsx`. See `http/status.ts` for
 * the response contract and the L7 info-leak invariants this route
 * inherits from `/healthz`.
 */
export function createStatusRouter({ pool }: { pool: Pool }): Router {
  const r = Router();
  r.get("/api/status", createStatusHandler(pool));
  return r;
}
