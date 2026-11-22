/**
 * Last validated: 2026-11-18
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
 * **Хто що робить (від 2026-11-18, PR-T1, рішення власника Б).** Головний
 * потік більше не має власного sqlite-wasm: тут лише читаються сирі рядки
 * `kvvfs-local-*` з `localStorage` ({@link readKvvfsSnapshot}), а файл бази
 * з них збирає SQLite воркера (`kvvfsConvert.ts`). Пристрій, де OPFS у
 * воркері не піднімається, kvvfs більше не відкриває взагалі: старе
 * сховище лежить недоторканим, доки браузер не оновиться і перелиття не
 * відбудеться звичайним шляхом.
 *
 * AI-DANGER: під час перелиття старе сховище НЕ чіпається. У ньому може
 * лежати єдина копія недоставлених операцій `sync_op_outbox`, і доки нова
 * база не доведена на пристрої, знищити її джерело означає знищити дані
 * назавжди. Прибирання — стадія 3 (priv-17, рішення власника «a»): лише
 * ПІСЛЯ позначки і лише коли перепис знімка ({@link takeKvvfsCensus})
 * каже, що в ньому немає нічого незамінного ({@link canRemoveKvvfsStore}).
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
  safeListLSKeys,
  safeReadStringLS,
  safeReadStringLSDurable,
  safeWriteStringLSDurable,
  resolveLsStore,
} from "@shared/lib/storage/storage";

import {
  NON_SYNCABLE_USER_IDS,
  isSyncableUserId,
} from "../syncEngine/syncableUserId.js";
import type { SqliteConnection } from "./sqliteConnection.js";
import type { KvvfsSnapshot } from "./sqliteProtocol.js";

/**
 * Ключ, у якому kvvfs тримає розмір своєї бази.
 *
 * AI-NOTE: `kvvfs-local-` — префікс, який бібліотека будує з імені
 * сховища (`JsStorageDb("local")`), а `sz` — розмір у байтах. Читаємо
 * саме його, щоб не перебирати всі ключі `localStorage` заради відповіді
 * «а чи є там узагалі щось» на свіжому пристрої.
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

/**
 * Чи вже перелито хоч один АКАУНТ, крім цього. Анонімна партиція не
 * рахується: `kv_store` зі старого сховища дістається першому акаунту
 * (див. {@link pruneForeignPartitionRows}).
 *
 * Читає сирий `localStorage`, а не `webKVStore`: після буту KV останній
 * дивиться в `kv_store`, а позначки довговічно живуть саме в LS.
 */
export function isAnotherAccountHandoffDone(
  userKey: string,
  anonUserKey: string,
): boolean {
  const skip = new Set([markerKey(userKey), markerKey(anonUserKey)]);
  const keys = resolveLsStore()?.listKeys() ?? [];
  return keys.some(
    (key) =>
      !skip.has(key) &&
      key.startsWith(MARKER_PREFIX) &&
      safeReadStringLSDurable(key) === "done",
  );
}

/** Чи є в старому сховищі хоч щось, що варто переливати. */
export function hasKvvfsData(): boolean {
  const size = Number(safeReadStringLS(KVVFS_SIZE_KEY) ?? "0");
  return Number.isFinite(size) && size > 0;
}

/** Префікс записів kvvfs у `localStorage` (`JsStorageDb("local")`). */
const KVVFS_KEY_PREFIX = "kvvfs-local-";
const KVVFS_JOURNAL_KEY = `${KVVFS_KEY_PREFIX}jrnl`;
const KVVFS_PAGE_KEY = /^kvvfs-local-(\d+)$/;

/**
 * Знімок старої бази як сирі записи `localStorage`, або `null`, якщо
 * переливати нічого.
 *
 * Жодного SQLite: рядки сторінок переносяться у воркер як є, а розбирає їх
 * уже воркер (`kvvfsConvert.ts`). Порядок сторінок будуємо тут за ЧИСЛОМ
 * номера — бібліотечний `kvvfs.export` сортує їх як рядки (1, 10, 2, …), і
 * така копія вийшла б тихо зіпсованою.
 *
 * Кидає, якщо в нумерації сторінок дірка: таке сховище не відкрилось би й
 * старим шляхом, а перелити його «як вийде» означало б позначити партицію
 * перелитою з неповними даними.
 */
