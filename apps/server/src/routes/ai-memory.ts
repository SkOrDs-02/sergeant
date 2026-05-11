import { Router } from "express";
import type { Pool } from "pg";

import {
  asyncHandler,
  rateLimitExpress,
  requireSession,
  setModule,
} from "../http/index.js";
import { requirePlan } from "../modules/billing/requirePlan.js";
import { ingestMemoryHandler } from "../modules/ai-memory/ingestRoute.js";
import { recallMemoryHandler } from "../modules/ai-memory/recallRoute.js";

/**
 * `/api/ai-memory/*` — клієнт-driven ingestion для джерел, які живуть на
 * клієнті (RxDB-only): nutrition / fizruk / journal / routine. Server-side
 * sources (finyk, digest) енкьюїться з `mono/webhook.ts` та
 * `digest/weekly-digest.ts` напряму.
 *
 * Recall (PR3) — semantic retrieval через `recall_memory` HubChat-tool.
 * Sync read-path, окремий від ingestion-черги.
 *
 * Rate-limit `30 req / 5min / IP` — fairly generous, бо клієнт може
 * бекфілитити багато entries при першому syncу (manual offline period).
 * Точніший анти-абʼюз — Voyage квотою (per-user) у `service.remember()`,
 * але тут все одно ставимо stop, щоб один зломаний клієнт не зміг через
 * Redis затопити worker-pool.
 */
export function createAiMemoryRouter({ pool }: { pool: Pool }): Router {
  const r = Router();
  r.use("/api/ai-memory", setModule("ai-memory"));
  r.use(
    "/api/ai-memory",
    rateLimitExpress({
      key: "api:ai-memory",
      limit: 30,
      windowMs: 5 * 60_000,
    }),
  );
  r.post(
    "/api/ai-memory/ingest",
    requireSession(),
    requirePlan(pool, "pro"),
    asyncHandler(ingestMemoryHandler),
  );
  r.post(
    "/api/ai-memory/recall",
    requireSession(),
    requirePlan(pool, "pro"),
    asyncHandler(recallMemoryHandler),
  );
  return r;
}
