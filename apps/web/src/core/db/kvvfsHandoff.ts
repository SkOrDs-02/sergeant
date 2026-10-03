/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Перелиття локальної бази зі старого localStorage-сховища в OPFS —
 * стадія 2 спеки
 * [`sqlite-opfs-worker.md`](../../../../../docs/work/specs/sqlite-opfs-worker.md).
 *
 * **Спосіб — побайтова копія цілої бази, а не рядок за рядком.** SQLite
 * вміє віддати свій файл одним масивом (`sqlite3_js_db_export`), а
 * SAH-пул — прийняти його одним викликом (`importDb`). Це не оптимізація,
 * а питання безпеки: копія по рядках має стільки способів загубити дані,
 * скільки в ній таблиць, і кожен помітний лише постфактум. Побайтова
 * копія або відбулась цілком, або не відбулась.
 *
 * AI-DANGER: старе сховище тут НЕ чіпається. Ні під час перелиття, ні
 * після. У ньому лежить єдина копія недоставлених операцій
 * `sync_op_outbox`, і доки нова база не доведена на пристрої, знищити її
 * джерело означає знищити дані назавжди. Прибирання старого сховища — це
 * стадія 3, окремим рішенням.
 *
 * **Чому після імпорту ще потрібне підчищання.** У kvvfs УСІ партиції
 * ділять одне фізичне сховище: анонімний відвідувач і кожен акаунт, що
 * коли-небудь входив на цьому пристрої, лежать в одному блобі. В OPFS
 * партиція — це окремий файл. Тож імпортований файл спершу містить усе, і
 * рядки чужих партицій з нього видаляються (`pruneForeignPartitionRows`).
 * Без цього кроку файл акаунта А містив би рядки акаунта Б — регресія
 * ізоляції, яку свого часу заводили окремою знахідкою (page-audit-10 F17).
 */
import {
  safeReadStringLS,
  safeReadStringLSDurable,
  safeWriteStringLSDurable,
} from "@shared/lib/storage/storage";

import { NON_SYNCABLE_USER_IDS } from "../syncEngine/syncableUserId.js";
import type { SqliteConnection } from "./sqliteConnection.js";

/**
 * Ключ, у якому kvvfs тримає розмір своєї бази.
 *
 * AI-NOTE: `kvvfs-local-` — префікс, який бібліотека будує з імені
 * сховища (`JsStorageDb("local")`), а `sz` — розмір у байтах. Читаємо
 * саме його, щоб не вантажити 700 kB WASM заради відповіді «а чи є там
 * узагалі щось» на свіжому пристрої.
 */
const KVVFS_SIZE_KEY = "kvvfs-local-sz";

/** Позначка, що партиція вже перелита. Довговічна — переживає очистку кешу. */
const MARKER_PREFIX = "sergeant.storage.opfsHandoff.v1.";

function markerKey(userKey: string): string {
  return `${MARKER_PREFIX}${userKey}`;
}

/** Чи вже перелито цю партицію. */
export function isHandoffDone(userKey: string): boolean {
  return safeReadStringLSDurable(markerKey(userKey)) === "done";
}

/**
 * Позначити партицію перелитою.
 *
 * Ставиться ЛИШЕ після того, як нова база відкрилась і підчистилась. До
 * того моменту перелиття вважається таким, що не відбулось, і наступний
 * запуск почне його спочатку — імпорт перезаписує файл цілком, тож
 * повторення безпечне.
 */
export function markHandoffDone(userKey: string): void {
  safeWriteStringLSDurable(markerKey(userKey), "done");
}

/** Чи є в старому сховищі хоч щось, що варто переливати. */
export function hasKvvfsData(): boolean {
  const size = Number(safeReadStringLS(KVVFS_SIZE_KEY) ?? "0");
  return Number.isFinite(size) && size > 0;
}

/**
 * Знімок старої бази одним масивом байтів, або `null`, якщо переливати
 * нічого.
 *
 * Це єдине місце стадії 2, яке вантажить sqlite-wasm на головний потік —
 * інакше старої бази не відкрити взагалі. Разова ціна за переїзд; після
 * позначки цей шлях більше не виконується.
 */
export async function readKvvfsSnapshotBytes(): Promise<ArrayBuffer | null> {
  if (!hasKvvfsData()) return null;
  const mod = await import("@sqlite.org/sqlite-wasm");
  const sqlite3 = await mod.default();
  const db = new sqlite3.oo1.JsStorageDb("local");
  try {
    const pointer = db.pointer;
    if (pointer === undefined) return null;
    const bytes = sqlite3.capi.sqlite3_js_db_export(pointer);
    if (bytes.byteLength === 0) return null;
    // Копія замість `bytes.buffer`: експорт може віддати вікно в більший
    // буфер, і передати такий буфер у воркер означало б передати зайве.
    return bytes.slice().buffer;
  } finally {
    db.close();
  }
}

/**
 * Прибирає з щойно імпортованої бази рядки, які не належать цій партиції.
 *
 * Таблиці шукаються в самій базі, а не в реєстрі: реєстр `pull`-таблиць
 * не містить `sync_op_outbox`, а саме він тут найцінніший. Ознака
 * «партиційована таблиця» одна — колонка `user_id`; усе інше (журнал
 * міграцій, kv) лишається як є.
 *
 * @returns скільки таблиць підчищено — для діагностики, не для рішень.
 */
export async function pruneForeignPartitionRows(
  conn: SqliteConnection,
  userId: string | null,
): Promise<number> {
  const tables = (await conn.all(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    [],
    "object",
  )) as { name: string }[];

  let pruned = 0;
  for (const { name } of tables) {
    if (!/^[A-Za-z0-9_]+$/.test(name)) continue;
    const columns = (await conn.all(
      `SELECT name FROM pragma_table_info(?)`,
      [name],
      "object",
    )) as { name: string }[];
    if (!columns.some((column) => column.name === "user_id")) continue;

    if (userId === null) {
      // Анонімна партиція: лишаються рядки під синтетичними id, усе інше
      // належить акаунтам і поїде у свої файли.
      const placeholders = NON_SYNCABLE_USER_IDS.map(() => "?").join(", ");
      await conn.run(
        `DELETE FROM ${name} WHERE user_id IS NULL OR user_id NOT IN (${placeholders})`,
        [...NON_SYNCABLE_USER_IDS],
      );
    } else {
      await conn.run(
        `DELETE FROM ${name} WHERE user_id IS NULL OR user_id <> ?`,
        [userId],
      );
    }
    pruned += 1;
  }

  // `DELETE` звільняє сторінки, але не стирає їх: рядки чужого акаунта
  // лишились би читабельними всередині файлу цієї партиції. Саме заради
  // ізоляції партицій (page-audit-10 F17) переїзд і робить файл на акаунт,
  // тож лишити «привиди» означало б зробити половину роботи.
  //
  // Ковтаємо помилку свідомо: перелиття вже відбулось, і відкочувати його
  // через невдалий VACUUM було б гірше за залишок — стан у найгіршому разі
  // не гірший за той самий kvvfs, з якого ми щойно виїхали.
  if (pruned > 0) {
    try {
      await conn.exec("VACUUM");
    } catch {
      // Нічого не робимо: діагностика цього кроку не варта нового шляху відмови.
    }
  }
  return pruned;
}