export function readKvvfsSnapshot(): KvvfsSnapshot | null {
  if (!hasKvvfsData()) return null;
  const size = Number(safeReadStringLS(KVVFS_SIZE_KEY) ?? "0");
  const pageNumbers: number[] = [];
  for (const key of safeListLSKeys()) {
    const match = KVVFS_PAGE_KEY.exec(key);
    if (match) pageNumbers.push(Number(match[1]));
  }
  // `hasKvvfsData()` уже побачив розмір > 0, а сторінок немає: сховище в
  // неузгодженому стані, а не відсутнє. `null` тут означав би «нічого
  // переливати», і позначка перелиття стала б навічно, відрізавши записи,
  // якщо сторінки потім знайдуться. Кидаємо — шлях збою лишає позначку
  // незнятою, а сесію на памʼяті (CodeRabbit на #1692).
  if (pageNumbers.length === 0) {
    throw new Error(
      `kvvfs-handoff: size ${String(size)} recorded but no pages found`,
    );
  }
  pageNumbers.sort((a, b) => a - b);
  const pages: string[] = [];
  for (let index = 0; index < pageNumbers.length; index += 1) {
    const pageNumber = pageNumbers[index];
    if (pageNumber !== index + 1) {
      throw new Error(
        `kvvfs-handoff: page ${index + 1} is missing (found ${String(pageNumber)})`,
      );
    }
    const page = safeReadStringLS(`${KVVFS_KEY_PREFIX}${pageNumber}`);
    if (page === null) {
      throw new Error(`kvvfs-handoff: page ${pageNumber} is unreadable`);
    }
    pages.push(page);
  }
  return { size, journal: safeReadStringLS(KVVFS_JOURNAL_KEY), pages };
}

/** Таблиці бази: усі й ті з них, що партиційовані колонкою `user_id`. */
async function listTables(
  conn: SqliteConnection,
): Promise<{ all: string[]; partitioned: string[] }> {
  const rows = (await conn.all(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    [],
    "object",
  )) as { name: string }[];
  const all = rows.map(({ name }) => name);
  const partitioned: string[] = [];
  for (const name of all) {
    // Ім'я таблиці не передати параметром, тож воно йде в SQL текстом.
    if (!/^[A-Za-z0-9_]+$/.test(name)) continue;
    const columns = (await conn.all(
      `SELECT name FROM pragma_table_info(?)`,
      [name],
      "object",
    )) as { name: string }[];
    if (columns.some((column) => column.name === "user_id")) {
      partitioned.push(name);
    }
  }
  return { all, partitioned };
}

/** Що лежало в старому сховищі, за знімком до підчищання. */
export interface KvvfsCensus {
  /** Сирі `user_id` усіх партицій, чиї рядки є в знімку (без `NULL`). */
  readonly userIds: readonly string[];
  /** Рядків у `sync_op_outbox` знімка, будь-якого статусу. */
  readonly outboxRows: number;
  /** Рядків у `kv_store` знімка: він один на всіх і лише локальний. */
  readonly kvStoreRows: number;
}

async function countRows(
  conn: SqliteConnection,
  tables: readonly string[],
  name: "sync_op_outbox" | "kv_store",
): Promise<number> {
  if (!tables.includes(name)) return 0;
  const rows = (await conn.all(
    `SELECT COUNT(*) AS n FROM ${name}`,
    [],
    "object",
  )) as { n: unknown }[];
  return Number(rows[0]?.n ?? 0);
}

/**
 * Перепис щойно імпортованої бази — ДО {@link pruneForeignPartitionRows}.
 *
 * AI-DANGER: вірний лише на файлі, свіжо зібраному зі знімка
 * (`conn.imported`). Файл, що лишився від попередньої спроби, міг бути вже
 * підчищений, і перепис побачив би тільки свою партицію, хоча в
 * `kvvfs-local-*` лежать ще й чужі.
 */
export async function takeKvvfsCensus(
  conn: SqliteConnection,
): Promise<KvvfsCensus> {
  const { all, partitioned } = await listTables(conn);
  const userIds = new Set<string>();
  for (const name of partitioned) {
    const rows = (await conn.all(
      `SELECT DISTINCT user_id FROM ${name} WHERE user_id IS NOT NULL`,
      [],
      "object",
    )) as { user_id: unknown }[];
    for (const row of rows) userIds.add(String(row.user_id));
  }
  return {
    userIds: [...userIds],
    outboxRows: await countRows(conn, all, "sync_op_outbox"),
    kvStoreRows: await countRows(conn, all, "kv_store"),
  };
}

/** Які партиції знімка вже мають власну позначку перелиття. */
export interface KvvfsHandoffProgress {
  /** Чи перелита анонімна партиція (`sergeant-anon.db`). */
  readonly anonHandedOff: boolean;
  /** Чи перелито акаунт із цим сирим `user_id` у його власний файл. */
  readonly isAccountHandedOff: (userId: string) => boolean;
  /**
   * Чи перелито хоч один акаунт, тобто `kv_store` знімка вже дістався
   * першому з них (див. {@link pruneForeignPartitionRows}).
   */
  readonly kvStoreDelivered: boolean;
}

