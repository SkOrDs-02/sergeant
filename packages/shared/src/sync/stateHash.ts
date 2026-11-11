/**
 * Канонізатор хешу стану sync-таблиці (ADR-0106 §1, аудит `data-38`).
 *
 * Один код для сервера (`GET /api/v2/sync/state-hash`) і клієнта (детекція
 * розбіжності локальної копії). Розбіжність нормалізації часу чи порядку —
 * єдине джерело хибних тривог, тому формат зафіксовано golden-вектором у
 * `__tests__/stateHash.test.ts`: будь-яка зміна тут ламає сумісність
 * клієнта й сервера у вікні деплою і потребує нового рішення (ADR).
 *
 * Формат:
 * - вхід — ідентичність і версія рядка, БЕЗ payload: `(pk, updated_at,
 *   deleted_at)` — саме ці поля визначають переможця LWW;
 * - `pk` — компоненти первинного ключа в порядку PK без `user_id`
 *   ({@link SYNC_STATE_HASH_TABLE_PKS}), з'єднані `\u001f`
 *   ({@link joinStateHashPk}); для одиночки на користувача — `""`;
 * - рядок входу: `pk \u001f updated_at_ms \u001f deleted_at_ms \n`, час —
 *   ціле число мілісекунд Unix (субмілісекунди відкидаються), живий рядок
 *   має порожній `deleted_at_ms`;
 * - рядки відсортовані за `pk` у побайтовому порядку UTF-8 (= порядок
 *   кодових точок; НЕ `localeCompare` і НЕ порядок UTF-16-одиниць, які
 *   розходяться на символах поза BMP);
 * - tombstone-и входять у хеш;
 * - хеш — SHA-256 hex від конкатенації рядків; плюс 16 кошиків за першим
 *   півбайтом SHA-256 від `pk`, у кожного свій хеш і кількість.
 */
import { sha256HexUtf8 } from "./sha256";

/** Роздільник компонентів складеного PK і полів рядка входу. */
export const STATE_HASH_FIELD_SEPARATOR = "\u001f";

/** Кількість кошиків (перший півбайт SHA-256 від `pk`). */
export const STATE_HASH_BUCKET_COUNT = 16;

/**
 * Allowlist таблиць першого етапу (ADR-0106 §1: Фізрук і Рутина) з
 * колонками ключа рядка в порядку PK **без `user_id`**.
 *
 * Чому без `user_id`: хеш рахується для одного користувача, тож `user_id`
 * у ключі сталий і нічого не розрізняє, а форма PK на боках різна — у
 * Postgres `(user_id, id)`, у клієнтському SQLite-дзеркалі просто `id`.
 * Ключ без `user_id` однаковий на обох боках. Таблиці-одиночки на
 * користувача (PK = `user_id`) мають порожній список: їхній `pk` — `""`.
 *
 * Свідомо поза списком (немає LWW-версії `updated_at`):
 * - `routine_streaks` — PN-лічильник (`op='increment'`), не LWW;
 * - `routine_completion_events` — append-only журнал без `updated_at` /
 *   `deleted_at`.
 *
 * AI-DANGER: ключі й колонки цього об'єкта сервер підставляє в SQL як
 * ідентифікатори. Додаєш таблицю — лише літералом тут, ніколи з вводу.
 */
export const SYNC_STATE_HASH_TABLE_PKS = {
  fizruk_workouts: ["id"],
  fizruk_workout_items: ["id"],
  fizruk_workout_sets: ["id"],
  fizruk_custom_exercises: ["id"],
  fizruk_custom_activities: ["id"],
  fizruk_measurements: ["id"],
  fizruk_daily_log: ["id"],
  fizruk_monthly_plan: [],
  fizruk_plan_templates: [],
  fizruk_programs: [],
  fizruk_wellbeing: ["date_key"],
  fizruk_workout_templates: ["id"],
  fizruk_injuries: ["id"],
  routine_entries: ["id"],
  routine_habits: ["id"],
  routine_tags: ["id"],
  routine_categories: ["id"],
  routine_prefs: [],
  routine_habit_order: [],
  routine_completion_notes: ["note_key"],
  routine_habit_skips: ["skip_key"],
} as const satisfies Record<string, readonly string[]>;

export type SyncStateHashTable = keyof typeof SYNC_STATE_HASH_TABLE_PKS;

