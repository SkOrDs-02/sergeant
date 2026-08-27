import { Router } from "express";
import type { Pool } from "pg";

import { rateLimitExpress, requireSession, setModule } from "../http/index.js";
import { requirePlan } from "../modules/billing/index.js";
import { buildEventSyncHandler } from "../modules/ai-memory/eventSyncRoute.js";
import { ingestMemoryHandler } from "../modules/ai-memory/ingestRoute.js";
import { recallMemoryHandler } from "../modules/ai-memory/recallRoute.js";
import { clearAiMemoryHandler } from "../modules/ai-memory/clearRoute.js";
import {
  buildMemoryDeleteHandler,
  buildMemoryListHandler,
} from "../modules/ai-memory/listRoute.js";

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
 *
 * AI-CONTEXT (2026-07-25): цей ліміт більше НЕ вішається на весь префікс.
 * Він захищає worker-pool і Voyage-бюджет, тобто стосується `ingest` /
 * `recall` / `event-sync`. Екран «Що ШІ про мене памʼятає» робить дешеві
 * реляційні запити без жодного ембеддингу, і при спільному бакеті юзер,
 * який чистить памʼять, впирався б у 429 приблизно на 25-му видаленні —
 * рівно посеред дії, яку ми самі йому пропонуємо. Тому list/delete мають
 * власний, ширший бакет.
 */
export function createAiMemoryRouter({ pool }: { pool: Pool }): Router {
  const r = Router();
  r.use("/api/ai-memory", setModule("ai-memory"));

  /** Дорогий шлях: черга ingest-у + Voyage-ембеддинги. */
  const heavyRateLimit = rateLimitExpress({
    key: "api:ai-memory",
    limit: 30,
    windowMs: 5 * 60_000,
  });
  /**
   * Дешевий шлях: SELECT/DELETE по `ai_memories`. 200/5хв вистачає, щоб
   * прочистити велику памʼять за один сеанс, і все ще зупиняє скрипт.
   */
  const browseRateLimit = rateLimitExpress({
    key: "api:ai-memory:browse",
    limit: 200,
    windowMs: 5 * 60_000,
  });

  r.post(
    "/api/ai-memory/ingest",
    heavyRateLimit,
    requireSession(),
    requirePlan(pool, "pro"),
    ingestMemoryHandler,
  );
  r.post(
    "/api/ai-memory/recall",
    heavyRateLimit,
    requireSession(),
    requirePlan(pool, "pro"),
    recallMemoryHandler,
  );
  r.delete(
    "/api/ai-memory",
    browseRateLimit,
    requireSession(),
    clearAiMemoryHandler,
  );
  // AI-CONTEXT: list + per-item delete НЕ мають `requirePlan(pool, "pro")`,
  // на відміну від ingest/recall вище. Це не недогляд:
  //   * бачити й стирати власні дані — не преміум-фіча, а GDPR-мінімум
  //     (право на доступ + право на стирання); гейт за тарифом означав би,
  //     що юзер, який скасував Pro, більше не може дістатись до фактів,
  //     які про нього вже зібрали;
  //   * `DELETE /api/ai-memory` (стерти все) рядком вище теж без плану —
  //     гейтити видалення одного факту, лишивши безкоштовним видалення
  //     всього, було б просто непослідовно.
  // Записує памʼять лише Pro (ingest вище), тож у Free-юзера цей список
  // або порожній, або містить спадок від попереднього Pro-періоду —
  // і саме до нього доступ і потрібен.
  r.get(
    "/api/ai-memory/list",
    browseRateLimit,
    requireSession(),
    buildMemoryListHandler(pool),
  );
  r.delete(
    "/api/ai-memory/:id",
    browseRateLimit,
    requireSession(),
    buildMemoryDeleteHandler(pool),
  );
  // PR-24: PostHog → AI memory sync. Не вимагаємо pro-plan — behavioral
  // events важливі для founder-recall на будь-якому tier-і (founder теж
  // user-row, на free-tier у dev). Memory ingest сам перевіряє
  // `AI_MEMORY_ENABLED`; per-user Voyage квоту обмежує
  // `service.remember()`.
  r.post(
    "/api/ai-memory/event-sync",
    heavyRateLimit,
    requireSession(),
    buildEventSyncHandler(pool),
  );
  return r;
}
