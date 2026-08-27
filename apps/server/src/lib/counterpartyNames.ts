/**
 * Last validated: 2026-07-26
 * Status: Active
 *
 * Список імен контрагентів користувача — вхід для класу Б у
 * `lib/llmRedaction.ts` (див. рішення founder-а #10).
 *
 * AI-CONTEXT: чому саме `counter_edrpou IS NULL`. У Monobank поле
 * `counterEdrpou` заповнене тоді, коли на тому боці **зареєстрована
 * юридична особа або ФОП**. Тобто наявність коду — це готовий, наданий
 * банком маркер «це бізнес, а не людина». Ми ним і користуємось: імена
 * без коду вирізаємо, назви з кодом лишаємо.
 *
 * Практичний наслідок, який варто знати наперед: **ФОП свого імені не
 * втратить** — «ФОП Петренко І. І.» має код, отже проходить як бізнес.
 * Це узгоджено з рішенням #10 («назви крамниць ідуть як є»): ФОП — це
 * крамниця. Якщо колись захочеш інакше, міняти треба тут, а не в регекспі.
 */

import pool from "../db.js";
import { normalizeKnownValues } from "./llmRedaction.js";
import { logger } from "../obs/logger.js";

/**
 * Скільки живе закешований список. Імена контрагентів змінюються з появою
 * нових переказів, тобто повільно; пʼять хвилин прибирають запит із
 * гарячого шляху кожного повідомлення в чаті, не роблячи список застарілим
 * настільки, щоб свіже імʼя протекло надовго.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

const SQL_COUNTERPARTY_NAMES = `SELECT DISTINCT counter_name
     FROM mono_transaction
    WHERE user_id = $1
      AND counter_name IS NOT NULL
      AND counter_edrpou IS NULL
      AND time > NOW() - INTERVAL '365 days'
    LIMIT 1000`;

interface CacheEntry {
  values: string[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Скидає кеш — для тестів і для ручного інвалідування після імпорту. */
export function __resetCounterpartyNamesCache(): void {
  cache.clear();
}

/**
 * Повертає нормалізований список імен контрагентів-фізосіб.
 *
 * Fail-open за дизайном: якщо база недоступна, повертаємо порожній список
 * і чат працює далі з класом А. Обвалити розмову через недоступний
 * список для маскування було б гіршим наслідком, ніж один незамаскований
 * тур — але факт логуємо, бо тиха деградація маскування має бути видимою.
 */
export async function getCounterpartyNames(
  userId: string | null | undefined,
): Promise<string[]> {
  if (!userId) return [];
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > now) return hit.values;

  try {
    const { rows } = await pool.query<{ counter_name: string | null }>(
      SQL_COUNTERPARTY_NAMES,
      [userId],
    );
    const values = normalizeKnownValues(rows.map((r) => r.counter_name));
    cache.set(userId, { values, expiresAt: now + CACHE_TTL_MS });
    return values;
  } catch (e) {
    logger.warn({
      msg: "counterparty_names_lookup_failed",
      err: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}
