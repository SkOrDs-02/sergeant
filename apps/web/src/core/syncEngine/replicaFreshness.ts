/**
 * Свіжість локальної репліки — «чи бачить порада всю історію».
 *
 * AI-CONTEXT: аудит E-2 (`docs/90-work/audits/product-knowledge-fizruk.md`)
 * знайшов розрив не в окремому твердженні, а на СТИКУ трьох чесних: продукт
 * local-first, recovery «обчислюється з історії, не персиститься», снапшоти
 * рахує клієнт. Разом вони містять неперевірене припущення — що історія в
 * репліці цього пристрою повна. Сценарій із звіту дослівний: зранку мобільний
 * офлайн логує день ніг; увечері веб ще не отримав синк — ноги «green», і
 * recovery пропонує їх як пріоритет.
 *
 * AI-DANGER: цей модуль НЕ робить пораду правильною — він робить видимою її
 * невпевненість. Прибрати індикатор означає повернути стан, де порада на
 * дірявих даних виглядає рівно так само впевнено, як на повних.
 *
 * Джерела істини навмисно два і різні:
 *   - `sync_op_cursor.updated_at` — коли ми востаннє УСПІШНО застосували
 *     батч із `/v2/sync/pull` (тобто наскільки свіже те, що прийшло ЗВІДТИ);
 *   - `sync_op_outbox` зі статусом `pending` — що ми ще не віддали ТУДИ.
 * Перше без другого бреше: щойно синхронізований пристрій із повною чергою
 * на відправку теж показує неповну картину — просто з іншого боку.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { SYNC_OP_CURSOR_PULL_SINCE } from "@sergeant/db-schema/shared";

/**
 * Скільки годин після останнього успішного pull репліка вважається свіжою.
 *
 * ⚠️ **Інженерний дефолт, не рішення founder-а.** Аудит вимагає «приглушувати
 * впевненість, коли останній синк старший за X годин», X не називає. 6 годин
 * обрано так, щоб типовий розрив «зранку в залі з телефону → увечері на
 * вебі» (сценарій E-2) гарантовано потрапляв у «несвіжо», а звичайний
 * перерив на кілька годин у межах дня — ні.
 */
export const REPLICA_FRESH_WINDOW_HOURS = 6;

const MS_PER_HOUR = 60 * 60 * 1000;

export interface ReplicaFreshness {
  /** ISO часу останнього успішно застосованого pull-батчу. `null` — жодного. */
  lastPullAt: string | null;
  /** Скільки годин минуло. `null` — синку ще не було. */
  ageHours: number | null;
  /** Скільки власних змін ще чекають на відправку. */
  pendingOps: number;
  /** Синку не було або він старший за вікно. */
  stale: boolean;
  /**
   * Репліку можна вважати повною: свіжий pull І порожня черга на push.
   * Саме цей прапор вирішує, чи показувати застереження біля поради.
   */
  complete: boolean;
  /** Вікно, за яким рахували — щоб UI не вигадував власне число. */
  windowHours: number;
}

/**
 * `datetime('now')` у SQLite дає `YYYY-MM-DD HH:MM:SS` **без зони**, і це UTC.
 * `Date.parse` на такому рядку поводиться залежно від рушія (десь UTC, десь
 * локальний час), тож нормалізуємо явно — інакше вік синку зʼїжджав би на
 * зсув таймзони, і в Києві влітку «щойно» читалось би як «3 години тому».
 */
export function parseSqliteUtc(
  value: string | null | undefined,
): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const normalized = /[Zz]|[+-]\d{2}:?\d{2}$/.test(value)
    ? value.replace(" ", "T")
    : `${value.replace(" ", "T")}Z`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

const EMPTY: ReplicaFreshness = {
  lastPullAt: null,
  ageHours: null,
  pendingOps: 0,
  stale: true,
  complete: false,
  windowHours: REPLICA_FRESH_WINDOW_HOURS,
};

/** Стан «нічого не знаємо» — і це чесно НЕ «все гаразд». */
export function unknownReplicaFreshness(): ReplicaFreshness {
  return { ...EMPTY };
}

/**
 * Прочитати свіжість репліки з локального SQLite.
 *
 * Помилку читання не ковтаємо мовчки в «усе добре»: якщо ми не змогли
 * дізнатись стан синку, коректна відповідь — «не знаю», тобто `complete:
 * false`. Порада безпеки не має права вважати себе повною за замовчуванням.
 */
export async function readReplicaFreshness(
  client: SqliteMigrationClient,
  nowMs: number = Date.now(),
  windowHours: number = REPLICA_FRESH_WINDOW_HOURS,
): Promise<ReplicaFreshness> {
  try {
    const [cursorRows, pendingRows] = await Promise.all([
      // AI-DANGER: ключ курсора namespaced по користувачу
      // (`pull_since:<userId>`, `syncOpCursor.ts` — мультиакаунтний фікс
      // 2026-08-06). Точне порівняння з голим `pull_since` перестало
      // збігатись із чим-небудь того ж дня, тож `lastPullAt` назавжди
      // лишався `null`: модуль вічно писав «Синхронізації ще не було»
      // попри успішні пули, а `complete: false` глушив банер упевненості
      // поради (браузерний QA 2026-08-24). Голий легасі-ключ навмисно
      // НЕ підпадає під шаблон: рядок від старої схеми брехав би про
      // свіжий пул. Беремо найновіший — питання тут «коли ми востаннє
      // тягнули», а не «чий це курсор».
      client.all<{ updated_at: string }>(
        `SELECT updated_at FROM sync_op_cursor
          WHERE key LIKE ? ESCAPE '\\'
          ORDER BY updated_at DESC
          LIMIT 1`,
        [`${SYNC_OP_CURSOR_PULL_SINCE}:%`],
      ),
      client.all<{ n: number }>(
        `SELECT COUNT(*) AS n FROM sync_op_outbox WHERE status = 'pending'`,
      ),
    ]);

    const rawAt = cursorRows[0]?.updated_at ?? null;
    const atMs = parseSqliteUtc(rawAt);
    // Майбутня дата (кривий годинник) — це 0 годин тому, не відʼємний вік.
    const ageHours =
      atMs === null ? null : Math.max(0, (nowMs - atMs) / MS_PER_HOUR);
    const pendingOps = Math.max(0, Number(pendingRows[0]?.n ?? 0));
    const stale = ageHours === null || ageHours > windowHours;

    return {
      lastPullAt: atMs === null ? null : new Date(atMs).toISOString(),
      ageHours,
      pendingOps,
      stale,
      complete: !stale && pendingOps === 0,
      windowHours,
    };
  } catch {
    return { ...EMPTY, windowHours };
  }
}