/**
 * Чи можна стерти старе сховище після перелиття цієї партиції (стадія 3,
 * priv-17, рішення власника «a»: після підтвердженого перелиття і порожньої
 * черги). Усі умови разом:
 *
 * - **Черга порожня.** У `sync_op_outbox` знімка немає жодного рядка.
 * - **Кожна партиція знімка перелита у свій файл.** Анонімна — бо її дані
 *   на сервер не їдуть узагалі. Кожен акаунт — бо порожня черга обіцяє
 *   лише його синхронізовані рядки, а не те, що живе тільки на пристрої.
 * - **`kv_store` уже в акаунта**, якщо в знімку він не порожній. Він лише
 *   локальний, серверної копії немає, а анонімна партиція його не отримує.
 *
 * AI-DANGER: на холодному старті анонімна партиція переливається ПЕРШОЮ,
 * ще до того, як `AuthContext` назве акаунт. Стерти сховище з її
 * перелиття, поки акаунт зі знімка чекає свого, означало б назавжди
 * забрати в нього `kv_store` (перший підхід до priv-17 саме так і робив).
 */
export function canRemoveKvvfsStore(
  census: KvvfsCensus,
  progress: KvvfsHandoffProgress,
): boolean {
  if (!Number.isFinite(census.outboxRows) || census.outboxRows !== 0) {
    return false;
  }
  if (!Number.isFinite(census.kvStoreRows)) return false;
  if (census.kvStoreRows !== 0 && !progress.kvStoreDelivered) return false;
  return census.userIds.every((id) =>
    isSyncableUserId(id)
      ? progress.isAccountHandedOff(id)
      : progress.anonHandedOff,
  );
}

/**
 * Стирає старе сховище цілком: сторінки, `kvvfs-local-sz` і журнал.
 * Пише в сирий `localStorage`, бо саме там kvvfs їх і тримав.
 *
 * @returns скільки ключів прибрано — для діагностики.
 */
export function removeKvvfsStore(): number {
  const store = resolveLsStore();
  if (!store) return 0;
  const keys = store
    .listKeys()
    .filter((key) => key.startsWith(KVVFS_KEY_PREFIX));
  // Розмір — ПЕРШИМ. Якщо вкладку закриють посеред циклу, без нього
  // `hasKvvfsData()` уже каже «нічого немає», і наступна партиція не
  // спробує перелити недостерті сторінки: дірка в нумерації кинула б
  // `readKvvfsSnapshot` і лишила б її в памʼяті на кожному старті.
  if (keys.includes(KVVFS_SIZE_KEY)) store.remove(KVVFS_SIZE_KEY);
  for (const key of keys) {
    if (key !== KVVFS_SIZE_KEY) store.remove(key);
  }
  return keys.length;
}

/**
 * Прибирає з щойно імпортованої бази рядки, які не належать цій партиції.
 *
 * Таблиці шукаються в самій базі, а не в реєстрі: реєстр `pull`-таблиць
 * не містить `sync_op_outbox`, а саме він тут найцінніший. Ознака
 * «партиційована таблиця» одна — колонка `user_id`; журнали міграцій
 * лишаються як є.
 *
 * `kv_store` партиції не має: у kvvfs він був один на всіх. Його отримує
 * лише ПЕРШИЙ перелитий акаунт (`keepKvStore`, рішення власника «a»);
 * анонімна партиція й наступні акаунти стартують з порожнім, інакше новий
 * акаунт успадкував би чужі значення (зокрема біометрію) і відправив би їх
 * write-through на сервер (priv-17).
 *
 * @returns скільки таблиць підчищено — для діагностики, не для рішень.
 */
export async function pruneForeignPartitionRows(
  conn: SqliteConnection,
  userId: string | null,
  options: { readonly keepKvStore: boolean },
): Promise<number> {
  const { all: tables, partitioned } = await listTables(conn);

  let pruned = 0;
  for (const name of partitioned) {
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

  // У `sync_op_cursor` немає `user_id` (id стоїть суфіксом ключа), тож цикл
  // вище його не бачить. Скидаємо всі курсори, свій теж: старий kvvfs-вихід
  // стирав рядки акаунта, а курсор лишав, і партиція отримала б курсор «з
  // кінця» без рядків. Один повний pull після переїзду ідемпотентний (LWW у
  // `applyPullOp`) і лікує такий стан.
  if (tables.includes("sync_op_cursor")) {
    await conn.run(`DELETE FROM sync_op_cursor`, []);
    pruned += 1;
  }

  if (!options.keepKvStore && tables.includes("kv_store")) {
    await conn.run(`DELETE FROM kv_store`, []);
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
