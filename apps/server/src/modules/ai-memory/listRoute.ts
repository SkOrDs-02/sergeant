/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * `GET /api/ai-memory/list` + `DELETE /api/ai-memory/:id` — перегляд і
 * видалення окремих фактів AI-памʼяті користувачем.
 *
 * До цього PR-у користувач міг лише **стерти все** (`DELETE /api/ai-memory`)
 * або нічого: побачити, що саме про нього памʼятає асистент, було ніяк.
 * Канон `hub-coach` (D5/G3) вимагає рівно цього — видимість і точкове
 * видалення.
 *
 * AI-CONTEXT: працюємо з `Pool` напряму, а не через `VectorStore`, свідомо.
 * `VectorStore` — це абстракція навколо ANN-пошуку (upsert / query по
 * вектору), і її мокають десятки тестів; додавання туди суто реляційних
 * list/delete зламало б кожен мок заради методів, які вектора не торкаються
 * взагалі. Той самий вибір уже зроблено у `forget.ts`.
 *
 * AI-DANGER: **hard delete, не soft.** У репо співіснують дві семантики
 * видалення, і переплутати їх легко:
 *   * `forget.ts` (`/forget` у Telegram, founder-only) — soft-delete через
 *     `deleted_at`, 7-денне вікно відновлення, аудит в `openclaw_invocations`.
 *   * user-facing шлях — hard `DELETE`, як уже робить `deleteAllForUser`
 *     під кнопкою «Очистити памʼять ШІ».
 * Рішення founder-а 2026-07-25 (#4): «Зникає назавжди. Стираємо з бази».
 * Тому тут `DELETE`, і UI має право писати «назавжди» без зірочки. Не
 * «уніфікуй» це з `forget.ts` — то інший шлях з іншим власником і іншою
 * обіцянкою.
 *
 * AI-DANGER: **узгоджене видалення з `user_profile`** (L-8 Фаза 2,
 * 2026-08-09). Відколи `profileMirror.ts` дзеркалить `memoryBank.entries`
 * у `source='profile'` рядки, цей список ПОКАЗУЄ і ЇХ теж — з тією самою
 * кнопкою видалення. Без узгодження стирання одного `ai_memories`-рядка
 * НЕ прибирає сам факт із `user_profile.payload.memoryBank.entries`, тож
 * наступний write-through пуш (з будь-якого пристрою, будь-яке
 * редагування банку — `pushCombinedProfile` завжди шле ПОВНИЙ локальний
 * список) мовчки воскрешає "видалений" факт. Тому `deleteMemoryHandler`
 * робить DELETE + (за потреби) `removeMemoryBankEntry` в ОДНІЙ транзакції
 * — див. `modules/me/profile.ts::removeMemoryBankEntry`.
 */
import type { Request, Response } from "express";
import type { Pool } from "pg";

import type {
  AiMemoryDeleteResponse,
  AiMemoryListResponse,
} from "@sergeant/shared";
import { AiMemoryListQuerySchema } from "@sergeant/shared";

import { logger } from "../../obs/logger.js";
import { removeMemoryBankEntry } from "../me/profile.js";

type WithSessionUser = Request & { user?: { id: string } };

/** Дефолт і стеля сторінки. Стеля — щоб один запит не тягнув усю памʼять. */
export const MEMORY_LIST_DEFAULT_LIMIT = 20;
export const MEMORY_LIST_MAX_LIMIT = 100;

interface MemoryListRow {
  /** `BIGSERIAL` — pg-драйвер віддає СТРІНГОЮ (Hard Rule #1). */
  id: string;
  source: string;
  content: string;
  topic: string | null;
  created_at: Date;
}

const SQL_LIST_FIRST_PAGE = `SELECT id, source, content, topic, created_at
     FROM ai_memories
    WHERE user_id = $1
      AND deleted_at IS NULL
    ORDER BY id DESC
    LIMIT $2`;

/**
 * `deleted_at IS NULL` обовʼязковий і тут, і вище: `/forget` у Telegram
 * робить soft-delete, і без фільтра вже стерті факти спливали б у списку
 * з робочою на вигляд кнопкою видалення.
 */
const SQL_LIST_AFTER_CURSOR = `SELECT id, source, content, topic, created_at
     FROM ai_memories
    WHERE user_id = $1
      AND deleted_at IS NULL
      AND id < $3
    ORDER BY id DESC
    LIMIT $2`;

/**
 * Keyset-пагінація по `id DESC`. Не OFFSET: памʼять поповнюється фоновою
 * чергою під час перегляду, і OFFSET на такій таблиці або дублює, або
 * пропускає рядки між сторінками.
 */
export function buildMemoryListHandler(pool: Pool) {
  return async function listMemoriesHandler(
    req: Request,
    res: Response,
  ): Promise<void> {
    const userId = (req as WithSessionUser).user!.id;

    const parsed = AiMemoryListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_query" });
      return;
    }
    const limit = Math.min(
      parsed.data.limit ?? MEMORY_LIST_DEFAULT_LIMIT,
      MEMORY_LIST_MAX_LIMIT,
    );
    const cursor = parsed.data.cursor;

    // Просимо на один рядок більше за сторінку — так дізнаємось, чи є
    // наступна, без окремого COUNT(*) по партиційованій таблиці.
    //
    // Два повні літерали замість одного шаблона з `${cursorClause}`: SQL
    // тут ніколи не склеюється рядками, тож `no-restricted-syntax` не має
    // приводу спрацювати, а читач бачить обидва запити цілком.
    const result =
      cursor === undefined
        ? await pool.query<MemoryListRow>(SQL_LIST_FIRST_PAGE, [
            userId,
            limit + 1,
          ])
        : await pool.query<MemoryListRow>(SQL_LIST_AFTER_CURSOR, [
            userId,
            limit + 1,
            cursor,
          ]);

    const hasMore = result.rows.length > limit;
    const page = hasMore ? result.rows.slice(0, limit) : result.rows;

    const payload: AiMemoryListResponse = {
      items: page.map((row) => ({
        // Hard Rule #1: `bigint` → `number` саме тут, у серіалізаторі.
        // Клієнт кладе цей id у RQ-ключ і в URL DELETE-а; стрінга там
        // мовчки роздвоїла б кеш ("12" ≠ 12).
        id: Number(row.id),
        source: row.source,
        content: row.content,
        topic: row.topic,
        createdAt: row.created_at.toISOString(),
      })),
      nextCursor: hasMore ? Number(page[page.length - 1]!.id) : null,
    };
    res.status(200).json(payload);
  };
}

