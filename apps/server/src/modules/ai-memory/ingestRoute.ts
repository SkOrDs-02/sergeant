/**
 * Handler `POST /api/ai-memory/ingest` — клієнт-driven ingestion.
 *
 * Server-side hooks обробляють finyk (mono webhook) та digest (weekly-digest);
 * для всього іншого, що тримається тільки на клієнті у локальній БД (RxDB +
 * sync), потрібен явний канал, через який мобайл/веб може попросити сервер
 * запам'ятати запис у семантичну пам'ять. Сюди ходять:
 *   - nutrition (meal entry)
 *   - fizruk    (workout)
 *   - journal   (entry / morning page)
 *   - routine   (habit-completion / streak summary)
 *   - chat      (вибрані chat-turn-и; PR3 буде використовувати це для
 *                "save this to memory"-affordance)
 *
 * Контракт навмисно мінімальний — лише `{ source, sourceRef?, content,
 * metadata? }`. Ніякої бізнес-логіки на сервері: handler валідує payload,
 * енкьюїть BullMQ-job і повертає 202. Embedding + upsert трапляються
 * асинхронно у worker-і.
 *
 * Source-allow-list тут вужчий, ніж у `ALLOWED_MEMORY_SOURCES`: `finyk` і
 * `digest` навмисно ВИКЛЮЧЕНІ — для них є server-side hooks, які мають
 * цілісніший сирий payload (item, weekRange) ніж може передати клієнт. Якщо
 * клієнт спробує запостити з source=finyk, він отримає 400 (це ні дзеркалить,
 * ні не дзеркалить server-side ingestion — захищаємось від клієнтів, що
 * випадково просять записати неправильний source після rename).
 */

import type { Request, Response } from "express";
import { z } from "zod";

import { env } from "../../env.js";
import { validateBody } from "../../http/validate.js";
import { logger } from "../../obs/logger.js";
import { enqueueMemoryIngest } from "./ingestQueue.js";
import type { MemorySource } from "./types.js";

type WithSessionUser = Request & { user?: { id: string } };

/**
 * Дозволені source-и для клієнт-driven ingestion. Це підмножина
 * `ALLOWED_MEMORY_SOURCES` без `finyk` і `digest` (server-side hooks).
 *
 * Тип-string-літерали, а не enum, щоб zod-схема видавала явну error-message
 * "must be one of …" і UI міг показати точні допустимі значення.
 */
export const CLIENT_DRIVEN_MEMORY_SOURCES = [
  "chat",
  "fizruk",
  "nutrition",
  "routine",
  "journal",
] as const;

export type ClientDrivenMemorySource =
  (typeof CLIENT_DRIVEN_MEMORY_SOURCES)[number];

const SOURCE_REF_MAX_LEN = 200;

/**
 * Schema для тіла запиту. `content` обмежений `AI_MEMORY_INGEST_MAX_CONTENT_LEN`
 * у конструкторі, бо z.string().max() приймає число, а env читається лише при
 * import-і — fine.
 *
 * `metadata` — generic `Record<string, unknown>`. Жорсткішої валідації не
 * робимо: схема metadata varies по source-у, payload зберігається у JSONB
 * без додаткової логіки. Каппимо размір (post-stringify) щоб клієнт не
 * відправив гігабайт unstructured-у.
 */
function buildIngestRequestSchema() {
  return z
    .object({
      source: z.enum(CLIENT_DRIVEN_MEMORY_SOURCES),
      sourceRef: z
        .string()
        .min(1)
        .max(SOURCE_REF_MAX_LEN)
        .optional()
        .nullable(),
      content: z.string().min(1).max(env.AI_MEMORY_INGEST_MAX_CONTENT_LEN),
      metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .strict();
}

const MAX_METADATA_BYTES = 8 * 1024;

/**
 * Лімітимо розмір metadata-blob-у post-stringify (8KB). Це в десятки разів
 * перевищує очікуване (метадані mono-tx — ~300 байт, digest-section-у —
 * ~500 байт), але ловить злоумисний пейлоад до того, як він потрапить у
 * BullMQ-Redis і у JSONB-стовпчик. Не використовуємо `z.object().passthrough()`
 * з лімітом — простіше у сервісному шарі.
 */
function checkMetadataSize(
  metadata: Record<string, unknown> | undefined,
  res: Response,
): boolean {
  if (!metadata) return true;
  let size = 0;
  try {
    size = Buffer.byteLength(JSON.stringify(metadata), "utf8");
  } catch {
    res.status(400).json({
      error: "Некоректне metadata-поле (не JSON-серіалізовуване)",
      code: "INVALID_METADATA",
    });
    return false;
  }
  if (size > MAX_METADATA_BYTES) {
    res.status(413).json({
      error: `Metadata blob занадто великий: ${size}B (ліміт ${MAX_METADATA_BYTES}B)`,
      code: "METADATA_TOO_LARGE",
    });
    return false;
  }
  return true;
}

/**
 * POST /api/ai-memory/ingest. `req.user` гарантований middleware-ом
 * `requireSession`. Повертає 202 Accepted (job enqueued, async-completion).
 */
export async function ingestMemoryHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!env.AI_MEMORY_ENABLED) {
    // Вмикач вимкнений — повертаємо явно 503, а не 202, щоб клієнт не
    // думав, що запис проїхав. Це робить toggle-операцію безпечною: при
    // інциденті вмикач вимикає всі writes без потреби деплою.
    res.status(503).json({
      error: "AI memory вимкнено на сервері",
      code: "AI_MEMORY_DISABLED",
    });
    return;
  }

  const parsed = validateBody(buildIngestRequestSchema(), req, res);
  if (!parsed.ok) return;
  const { source, sourceRef, content, metadata } = parsed.data;

  if (!checkMetadataSize(metadata, res)) return;

  const userId = (req as WithSessionUser).user!.id;

  // Огортаємо у try/catch навіть попри fact, що `enqueueMemoryIngest` сам
  // не throw-ить (логує все internally). Це paranoia-rolling: один-два
  // patch-и в queue-обвʼязці змінять контракт — handler не ламається.
  try {
    await enqueueMemoryIngest({
      userId,
      source: source as MemorySource,
      sourceRef: sourceRef ?? null,
      content,
      metadata,
    });
  } catch (err) {
    logger.error({
      msg: "ai_memory_ingest_route_unexpected_error",
      userId,
      source,
      err: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({
      error: "Не вдалося enqueue-нути ingest-job",
      code: "ENQUEUE_FAILED",
    });
    return;
  }

  res.status(202).json({ ok: true, source, sourceRef: sourceRef ?? null });
}