export function isSyncStateHashTable(
  table: unknown,
): table is SyncStateHashTable {
  return (
    typeof table === "string" &&
    Object.prototype.hasOwnProperty.call(SYNC_STATE_HASH_TABLE_PKS, table)
  );
}

/**
 * Таблиці без колонки `deleted_at` (одиночки на користувача, PK =
 * `user_id`): soft-delete у них немає, `deleted_at_ms` завжди `null`.
 */
export const SYNC_STATE_HASH_TABLES_WITHOUT_DELETED_AT: ReadonlySet<SyncStateHashTable> =
  new Set<SyncStateHashTable>([
    "fizruk_monthly_plan",
    "fizruk_plan_templates",
    "fizruk_programs",
    "routine_prefs",
    "routine_habit_order",
  ]);

/** Один рядок входу канонізатора. */
export interface StateHashRow {
  /** Компоненти PK, уже з'єднані {@link joinStateHashPk}. */
  pk: string;
  /** `updated_at` у цілих мілісекундах Unix. */
  updated_at_ms: number;
  /** `deleted_at` у цілих мілісекундах Unix або `null` для живого рядка. */
  deleted_at_ms: number | null;
}

export interface StateHashBucket {
  bucket: number;
  hash: string;
  count: number;
}

export interface StateHashResult {
  total: { hash: string; count: number };
  buckets: StateHashBucket[];
}

/** З'єднує компоненти складеного PK у порядку PK. */
export function joinStateHashPk(components: readonly string[]): string {
  return components.join(STATE_HASH_FIELD_SEPARATOR);
}

/**
 * Мілісекунди Unix з будь-якого джерела часу (Date, ISO-рядок, число).
 * Дробові мілісекунди відкидаються вниз (`Math.floor`), як і
 * субмілісекундна точність Postgres `timestamptz`.
 */
export function toStateHashMs(value: Date | string | number): number {
  const ms =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new TypeError(`state-hash: невалідний час ${String(value)}`);
  }
  return Math.floor(ms);
}

function formatMs(ms: number): string {
  if (!Number.isSafeInteger(ms)) {
    throw new TypeError(`state-hash: час має бути цілим числом мс (${ms})`);
  }
  return String(ms);
}

/** Рядок входу для одного рядка таблиці, із завершальним `\n`. */
export function stateHashLine(row: StateHashRow): string {
  const sep = STATE_HASH_FIELD_SEPARATOR;
  const deleted = row.deleted_at_ms === null ? "" : formatMs(row.deleted_at_ms);
  return `${row.pk}${sep}${formatMs(row.updated_at_ms)}${sep}${deleted}\n`;
}

/**
 * Порівняння рядків у порядку байтів UTF-8. Для коректного UTF-16 він
 * збігається з порядком кодових точок; одиниці UTF-16 дають інший порядок
 * для символів поза BMP (сурогати 0xD800+ менші за 0xE000..0xFFFF).
 */
export function compareUtf8(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let i = 0;
  while (i < len) {
    const ca = a.codePointAt(i)!;
    const cb = b.codePointAt(i)!;
    if (ca !== cb) return ca < cb ? -1 : 1;
    i += ca > 0xffff ? 2 : 1;
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

/** Номер кошика `0..15`: перший півбайт SHA-256 від `pk`. */
export function stateHashBucketOf(pk: string): number {
  return parseInt(sha256HexUtf8(pk)[0]!, 16);
}

/**
 * Хеш стану таблиці. Порядок вхідних рядків не важливий: канонізатор сам
 * сортує їх за `pk`. Дублікат `pk` — помилка виклику (PK унікальний).
 */
export function computeStateHash(
  rows: readonly StateHashRow[],
): StateHashResult {
  const sorted = [...rows].sort((a, b) => compareUtf8(a.pk, b.pk));
  const bucketLines: string[][] = Array.from(
    { length: STATE_HASH_BUCKET_COUNT },
    () => [],
  );
  const allLines: string[] = [];
  let prevPk: string | undefined;
  for (const row of sorted) {
    if (prevPk === row.pk) {
      throw new Error("state-hash: дублікат pk у вхідних рядках");
    }
    prevPk = row.pk;
    const line = stateHashLine(row);
    allLines.push(line);
    bucketLines[stateHashBucketOf(row.pk)]!.push(line);
  }
  return {
    total: { hash: sha256HexUtf8(allLines.join("")), count: allLines.length },
    buckets: bucketLines.map((lines, bucket) => ({
      bucket,
      hash: sha256HexUtf8(lines.join("")),
      count: lines.length,
    })),
  };
}