/**
 * `DELETE /api/ai-memory/:id` — стерти один факт.
 *
 * Ідемпотентний: повторний виклик на вже видаленому id віддає 200 із
 * `deleted: false`, а не 404. Причина — реальний сценарій подвійного
 * тапу і паралельної вкладки; 404 тут змусив би UI показувати помилку
 * на дії, яка фактично досягла бажаного стану.
 */
export function buildMemoryDeleteHandler(pool: Pool) {
  return async function deleteMemoryHandler(
    req: Request,
    res: Response,
  ): Promise<void> {
    const userId = (req as WithSessionUser).user!.id;
    const raw = req.params["id"];
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id <= 0) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    // L-8 Фаза 2 (2026-08-09): DELETE + узгоджене прибирання з
    // `user_profile` (коли рядок мав `source='profile'`) — В ОДНІЙ
    // транзакції. "Обидві зміни або разом, або жодна": якщо
    // `removeMemoryBankEntry` кине (наприклад, мережева помилка Postgres
    // на другому запиті), ROLLBACK повертає й сам `ai_memories`-DELETE —
    // інакше факт зникає зі списку, але кнопка "видалення" насправді
    // нічого не гарантує, рівно той баг, що ця зміна лагодить.
    const client = await pool.connect();
    let deleted = false;
    let source: string | null = null;
    let rollbackFailed = false;
    try {
      await client.query("BEGIN");
      // `user_id = $1` — не декорація: без нього будь-хто з сесією стирав би
      // чужі факти за перебором id. Партиційний ключ теж user_id, тож умова
      // ще й тримає запит в одній партиції.
      const result = await client.query<{
        source: string;
        source_ref: string | null;
      }>(
        `DELETE FROM ai_memories WHERE user_id = $1 AND id = $2 RETURNING source, source_ref`,
        [userId, id],
      );
      deleted = (result.rowCount ?? 0) > 0;
      const row = result.rows[0];
      source = row?.source ?? null;

      if (deleted && row?.source === "profile" && row.source_ref) {
        await removeMemoryBankEntry(client, userId, row.source_ref);
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {
        // ROLLBACK не пройшов — зʼєднання лишилось усередині обірваної
        // транзакції. Повернути таке в пул означає віддати наступному
        // викликачу зламане зʼєднання (його перший же запит отримає
        // `current transaction is aborted`). `release(err)` натомість
        // знищує зʼєднання, і пул відкриває свіже.
        //
        // Оригінальна помилка все одно перемагає — вона й летить далі.
        rollbackFailed = true;
      });
      throw error;
    } finally {
      // `release(true)` — знищити, `release()` — повернути в пул.
      if (rollbackFailed) client.release(true);
      else client.release();
    }

    if (deleted) {
      logger.info({
        msg: "ai_memory_deleted_by_user",
        userId,
        memoryId: id,
        source,
      });
    }

    const payload: AiMemoryDeleteResponse = { ok: true, deleted };
    res.status(200).json(payload);
  };
}
