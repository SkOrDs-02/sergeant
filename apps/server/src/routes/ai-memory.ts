import { Router } from "express";
import type { Pool } from "pg";

import { rateLimitExpress, requireSession, setModule } from "../http/index.js";
import { requirePlan } from "../modules/billing/index.js";
import { recallMemoryHandler } from "../modules/ai-memory/recallRoute.js";
import { clearAiMemoryHandler } from "../modules/ai-memory/clearRoute.js";
import {
  buildMemoryDeleteHandler,
  buildMemoryListHandler,
} from "../modules/ai-memory/listRoute.js";

/**
 * `/api/ai-memory/*`. Клієнт-driven ingestion (`POST /api/ai-memory/ingest`)
 * видалено ініціативою 0024 (PR-1, 2026-09-03) — жодне з клієнт-driven
 * джерел (`chat`/`fizruk`/`nutrition`/`routine`/`journal`) не мало
 * продюсера в дереві (`docs/90-work/initiatives/0024-ai-memory-source-
 * coverage.md`). Живі server-side producer-и: `digest/weekly-digest.ts`
 * (`source=digest`) і `ai-memory/profileMirror.ts` (`source=profile`).
 *
 * Recall (PR3) — semantic retrieval через `recall_memory` HubChat-tool.
 * Sync read-path, окремий від ingestion-черги.
 *
 * Rate-limit `30 req / 5min / IP` — стосується `recall`, лишений щедрим
 * historically ще з часів клієнт-driven ingest-у. Точніший анти-абʼюз —
 * Voyage квотою (per-user) у `service.remember()`.
 *
 * AI-CONTEXT (2026-07-25): цей ліміт більше НЕ вішається на весь префікс.
 * Він захищає worker-pool і Voyage-бюджет, тобто стосується `recall`.
 * Екран «Що ШІ про мене памʼятає» робить дешеві
 * реляційні запити без жодного ембеддингу, і при спільному бакеті юзер,
 * який чистить памʼять, впирався б у 429 приблизно на 25-му видаленні —
 * рівно посеред дії, яку ми самі йому пропонуємо. Тому list/delete мають
 * власний, ширший бакет.
 */
export function createAiMemoryRouter({ pool }: { pool: Pool }): Router {
  const r = Router();
  r.use("/api/ai-memory", setModule("ai-memory"));

  /** Дорогий шлях: Voyage-ембеддинг запиту на кожен recall. */
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
  // на відміну від recall вище. Це не недогляд:
  //   * бачити й стирати власні дані — не преміум-фіча, а GDPR-мінімум
  //     (право на доступ + право на стирання); гейт за тарифом означав би,
  //     що юзер, який скасував Pro, більше не може дістатись до фактів,
  //     які про нього вже зібрали;
  //   * `DELETE /api/ai-memory` (стерти все) рядком вище теж без плану —
  //     гейтити видалення одного факту, лишивши безкоштовним видалення
  //     всього, було б просто непослідовно.
  // Живі server-side producer-и (digest, profile) пишуть незалежно від
  // тарифу юзера, тож у Free-юзера цей список або порожній, або містить
  // спадок від попереднього Pro-періоду — і саме до нього доступ і потрібен.
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
  // `POST /api/ai-memory/event-sync` (PostHog → memory, PR-24) знято
  // 2026-08-29: телеметрія у ролі «фактів про людину» лише шуміла в RAG.
  // Наявні рядки source='product' лишаються читабельними у list/recall.
  return r;
}
