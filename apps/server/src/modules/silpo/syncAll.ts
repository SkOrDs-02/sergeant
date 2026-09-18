import { query as defaultQuery } from "../../db.js";
import { logger } from "../../obs/logger.js";
import { pullAndSyncReceipts } from "./receipts.js";
import type { QueryFn } from "./tokenStore.js";

/**
 * Фоновий обхід підключених акаунтів Сільпо для
 * `POST /api/internal/silpo/sync-all` (n8n-крон, як
 * `08-weekly-financial-digest` / `06-mono-webhook-enrichment`).
 *
 * Навіщо. До цього чеки зʼявлялись ВИКЛЮЧНО тоді, коли людина сама
 * заходила в налаштування і тиснула «Оновити чеки». Продуктова обіцянка
 * інтеграції — «покупки збагачують транзакції» — для того, хто в
 * налаштування не заходить, не виконувалась узагалі.
 *
 * Чому не BullMQ. BullMQ-воркери в кодовій базі Є (`lib/jobs/authMail.ts`,
 * `lib/jobs/ftuxDrip.ts`, `modules/ai-memory/ingestQueue.ts`, у тому ж
 * процесі сервера), тож вибір тут вільний, а не вимушений. Але форма
 * роботи — періодичний ідемпотентний скан по всіх акаунтах, не дискретна
 * задача: черга не додала б жодної гарантії, лише брокер як зайву точку
 * відмови. За таблицею вибору субстрату (ADR-0089) це timer/cron-скан —
 * один HTTP-роут за наявним `INTERNAL_API_KEY`-гардом, який смикає n8n.
 *
 * Чому послідовно, а не `Promise.all`. `client_id` у Сільпо ОДИН на весь
 * деплой (DCR-реєстрація застосунку, не користувача), тож ліміти й
 * circuit breaker у `mcpClient.ts` — теж спільні на всіх. Паралельний
 * обхід сотні акаунтів відкрив би breaker на першій же хвилі й покарав
 * би заразом тих, хто в цю мить тисне кнопку руками.
 */

/** Стеля за один прогін — тримає час виклику передбачуваним для n8n-таймауту. */
const DEFAULT_USER_LIMIT = 100;

/** Пауза між акаунтами: рівномірний тиск на спільний `client_id`. */
const DEFAULT_DELAY_MS = 250;

export interface SyncAllOptions {
  limit?: number | undefined;
  delayMs?: number | undefined;
  /**
   * Брати лише тих, кого не синкали щонайменше стільки годин. `0` (дефолт)
   * — усіх підряд: так поводиться ручний прогін через internal-роут, коли
   * ops свідомо хоче «оновити зараз». Періодичний poller навпаки передає
   * поріг, інакше кожен рестарт контейнера ганяв би синк заново.
   */
  minAgeHours?: number | undefined;
  query?: QueryFn | undefined;
  /** Інʼєкція для тестів — реальний виклик бʼє в мережу. */
  syncOne?: ((userId: string) => Promise<unknown>) | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
}

export interface SyncAllResult {
  candidates: number;
  synced: number;
  failed: number;
  receiptsInserted: number;
  matched: number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Обходить `silpo_connection` зі `status = 'connected'` і синкає кожного.
 *
 * Помилка одного акаунта НЕ валить прогін: `reauth_required` у людини,
 * що відкликала доступ у Сільпо, — очікуваний стан, а не збій крона.
 * `pullAndSyncReceipts` сам позначить її звʼязок і піде далі.
 *
 * Найдавніше синковані йдуть першими (`last_sync_at NULLS FIRST`), тож
 * при впиранні в `limit` черга рухається по колу, а не годує ту саму
 * голову списку.
 */
export async function syncAllConnectedUsers(
  opts: SyncAllOptions = {},
): Promise<SyncAllResult> {
  const queryFn = opts.query ?? defaultQuery;
  const limit = opts.limit ?? DEFAULT_USER_LIMIT;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const syncOne =
    opts.syncOne ?? ((userId: string) => pullAndSyncReceipts(userId));
  const sleep = opts.sleep ?? defaultSleep;

  const minAgeHours = opts.minAgeHours ?? 0;
  const { rows } = await queryFn<{ user_id: string }>(
    `SELECT user_id
       FROM silpo_connection
      WHERE status = 'connected'
        AND ($2::int = 0
             OR last_sync_at IS NULL
             OR last_sync_at < NOW() - ($2::int * INTERVAL '1 hour'))
      ORDER BY last_sync_at ASC NULLS FIRST
      LIMIT $1`,
    [limit, minAgeHours],
    { op: "silpo_sync_all_candidates" },
  );

  const result: SyncAllResult = {
    candidates: rows.length,
    synced: 0,
    failed: 0,
    receiptsInserted: 0,
    matched: 0,
  };

  for (const [index, row] of rows.entries()) {
    if (index > 0 && delayMs > 0) await sleep(delayMs);
    try {
      const one = (await syncOne(row.user_id)) as
        { receiptsInserted?: number; matched?: number } | undefined;
      result.synced += 1;
      result.receiptsInserted += one?.receiptsInserted ?? 0;
      result.matched += one?.matched ?? 0;
    } catch (err) {
      result.failed += 1;
      // Без `userId` у полі: Hard Rule #21 — ідентифікатор користувача не
      // їде в логи разом із контекстом його покупок.
      logger.warn({
        msg: "silpo_sync_all_user_failed",
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info({ msg: "silpo.sync_all.completed", ...result });
  return result;
}
