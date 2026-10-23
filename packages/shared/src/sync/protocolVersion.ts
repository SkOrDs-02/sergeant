/**
 * Версія протоколу sync v2 (аудит 2026-10-01, `data-48`).
 *
 * Клієнт шле її в query-параметрі {@link SYNC_PROTOCOL_QUERY_PARAM} на кожен
 * `POST /api/v2/sync/push`; сервер порівнює зі своєю. Навіщо: невідома
 * сервером таблиця від клієнта з БІЛЬШОЮ версією - очікуваний стан у вікні
 * деплою (Vercel викочує фронт на ~25 хв раніше за бекенд), і такий оп треба
 * зберегти для повтору, а не відхилити назавжди. Від клієнта з тією ж або
 * меншою версією (чи без параметра) невідома таблиця - справжня відмова.
 *
 * AI-DANGER: це query, а НЕ заголовок. Новий фронт говорить зі СТАРИМ бекендом
 * у вікні деплою; невідомий заголовок не входить у CORS allow-list старого
 * сервера, preflight провалюється і ВСІ push-і падають. Невідомий query старий
 * сервер просто ігнорує.
 *
 * AI-NOTE: підніми число на 1 у тому ж PR, де в `OP_LOG_TABLE_REGISTRY`
 * (`apps/server/src/modules/sync/syncV2.ts`) з'являється нова sync-таблиця.
 * Без цього фронт із новою таблицею у вікні деплою отримає термінальний
 * `table_not_allowed` замість повтору.
 */
export const SYNC_PROTOCOL_VERSION = 1;

export const SYNC_PROTOCOL_QUERY_PARAM = "sync_protocol";

/**
 * Розбирає значення параметра. Відсутнє/нецiле/нульове -> `null`
 * (клієнт без версії трактується як старий).
 */
export function parseSyncProtocolVersion(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^\d{1,6}$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n > 0 ? n : null;
}
