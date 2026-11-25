/**
 * Last validated: 2026-11-25
 * Status: Active
 *
 * Прапорець «анонімна партиція чиста / брудна» для швидкого шляху гейта
 * переносу анонімних даних. Спека
 * [`anonymous-migration-fast-path.md`](../../../../../docs/work/specs/anonymous-migration-fast-path.md),
 * варіант B, PR2: шар даних і тіньовий режим. Гейт за прапорцем ще НЕ
 * пропускає розвідку, це PR3.
 *
 * Три стани на пристрій:
 *
 *   unknown — ключа нема, значення нечитане/невалідне, або CLEAN старший
 *             за {@link CLEAN_REVERIFY_MS}: повна розвідка;
 *   clean   — доведено, що рядків `local-anon` для переносу нема;
 *   dirty   — був анонімний запис, перенос не підтвердив чистоту.
 *
 * AI-DANGER: прапорець живе в СИРОМУ `localStorage` (`resolveLsStore`), а не
 * в KV застосунку. KV-кеш партиційний і перечитується на `switchSqliteUser`,
 * тож стан анонімної партиції, прочитаний з KV акаунта, брехав би.
 *
 * AI-DANGER: CLEAN ставиться лише порівнянням-і-записом
 * ({@link markAnonPartitionCleanIfUnchanged}) проти токена, прочитаного ДО
 * доказу. Кожен DIRTY пише новий випадковий токен, тож запис, що проскочив
 * посеред доказу, робить порівняння хибним, і CLEAN не ставиться.
 */
import type { KVStore } from "@sergeant/shared";
import { resolveLsStore } from "@shared/lib/storage/storage";

/**
 * Ключ у сирому `localStorage`. Префікс `sergeant.` app-owned; чистка на
 * виході його зберігає (`purgeLocalData.ts`): анонімну партицію вона не
 * наповнює, а скинутий прапорець відкрив би вікно для хибного CLEAN.
 */
export const ANON_PARTITION_STATE_KEY = "sergeant.anonPartition.state.v1";

/**
 * Страховка від протухлого CLEAN (рішення власника 2026-11-21, Q3 (б)):
 * раз на 7 діб CLEAN перестає бути доказом, і вхід знову проходить повну
 * розвідку.
 */
export const CLEAN_REVERIFY_MS = 7 * 24 * 60 * 60 * 1000;

export type AnonPartitionState = "unknown" | "clean" | "dirty";

type StateStore = Pick<KVStore, "getString" | "setString" | "remove">;

/**
 * DIRTY, який не вдалося записати в сховище, тримаємо в памʼяті до кінця
 * сесії: поки вкладка жива, CLEAN не ставиться і не читається.
 */
let sessionDirty = false;

function defaultStore(): StateStore | null {
  return resolveLsStore();
}

function newToken(): string {
  return crypto.randomUUID();
}

/** Сире значення прапорця: токен для порівняння-і-запису. Не кидає. */
export function readAnonPartitionToken(
  store: StateStore | null = defaultStore(),
): string | null {
  try {
    return store?.getString(ANON_PARTITION_STATE_KEY) ?? null;
  } catch {
    return null;
  }
}

/**
 * Розбір значення. Формати: `dirty:<nonce>` і `clean:<ms>:<nonce>`.
 * Будь-що інше, зокрема CLEAN з датою в майбутньому, дає `unknown`.
 */
export function parseAnonPartitionState(
  raw: string | null,
  now: number = Date.now(),
): AnonPartitionState {
  if (raw === null) return "unknown";
  if (/^dirty:.+$/.test(raw)) return "dirty";
  const clean = /^clean:(\d+):.+$/.exec(raw);
  if (!clean) return "unknown";
  const at = Number(clean[1]);
  if (!Number.isSafeInteger(at) || at > now) return "unknown";
  return now - at < CLEAN_REVERIFY_MS ? "clean" : "unknown";
}

/** Поточний стан. Будь-яка невизначеність = `unknown` (fail-safe). */
export function readAnonPartitionState(
  now: number = Date.now(),
  store: StateStore | null = defaultStore(),
): AnonPartitionState {
  if (sessionDirty) return "dirty";
  return parseAnonPartitionState(readAnonPartitionToken(store), now);
}

