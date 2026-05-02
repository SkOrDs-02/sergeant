import { Router } from "express";

import {
  asyncHandler,
  rateLimitExpress,
  requireSession,
  setModule,
} from "../http/index.js";
import { ingestMemoryHandler } from "../modules/ai-memory/ingestRoute.js";

/**
 * `/api/ai-memory/*` — клієнт-driven ingestion для джерел, які живуть на
 * клієнті (RxDB-only): nutrition / fizruk / journal / routine. Server-side
 * sources (finyk, digest) енкьюїться з `mono/webhook.ts` та
 * `digest/weekly-digest.ts` напряму.
 *
 * Rate-limit `30 req / 5min / IP` — fairly generous, бо клієнт може
 * бекфілитити багато entries при першому syncу (manual offline period).
 * Точніший анти-абʼюз — Voyage квотою (per-user) у `service.remember()`,
 * але тут все одно ставимо stop, щоб один зломаний клієнт не зміг через
 * Redis затопити worker-pool.
 */
export function createAiMemoryRouter(): Router {
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
    asyncHandler(ingestMemoryHandler),
  );
  return r;
}
