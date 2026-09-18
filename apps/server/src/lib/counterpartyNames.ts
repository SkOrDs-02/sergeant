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

/**
 * Стеля на кількість користувачів у кеші.
 *
 * AI-DANGER: TTL сам собою НЕ звільняє пам'ять. Запис із простроченим
 * `expiresAt` лежить у `Map` доти, доки той самий `userId` не прийде знову й
 * не перезапише його — sweep-у тут немає і не буде (він потребував би
 * власного таймера на гарячому шляху). Отже без цієї стелі кеш росте
 * монотонно з кожним новим користувачем чату: до 1000 імен на людину, і на
 * 4 ГБ VPS це закінчується OOM, а не деградацією.
 *
 * Витіснення — найстаріший за порядком вставки (`Map` його зберігає), той
 * самий прийом, що в `modules/nutrition/barcode.ts`. Це не справжній LRU:
 * читання порядок не оновлює. Для нашого профілю цього досить — запис живе
 * 5 хвилин, тож «найстаріший вставлений» і «найдавніше потрібний»
 * практично збігаються, а зайвий `delete`/`set` на КОЖНОМУ читанні коштував
 * би дорожче за рідкий промах.
 */
const CACHE_MAX_SIZE = 500;

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

/** Розмір кешу — для тестів, які перевіряють саме стелю. */
export function __counterpartyNamesCacheSize(): number {
  return cache.size;
}

/**
 * Покласти запис і дотримати стелю. Перед вставкою знімаємо наявний ключ,
 * щоб оновлення переїхало в кінець черги вставки — інакше «свіжий» запис
 * витіснявся б першим саме тому, що його колись уже клали.
 */
function cacheSet(userId: string, values: string[], now: number): void {
  if (cache.has(userId)) cache.delete(userId);
  cache.set(userId, { values, expiresAt: now + CACHE_TTL_MS });
  while (cache.size > CACHE_MAX_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
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
  if (hit) {
    if (hit.expiresAt > now) return hit.values;
    // Протермінований запис знімаємо одразу: інакше він займає місце під
    // стелею до наступного успішного `cacheSet` цього ж користувача, а при
    // недоступній базі (fail-open нижче) — і довше.
    cache.delete(userId);
  }

  try {
    const { rows } = await pool.query<{ counter_name: string | null }>(
      SQL_COUNTERPARTY_NAMES,
      [userId],
    );
    const values = normalizeKnownValues(rows.map((r) => r.counter_name));
    cacheSet(userId, values, now);
    return values;
  } catch (e) {
    logger.warn({
      msg: "counterparty_names_lookup_failed",
      err: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}