/**
 * Позначити анонімну партицію брудною. Викликається СИНХРОННО до самого
 * анонімного запису (`sqlite.ts`, обгортка зʼєднання анонімної партиції).
 *
 * Якщо запис не вдався (сховище повне чи заблоковане), пробуємо стерти
 * ключ: відсутній прапорець = `unknown`, тобто повна розвідка. Якщо не
 * вдалося й це, лишається DIRTY у памʼяті сесії; старий CLEAN у сховищі
 * тоді доживе щонайбільше до {@link CLEAN_REVERIFY_MS}. Сам запис рядка не
 * блокуємо: втрата даних від відмови в записі гірша за зайву розвідку.
 */
export function markAnonPartitionDirty(
  store: StateStore | null = defaultStore(),
): void {
  const value = `dirty:${newToken()}`;
  try {
    store?.setString(ANON_PARTITION_STATE_KEY, value);
    if (store?.getString(ANON_PARTITION_STATE_KEY) === value) return;
  } catch {
    // Падаємо на стирання нижче.
  }
  sessionDirty = true;
  try {
    store?.remove(ANON_PARTITION_STATE_KEY);
  } catch {
    // Лишається DIRTY у памʼяті.
  }
}

/**
 * Поставити CLEAN, якщо з моменту читання `token` не було жодного
 * анонімного запису. Повертає `true`, якщо CLEAN записано й перечитано.
 *
 * `token` — значення {@link readAnonPartitionToken}, прочитане ДО доказу
 * (порожній snapshot, preflight `"empty"`, підтверджене видалення джерела).
 */
export function markAnonPartitionCleanIfUnchanged(
  token: string | null,
  now: number = Date.now(),
  store: StateStore | null = defaultStore(),
): boolean {
  if (sessionDirty || !store) return false;
  if (readAnonPartitionToken(store) !== token) return false;
  const value = `clean:${now}:${newToken()}`;
  try {
    store.setString(ANON_PARTITION_STATE_KEY, value);
    return store.getString(ANON_PARTITION_STATE_KEY) === value;
  } catch {
    return false;
  }
}

/**
 * Таблиці, запис у які на анонімній партиції НЕ створює даних для
 * переносу: KV-сховище, журнали міграцій (`__*`), службові таблиці SQLite,
 * claim переносу й власна черга синку. Будь-яка інша ціль запису, зокрема
 * незнайома, вважається брудною (fail-safe).
 */
const NON_DATA_TABLES: ReadonlySet<string> = new Set([
  "kv_store",
  "anonymous_profile_migrations",
  "sync_op_outbox",
  "sync_op_cursor",
]);

function isNonDataTable(table: string): boolean {
  const name = table.toLowerCase();
  return (
    NON_DATA_TABLES.has(name) ||
    name.startsWith("__") ||
    name.startsWith("sqlite_")
  );
}

/**
 * `INSERT [OR x] INTO t`, `REPLACE INTO t`, `UPDATE [OR x] t`. Група 1 ловить
 * `DO ` перед `UPDATE` (upsert-гілка `ON CONFLICT … DO UPDATE SET`), щоб
 * не прийняти `SET` за таблицю. Без lookbehind: старий Safari його не має.
 */
const WRITE_TARGET_RE =
  /(\bdo\s+)?\b(?:insert(?:\s+or\s+\w+)?\s+into|replace\s+into|update(?:\s+or\s+\w+)?)\s+(?:main\.)?["'`[]?([A-Za-z0-9_]+)/gi;
const WRITE_KEYWORD_RE = /\b(?:insert|replace|update)\b/i;

/**
 * Чи може цей SQL на анонімній партиції створити або змінити рядок, який
 * потім мав би переїхати в профіль. `DELETE` не рахується: він дані лише
 * прибирає. Хибнопозитивний результат коштує одну зайву розвідку,
 * хибнонегативний губить дані, тож за сумніву відповідь `true`.
 */
export function sqlMayWriteAnonData(sql: string): boolean {
  if (!WRITE_KEYWORD_RE.test(sql)) return false;
  let sawTarget = false;
  for (const match of sql.matchAll(WRITE_TARGET_RE)) {
    if (match[1]) continue;
    sawTarget = true;
    const table = match[2];
    if (!table || !isNonDataTable(table)) return true;
  }
  // Ключове слово є, а розібраної цілі нема: синтаксис, якого ми не знаємо.
  return !sawTarget && /^\s*(?:with|insert|replace|update)\b/i.test(sql);
}

/** Test-only. */
export function __resetAnonPartitionStateForTests(): void {
  sessionDirty = false;
}
