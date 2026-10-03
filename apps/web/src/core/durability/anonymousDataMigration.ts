/**
 * Last validated: 2026-07-28
 * Status: Active
 *
 * One-shot handoff of anonymous local-first rows to the first authenticated
 * profile. Source rows remain untouched until Sync V2 has acknowledged every
 * winning local row.
 */
import type { SyncV2PullOp } from "@sergeant/api-client";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { LOCAL_ANON_USER_ID } from "../auth/localIdentity.js";
import {
  applyPullOp,
  CLIENT_PULL_SUPPORTED_TABLES,
} from "../syncEngine/applyPullOp.js";
import { enqueueOutboxUpsert } from "../syncEngine/enqueueOutboxUpsert.js";
import { NON_SYNCABLE_USER_IDS } from "../syncEngine/syncableUserId.js";
import { notifyOutboxEnqueued } from "../syncEngine/outboxNudge.js";

interface MigrationClaim extends Record<string, unknown> {
  readonly target_user_id: string;
  readonly batch_id: string;
  readonly status: "pending" | "completed";
}

interface SnapshotRow {
  readonly table: string;
  readonly row: Record<string, unknown>;
  readonly primaryKey: readonly string[];
  readonly clientTs: string;
}

export interface AnonymousMigrationResult {
  readonly migratedRows: number;
}

export interface AnonymousMigrationOptions {
  /**
   * Викликається рівно один раз і лише тоді, коли розвідка знайшла анонімні
   * рядки, тобто починається справжній перенос. До цього моменту функція
   * тільки перемикає партицію, доганяє схеми модулів і сканує таблиці —
   * робота, про яку користувачу нема чого повідомляти (див.
   * `AnonymousDataMigrationProvider`).
   */
  readonly onTransferStart?: () => void;
}

const MIGRATION_ORIGIN_DEVICE_ID = "anonymous-profile-migration";

async function migrateModuleSchemas(
  client: SqliteMigrationClient,
): Promise<void> {
  const [
    { migrateRoutine },
    { migrateFizruk },
    { migrateNutrition },
    { migrateFinyk },
  ] = await Promise.all([
    import("../../modules/routine/lib/clientMigrate.js"),
    import("../../modules/fizruk/lib/clientMigrate.js"),
    import("../../modules/nutrition/lib/clientMigrate.js"),
    import("../../modules/finyk/lib/clientMigrate.js"),
  ]);
  await migrateRoutine(client);
  await migrateFizruk(client);
  await migrateNutrition(client);
  await migrateFinyk(client);
}

async function tableExists(
  client: SqliteMigrationClient,
  table: string,
): Promise<boolean> {
  const rows = await client.all<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [table],
  );
  return rows.length > 0;
}

async function primaryKeyColumns(
  client: SqliteMigrationClient,
  table: string,
): Promise<string[]> {
  const rows = await client.all<{ name: string; pk: number }>(
    `SELECT name, pk FROM pragma_table_info(?)`,
    [table],
  );
  return rows
    .filter((row) => row.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((row) => row.name);
}

function resolveClientTs(row: Readonly<Record<string, unknown>>): string {
  for (const column of [
    "updated_at",
    "occurred_at",
    "last_completed_at",
    "created_at",
  ]) {
    const value = row[column];
    if (typeof value === "string" && Number.isFinite(Date.parse(value)))
      return value;
  }
  // A few legacy aggregate rows (notably routine_streaks) predate an
  // updated_at column. Epoch is deliberately conservative: an existing
  // server version wins, while a new profile can still accept the row.
  return "1970-01-01T00:00:00.000Z";
}

function decodeJsonColumns(
  row: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([column, value]) => {
      if (!column.endsWith("_json") || typeof value !== "string")
        return [column, value];
      try {
        return [column, JSON.parse(value) as unknown];
      } catch {
        return [column, value];
      }
    }),
  );
}

async function snapshotAnonymousRows(
  client: SqliteMigrationClient,
): Promise<SnapshotRow[]> {
  const snapshot: SnapshotRow[] = [];
  for (const table of CLIENT_PULL_SUPPORTED_TABLES) {
    if (!(await tableExists(client, table))) continue;
    const primaryKey = await primaryKeyColumns(client, table);
    if (primaryKey.length === 0)
      throw new AnonymousMigrationStepError("snapshot-no-pk", table);
    const rows = await client.all<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE user_id = ?`,
      [LOCAL_ANON_USER_ID],
    );
    for (const row of rows) {
      snapshot.push({ table, row, primaryKey, clientTs: resolveClientTs(row) });
    }
  }
  return snapshot;
}

async function getOrCreateClaim(
  client: SqliteMigrationClient,
  targetUserId: string,
): Promise<MigrationClaim> {
  const existing = await client.all<MigrationClaim>(
    `SELECT target_user_id, batch_id, status
       FROM anonymous_profile_migrations
      WHERE source_user_id = ?`,
    [LOCAL_ANON_USER_ID],
  );
  const claim = existing[0];
  if (claim) {
    if (claim.target_user_id !== targetUserId) {
      if (claim.status !== "completed") {
        throw new AnonymousMigrationStepError(
          "claim",
          "pending-for-other-user",
        );
      }
      const batchId = crypto.randomUUID();
      await client.run(
        `UPDATE anonymous_profile_migrations
            SET target_user_id = ?, batch_id = ?, status = 'pending',
                started_at = ?, completed_at = NULL
          WHERE source_user_id = ?`,
        [targetUserId, batchId, new Date().toISOString(), LOCAL_ANON_USER_ID],
      );
      return {
        target_user_id: targetUserId,
        batch_id: batchId,
        status: "pending",
      };
    }
    return claim;
  }
  const batchId = crypto.randomUUID();
  await client.run(
    `INSERT INTO anonymous_profile_migrations
       (source_user_id, target_user_id, batch_id, status, started_at)
     VALUES (?, ?, ?, 'pending', ?)`,
    [LOCAL_ANON_USER_ID, targetUserId, batchId, new Date().toISOString()],
  );
  return { target_user_id: targetUserId, batch_id: batchId, status: "pending" };
}

/**
 * Первинний ключ рядка, яким він поїде на сервер.
 *
 * Береться з ЕФЕКТИВНОГО рядка (після {@link rekeySharedLocalIds}), а не з
 * джерела: інакше виправлений рядок дістав би той самий idempotency-ключ,
 * що й попередня відхилена спроба, і `enqueueOutboxUpsert` віддав би стару
 * відхилену стрічку замість того, щоб покласти нову.
 */
function canonicalPrimaryKey(
  item: SnapshotRow,
  effectiveRow: Readonly<Record<string, unknown>>,
): string {
  return JSON.stringify(
    item.primaryKey.map((column) => [column, effectiveRow[column]]),
  );
}

/**
 * Прибирає з первинного ключа спільні локальні ідентичності.
 *
 * AI-DANGER: `id` у серверних таблицях — ГЛОБАЛЬНИЙ первинний ключ, один
 * на всіх людей. А `LOCAL_ANON_USER_ID` (`local-anon`) — константа, однакова
 * на КОЖНОМУ пристрої. Тож будь-який локальний генератор, що солить id цим
 * значенням, робить ключ, який неминуче збігається в двох незнайомих людей.
 * Живий приклад — `bodyWeightBootstrap.ts`: анонімна сесія пише
 * `m_bootstrap_local-anon`, і цей рядок їде в акаунт при переносі.
 *
 * Наслідок бачив власник 2026-09-15: `fizruk_measurements/insert
 * status=rejected`, причина `fk_violation`. Вона тут НЕ про Postgres —
 * так сервер називає «рядок із таким id уже є, і він належить іншому
 * користувачу» (`applyMisc.ts`). Тобто перший, хто зареєструвався,
 * забрав ключ глобально, а всі наступні дістають відмову назавжди:
 * `rejected` — стан термінальний, повтор його не рухає.
 *
 * Діру назвали ще 2026-09-03, коли лагодили той самий клас для
 * Strong-імпорту: докстрінг `strongIdNamespace.ts` прямо каже, що
 * `anonymousDataMigration.ts` переносить рядки, НЕ перегенеровуючи id.
 * Тоді її обійшли з боку генератора (солити id пристрою, не спільною
 * константою); тут вона закривається з боку переносу — для всіх
 * генераторів одразу, наявних і майбутніх.
 *
 * Заміна точкова: у значенні ключа спільна ідентичність міняється на id
 * цільового акаунта, тобто виходить рівно те, що генератор написав би,
 * якби людина вже була залогінена. Решта рядка не чіпається, а `item.row`
 * лишається джерелом для видалення оригіналу ({@link deleteSourceRows}) —
 * інакше прибирати було б нічого.
 */
function rekeySharedLocalIds(
  item: SnapshotRow,
  targetUserId: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const column of item.primaryKey) {
    const value = item.row[column];
    if (typeof value !== "string") continue;
    let next = value;
    for (const shared of NON_SYNCABLE_USER_IDS) {
      if (next.includes(shared)) next = next.split(shared).join(targetUserId);
    }
    if (next !== value) patch[column] = next;
  }
  return patch;
}

/**
 * Лагодить рядки черги, які застрягли з ключем, що містить спільну
 * локальну ідентичність.
 *
 * AI-CONTEXT: до стадії 2.4 перенос віз такі ключі на сервер як є, і вони
 * поверталися `rejected`/`fk_violation` — назавжди, бо `rejected` стан
 * термінальний, а `recoverDeadLetter` його свідомо не бере («такі рядки
 * прибирає оператор ПІСЛЯ того, як діагностував причину»). Причину
 * діагностовано і закрито в 2.4, тож це рівно той випадок.
 *
 * Чому перекей, а не видалення. Видалити означало б тихо втратити спробу
 * доставки для пристроїв, де перенос завершився ДО 2.4: там виправлена
 * копія на сервер не їхала взагалі. Перекей нічого не втрачає — рядок
 * дістає той самий ключ, що й доставлена копія, тож сервер відповість
 * `lww_conflict` (доставлено раніше) або застосує його (не доставлено).
 * Обидва результати — вирішені, і рядок іде зі списку «Не прийнято».
 *
 * Повторний виклик безпечний за побудовою: після перекею ключ спільної
 * ідентичності вже не містить, тож вибірка його більше не бачить.
 *
 * Ніколи не кидає: це прибирання ПІСЛЯ успіху, і зробити його новим
 * шляхом відмови в коді переносу було б гірше за залишений привид.
 *
 * @returns скільки рядків полагоджено — для діагностики, не для рішень.
 */
async function rekeyStuckOutboxRows(
  client: SqliteMigrationClient,
  userId: string,
): Promise<number> {
  try {
    const likeClauses = NON_SYNCABLE_USER_IDS.map(() => "row LIKE ?").join(
      " OR ",
    );
    const candidates = await client.all<{ id: number; row: string }>(
      `SELECT id, row FROM sync_op_outbox
        WHERE user_id = ? AND (${likeClauses})`,
      [userId, ...NON_SYNCABLE_USER_IDS.map((shared) => `%${shared}%`)],
    );

    let repaired = 0;
    for (const candidate of candidates) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(candidate.row);
      } catch {
        continue;
      }
      if (typeof parsed !== "object" || parsed === null) continue;
      const payload = parsed as Record<string, unknown>;
      const id = payload["id"];
      // Звужуємо до ПЕРВИННОГО ключа: `LIKE` вище ловить спільну
      // ідентичність будь-де в JSON, а лагодити треба лише ключ.
      if (typeof id !== "string") continue;
      let nextId = id;
      for (const shared of NON_SYNCABLE_USER_IDS) {
        if (nextId.includes(shared)) nextId = nextId.split(shared).join(userId);
      }
      if (nextId === id) continue;

      await client.run(
        `UPDATE sync_op_outbox
            SET row = ?, idempotency_key = ?, status = 'pending',
                reject_reason = NULL, last_error = NULL,
                attempts = 0, next_retry_at = NULL
          WHERE id = ?`,
        [
          JSON.stringify({ ...payload, id: nextId }),
          // Свіжий ключ, бо старий уже зайнятий цим самим рядком, а
          // `idempotency_key` під UNIQUE-індексом.
          `anonrekey_${crypto.randomUUID()}`,
          candidate.id,
        ],
      );
      repaired += 1;
    }
    if (repaired > 0) notifyOutboxEnqueued();
    return repaired;
  } catch {
    return 0;
  }
}

async function idempotencyKey(
  batchId: string,
  targetUserId: string,
  item: SnapshotRow,
  effectiveRow: Readonly<Record<string, unknown>> = item.row,
): Promise<string> {
  const input = JSON.stringify([
    1,
    batchId,
    targetUserId,
    item.table,
    canonicalPrimaryKey(item, effectiveRow),
    item.clientTs,
    item.row["deleted_at"] == null ? "insert" : "delete",
  ]);
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  const hex = Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `anonv1_${hex.slice(0, 48)}`;
}

interface OutboxStateRow extends Record<string, unknown> {
  readonly id: number;
  readonly status: string;
  readonly reject_reason: string | null;
  /**
   * Далі — поля, потрібні рівно для двох речей: відрізнити вікно
   * backoff-у від справжнього застою ({@link flushUntilSettled}) і
   * назвати причину в помилці ({@link assertServerAcknowledged}).
   * Необовʼязкові в типі навмисно: тести підсовують мінімальний рядок,
   * і читач тут не має права впасти через відсутнє поле.
   */
  readonly table_name?: string;
  readonly op?: string;
  readonly attempts?: number;
  readonly next_retry_at?: string | null;
  readonly last_error?: string | null;
}

/**
 * Рядки черги, що ще НЕ доїхали. Успішно запушений рядок writer видаляє
 * (`markOutboxSuccess` → `DELETE`), а `lww_conflict` — це теж вирішений
 * стан: сервер має свіжішу версію, і наша копія програла чесно.
 */
async function readUnsettledOps(
  client: SqliteMigrationClient,
  keys: readonly string[],
): Promise<OutboxStateRow[]> {
  if (keys.length === 0) return [];
  const placeholders = keys.map(() => "?").join(", ");
  const rows = await client.all<OutboxStateRow>(
    `SELECT id, status, reject_reason, table_name, op,
            attempts, next_retry_at, last_error
       FROM sync_op_outbox
      WHERE idempotency_key IN (${placeholders})`,
    [...keys],
  );
  return rows;
}

function unsettledOf(rows: readonly OutboxStateRow[]): OutboxStateRow[] {
  return rows.filter(
    (row) => row.status !== "rejected" || row.reject_reason !== "lww_conflict",
  );
}

/**
 * Женемо чергу, доки в ній лишається бодай один НАШ рядок.
 *
 * AI-DANGER: один `flushNow()` — це РІВНО ОДИН тік push-лупа, а тік бере
 * з черги не все, а `LIMIT` (у `singleton.ts` — 100; SQL у
 * `db-schema/sqlite/syncOpOutboxDrain.ts`). Доти, доки тут стояв
 * одноразовий `flushNow()`, перенос будь-якого профілю з понад 100
 * анонімними рядками падав ДЕТЕРМІНОВАНО: перші 100 їхали на сервер,
 * решта лишалась `pending`, і `assertServerAcknowledged` нижче бачив їх
 * як непідтверджені. Користувач отримував «Не вдалося завершити
 * перенесення» на кожному «Повторити» — незалежно від мережі, бо
 * повторний прогін упирався в ту саму стелю батча (звіт власника
 * 2026-09-13: два скріншоти з різницею у пів години, обидва на LTE з
 * повним сигналом).
 *
 * Цикл завершується завжди: гонитва спиняється після
 * {@link FLUSH_STALL_TOLERANCE} поспіль тіків, які не зрушили жодного
 * рядка. Тобто зірвана мережа посеред переносу не крутить нас вічно — вона
 * віддає розбір `assertServerAcknowledged`, який кине помилку з реальною
 * причиною і числами.
 *
 * AI-DANGER: терпимість до «порожніх» тіків тут обовʼязкова, а не про
 * запас. `flushNow()` НЕ запускає новий тік, якщо один уже в польоті — він
 * віддає ту саму обіцянку (докстрінг `syncV2.pushScheduler`), а періодичний
 * writer тікає кожні ~30 с (`singleton.ts`). Отже наш виклик може
 * приєднатись до чужого тіку, який щойно вже вичерпав свою сотню ДО нашого
 * заміру, повернутись без жодного нового рядка — і одноразовий вихід
 * «не зрушило = здаємось» обірвав би перенос на живій мережі. На 1356
 * рядках черги (звіт власника 2026-09-14) це 14 тіків, тобто хвилини поруч
 * із періодичним, і шанс на такий збіг не теоретичний.
 */
const FLUSH_STALL_TOLERANCE = 3;

/** Стеля очікування на ОДНЕ вікно backoff-у. */
const FLUSH_BACKOFF_WAIT_CAP_MS = 5_000;

/**
 * Сумарний бюджет очікування backoff-ів на весь перенос. Вичерпався —
 * далі вікна знову рахуються застоєм, тобто цикл завершується завжди.
 */
const FLUSH_BACKOFF_BUDGET_MS = 30_000;

/**
 * Жорстка стеля тіків — гарантія завершення, а не робочий ліміт.
 *
 * Тік бере з черги `LIMIT 100`, тож 200 тіків покривають 20 000 рядків —
 * на порядок більше за все, що бачив пристрій власника (1356). Стеля
 * існує лише щоб цикл не міг крутитись вічно, якщо черга дренить, але
 * НАШ рядок чомусь так і не доходить.
 */
const FLUSH_MAX_TICKS = 200;

export interface FlushClock {
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * Скільки лишилось чекати, доки НАШІ рядки знову стануть придатні до
 * відправки, або `null`, якщо очікування тут ні до чого.
 *
 * AI-DANGER: `null` означає «це справжній застій», і повертати його
 * треба щоразу, коли є бодай один рядок, який drain міг би взяти просто
 * зараз — інакше ми б чекали на порожньому місці. Тому будь-який рядок
 * без `next_retry_at` у майбутньому одразу знімає очікування.
 *
 * Береться НАЙПІЗНІШИЙ строк, а не найраніший: тік drain-у забирає всі
 * дозрілі рядки разом, тож одне очікування до останнього строку дешевше
 * за ланцюжок пробуджень на кожен.
 */
function backoffDueInMs(
  rows: readonly OutboxStateRow[],
  now: number,
): number | null {
  let latest = 0;
  for (const row of rows) {
    if (row.status !== "pending") return null;
    const at = row.next_retry_at;
    if (typeof at !== "string") return null;
    const due = Date.parse(at);
    if (!Number.isFinite(due) || due <= now) return null;
    latest = Math.max(latest, due - now);
  }
  return latest > 0 ? latest : null;
}

/**
 * AI-DANGER: «наш рядок не зрушив» — це НЕ застій. Ні коли він чекає
 * свого строку, ні коли попереду черги стоять ЧУЖІ рядки.
 *
 * Звіт власника 2026-09-15 приніс `1/1 unsettled, first
 * fizruk_measurements/insert status=pending attempts=0` при
 * `vfs=opfs-sahpool`. Ключове тут `attempts=0`: рядок не просто не
 * доїхав — його ЖОДНОГО разу не віддали в push. Причина в порядку
 * черги. `drainSyncOpOutbox` бере `ORDER BY id ASC LIMIT 100`, а наш
 * рядок щойно вставлений, тобто має найбільший `id` і стоїть у самому
 * кінці. На пристрої власника попереду лежало 1356 недоставлених
 * операцій — це ~14 тіків, перш ніж черга взагалі дійде до нас.
 *
 * А цикл міряв поступ ТІЛЬКИ по своїх ключах. Тік відправляв сотню
 * чужих рядків — справжня робота, черга коротшала — але наше число
 * стояло, і три таких тіки вичерпували терпимість за секунди. Тобто
 * перенос падав саме тому, що синхронізація працювала.
 *
 * Це ТРЕТІЙ випадок однієї форми в цьому циклі, і варто назвати її
 * прямо: щоразу ламалось не відправлення, а **визначення поступу**.
 * Спершу поступом вважався один тік (стеля батча, 2026-09-13), потім
 * будь-який тік без зміни нашого числа (вікно backoff-у, стадія 2.1),
 * тепер — тік, що просуває чергу, але не нас. Правило, яке з цього
 * лишається: **поступ — це рух ЧЕРГИ, а застій — коли не рухається
 * ніщо.**
 *
 * Звіт власника 2026-09-15 приніс `1/1 unsettled, first status pending`
 * при `vfs=opfs-sahpool`, тобто вже після переїзду в OPFS і на одному
 * анонімному рядку — стеля батча з попередньої регресії тут ні до чого.
 * Розбір показав детермінований ланцюжок: перша невдала відправка кладе
 * рядку `attempts=1` і `next_retry_at = now + ~1 c`
 * (`planRetry`/`computeBackoffMs`), після чого drain його свідомо
 * пропускає, доки строк не настав. А цикл нижче крутив тіки ВПРИТУЛ, без
 * жодної паузи, тож три «порожні» тіки згорали за мілісекунди, і
 * `assertServerAcknowledged` бачив рядок недоставленим. Тобто ОДНА
 * транзиторна помилка мережі вбивала весь перенос, а «Повторити» падало
 * так само, бо `enqueueOutboxUpsert` віддає наявний рядок як є й
 * backoff-у не скидає.
 *
 * Тому тік, який не зрушив НАШИХ рядків, питає ще двічі: чи не
 * скоротилась черга загалом (тоді це поступ, просто не наш), і чи не
 * чекають усі наші рядки свого строку (тоді чекаємо разом із ними, до
 * {@link FLUSH_BACKOFF_BUDGET_MS} сумарно). Терпимість витрачається
 * лише на тіки, які не зрушили нічого й нічого не чекають.
 */
/**
 * Скільки рядків черги ще чекають відправки — УСІ, не лише наші.
 *
 * Потрібне рівно для того, щоб відрізнити «черга рухається, просто не до
 * нас» від справжнього застою. Рахуємо без фільтра по `user_id`: на цьому
 * етапі партиція вже перемкнута на цільового користувача, тож чужих
 * рядків у файлі немає, а зайвий параметр дав би ще одне місце розійтись
 * із тим, що бачить `drainSyncOpOutbox`.
 *
 * Ніколи не кидає: це вимірювач поступу, і зробити його новим шляхом
 * відмови в коді переносу було б гірше за втрачену точність. `null`-подібна
 * відповідь (нерозпізнана форма рядка) читається як «нуль», тобто як
 * відсутність поступу — консервативно.
 */
async function countPendingOps(client: SqliteMigrationClient): Promise<number> {
  try {
    const rows = await client.all<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sync_op_outbox WHERE status = 'pending'`,
      [],
    );
    const raw = rows[0]?.n;
    return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  } catch {
    return 0;
  }
}

async function flushUntilSettled(
  client: SqliteMigrationClient,
  writer: { flushNow: () => Promise<unknown> },
  keys: readonly string[],
  clock: FlushClock = {},
): Promise<void> {
  const now = clock.now ?? (() => Date.now());
  const sleep =
    clock.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let remaining = unsettledOf(await readUnsettledOps(client, keys)).length;
  let queued = await countPendingOps(client);
  let stalls = 0;
  let waitedMs = 0;
  let ticks = 0;
  while (
    remaining > 0 &&
    stalls < FLUSH_STALL_TOLERANCE &&
    ticks < FLUSH_MAX_TICKS
  ) {
    await writer.flushNow();
    ticks += 1;
    const rows = unsettledOf(await readUnsettledOps(client, keys));
    const next = rows.length;
    if (next < remaining) {
      remaining = next;
      stalls = 0;
      continue;
    }
    remaining = next;

    // Наші рядки не зрушили — але чи зрушила черга? Якщо так, попереду
    // просто стоять чужі операції, і треба дати їм проїхати.
    const queuedNow = await countPendingOps(client);
    const queueMoved = queuedNow < queued;
    queued = queuedNow;
    if (queueMoved) {
      stalls = 0;
      continue;
    }

    const dueIn = backoffDueInMs(rows, now());
    if (dueIn !== null && waitedMs < FLUSH_BACKOFF_BUDGET_MS) {
      // `+ 50` — щоб прокинутись ПІСЛЯ строку, а не рівно на ньому:
      // `next_retry_at <= now` у drain-і строгий, і пробудження секунда
      // в секунду коштувало б зайвий порожній тік.
      const wait = Math.min(
        dueIn + 50,
        FLUSH_BACKOFF_WAIT_CAP_MS,
        FLUSH_BACKOFF_BUDGET_MS - waitedMs,
      );
      waitedMs += wait;
      await sleep(wait);
      continue;
    }
    stalls += 1;
  }
}

/**
 * Один рядок черги словами — для помилки, яку власник побачить на екрані.
 *
 * AI-CONTEXT: доти тут стояв самий лише `status`, і звіт власника
 * 2026-09-15 приніс рівно `first status pending` — слово, яке не
 * розрізняє жодної з причин: рядок ще жодного разу не відправляли, він
 * чекає свого строку після невдачі, чи сервер відмовляє щоразу. Числа
 * нижче розводять ці випадки з одного скріншота: `attempts=0` — до
 * черги не дійшли (drain не взяв: не та сесія, не той `user_id`),
 * `attempts>0` разом із `last` — відправляли й отримали ось цю причину.
 *
 * Дані рядків сюди НЕ потрапляють — назва таблиці, вид операції, числа
 * і `last_error`, який за контрактом `planRetry` є короткою машинною
 * причиною (≤ 120 символів), а не тілом запису. Ріжемо все одно: екран
 * збою вузький, а діагноз має вміститись.
 */
function describeUnsettled(row: OutboxStateRow | undefined): string {
  if (!row) return "status unknown";
  const parts = [`${row.table_name ?? "?"}/${row.op ?? "?"}`];
  parts.push(`status=${row.status}`);
  if (typeof row.attempts === "number") parts.push(`attempts=${row.attempts}`);
  if (typeof row.next_retry_at === "string") {
    const due = Date.parse(row.next_retry_at);
    if (Number.isFinite(due))
      parts.push(`retryIn=${Math.round((due - Date.now()) / 1000)}s`);
  }
  if (typeof row.last_error === "string" && row.last_error.length > 0)
    parts.push(`last=${row.last_error.slice(0, 60)}`);
  return parts.join(" ");
}

async function assertServerAcknowledged(
  client: SqliteMigrationClient,
  keys: readonly string[],
): Promise<void> {
  if (keys.length === 0) return;
  const rows = await readUnsettledOps(client, keys);
  const unresolved = unsettledOf(rows);
  if (unresolved.length > 0)
    throw new AnonymousMigrationStepError(
      "confirm",
      `${unresolved.length}/${keys.length} unsettled, first ${describeUnsettled(unresolved[0])}`,
    );
  for (const row of rows) {
    await client.run(`DELETE FROM sync_op_outbox WHERE id = ?`, [row.id]);
  }
}

async function deleteSourceRows(
  client: SqliteMigrationClient,
  snapshot: readonly SnapshotRow[],
  batchId: string,
): Promise<void> {
  await client.run("BEGIN IMMEDIATE", []);
  try {
    for (const item of snapshot) {
      const where = item.primaryKey
        .map((column) => `${column} = ?`)
        .join(" AND ");
      await client.run(
        `DELETE FROM ${item.table} WHERE user_id = ? AND ${where}`,
        [
          LOCAL_ANON_USER_ID,
          ...item.primaryKey.map(
            (column) => item.row[column] as string | number,
          ),
        ],
      );
    }
    await client.run(
      `UPDATE anonymous_profile_migrations
          SET status = 'completed', completed_at = ?
        WHERE source_user_id = ? AND batch_id = ?`,
      [new Date().toISOString(), LOCAL_ANON_USER_ID, batchId],
    );
    await client.run("COMMIT", []);
  } catch (error) {
    await client.run("ROLLBACK", []);
    throw error;
  }
}

/**
 * Мітка кроку, на якому перенос упав.
 *
 * AI-CONTEXT: звіт власника 2026-09-13 прийшов трьома скріншотами одного
 * й того самого тексту «Не вдалося завершити перенесення» — і більше в нас
 * не було НІЧОГО. Жодне з одинадцяти місць, де ця функція кидає, не
 * називало себе, тож навіть із Sentry подія сказала б «щось впало». Тепер
 * кожна помилка звідси несе крок і, де це має сенс, таблицю — це і
 * потрапляє в Sentry, і показується на самому екрані збою, щоб наступний
 * скріншот уже містив діагноз.
 *
 * Дані рядків сюди НЕ потрапляють — лише назви кроків, таблиць і числа.
 */
export class AnonymousMigrationStepError extends Error {
  readonly step: string;
  /**
   * Сама причина, без службового префікса кроку й без діагностики сховища.
   *
   * AI-CONTEXT: рівно це показується на екрані збою, тоді як повний
   * `message` (з кроком і `[vfs=… disk=…]`) їде в Sentry. Розведено після
   * звіту власника 2026-09-21: у кадрі стояло
   * `anon-migration/pull-before: Забагато запитів… [vfs=kvvfs disk=14/10254MB]`,
   * де людині адресоване лише середнє речення. Групування подій у Sentry
   * тримається на `message`, тож звужувати ТАМ не можна — саме тому поля
   * два, а не одне.
   */
  readonly detail: string;
  constructor(step: string, cause: unknown, storage?: string) {
    const detail =
      cause instanceof Error ? cause.message : String(cause ?? "unknown");
    super(`anon-migration/${step}: ${detail}${storage ? ` [${storage}]` : ""}`);
    this.name = "AnonymousMigrationStepError";
    this.step = step;
    this.detail = detail;
    this.cause = cause;
  }
}

/**
 * Стан сховища одним рядком — для екрана збою і для Sentry.
 *
 * AI-CONTEXT: `SQLITE_IOERR` в sqlite один на ВСІ дискові біди, тож сам по
 * собі він не розрізняє переповнений SAH-пул, вичерпану квоту origin і
 * зайнятий іншим контекстом файл. Звіт власника 2026-09-14 приніс саме цю
 * помилку, і щоб не гадати втретє, наступний скріншот має принести числа,
 * якими ці випадки розводяться: заповненість пулу (`pool=зайнято/ємність`)
 * і використання сховища (`disk=використано/квота`).
 *
 * Ніколи не кидає і нічого не чекає довго: діагностика не має права стати
 * новим шляхом відмови в коді, який і так уже впав.
 */
async function describeStorage(): Promise<string | undefined> {
  const parts: string[] = [];
  try {
    const sqlite = await import("../db/sqlite.js");
    // VFS називаємо ПРЯМО. Доти тут був лише `pool=`, і його відсутність
    // доводилось тлумачити як «пул не встановився» — тлумачення виявилось
    // правильним (база жила в localStorage), але покладатись на відсутність
    // поля як на сигнал не можна.
    const vfs = sqlite.readActiveSqliteVfs();
    if (vfs) parts.push(`vfs=${vfs}`);
    const pool = sqlite.readSqliteStorageDiagnostics();
    if (pool) parts.push(`pool=${pool.fileCount}/${pool.capacity}`);
  } catch {
    // Пул міг не встановитись узагалі (kvvfs-фолбек) — тоді просто мовчимо.
  }
  try {
    const estimate = await navigator.storage?.estimate?.();
    const usage = estimate?.usage;
    const quota = estimate?.quota;
    if (typeof usage === "number" && typeof quota === "number") {
      const mb = (bytes: number) => Math.round(bytes / 1_048_576);
      parts.push(`disk=${mb(usage)}/${mb(quota)}MB`);
    }
  } catch {
    // `estimate()` недоступний або відхилений — не біда.
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

/** Run or resume the durable first-auth handoff. */
export async function migrateAnonymousDataToProfile(
  targetUserId: string,
  options: AnonymousMigrationOptions = {},
): Promise<AnonymousMigrationResult> {
  // `step` оновлюється перед кожною ділянкою, яка вміє впасти. Читає її
  // лише `catch` нижче, тож вартість — одне присвоєння на крок.
  const tracker = { step: "start" };
  try {
    return await runMigration(targetUserId, options, tracker);
  } catch (error) {
    const storage = await describeStorage();
    if (error instanceof AnonymousMigrationStepError) {
      throw new AnonymousMigrationStepError(error.step, error.cause, storage);
    }
    throw new AnonymousMigrationStepError(tracker.step, error, storage);
  }
}

async function runMigration(
  targetUserId: string,
  options: AnonymousMigrationOptions,
  tracker: { step: string },
): Promise<AnonymousMigrationResult> {
  if (!targetUserId) throw new Error("Target user id is required");
  tracker.step = "open-source-partition";
  const sqlite = await import("../db/sqlite.js");
  await sqlite.switchSqliteUser(null);
  const sourceClient = (await sqlite.getSqliteDb()).migrationClient();
  tracker.step = "migrate-source-schemas";
  await migrateModuleSchemas(sourceClient);
  tracker.step = "snapshot";
  const snapshot = await snapshotAnonymousRows(sourceClient);
  if (snapshot.length === 0) {
    await sqlite.switchSqliteUser(targetUserId);
    // Переносити нічого, але привиди від спроб ДО стадії 2.4 могли
    // лишитись — саме сюди потрапляє пристрій із уже завершеним переносом.
    await rekeyStuckOutboxRows(
      (await sqlite.getSqliteDb()).migrationClient(),
      targetUserId,
    );
    return { migratedRows: 0 };
  }
  options.onTransferStart?.();
  tracker.step = "claim";
  const claim = await getOrCreateClaim(sourceClient, targetUserId);

  tracker.step = "open-target-partition";
  await sqlite.switchSqliteUser(targetUserId);
  const targetClient = (await sqlite.getSqliteDb()).migrationClient();
  tracker.step = "migrate-target-schemas";
  await migrateModuleSchemas(targetClient);

  tracker.step = "boot-reader";
  const sync = await import("../syncEngine/singleton.js");
  const reader = await sync.bootSyncEngineReader();
  if (!reader)
    throw new AnonymousMigrationStepError("boot-reader", "no reader");
  tracker.step = "pull-before";
  await reader.pullOnce();

  tracker.step = "apply-local";
  const pushedKeys: string[] = [];
  for (const item of snapshot) {
    const row = {
      ...decodeJsonColumns(item.row),
      ...rekeySharedLocalIds(item, targetUserId),
      user_id: targetUserId,
    };
    const op: SyncV2PullOp = {
      id: 0,
      table: item.table,
      op: item.row["deleted_at"] == null ? "insert" : "delete",
      row,
      client_ts: item.clientTs,
      server_ts: item.clientTs,
      origin_device_id: null,
    };
    const outcome = await applyPullOp(
      targetClient,
      op,
      targetUserId,
      MIGRATION_ORIGIN_DEVICE_ID,
    );
    if (outcome === "rejected")
      throw new AnonymousMigrationStepError(
        "apply-rejected",
        `${item.table} (${op.op})`,
      );
    const key = await idempotencyKey(claim.batch_id, targetUserId, item, row);
    await enqueueOutboxUpsert(targetClient, {
      userId: targetUserId,
      table: item.table,
      op: op.op === "delete" ? "delete" : "insert",
      row,
      clientTs: item.clientTs,
      idempotencyKey: key,
    });
    pushedKeys.push(key);
  }

  tracker.step = "boot-writer";
  const writer = await sync.bootSyncEngineWriter();
  if (!writer)
    throw new AnonymousMigrationStepError("boot-writer", "no writer");
  tracker.step = "push";
  if (pushedKeys.length > 0)
    await flushUntilSettled(targetClient, writer, pushedKeys);
  tracker.step = "confirm";
  await assertServerAcknowledged(targetClient, pushedKeys);
  tracker.step = "pull-after";
  await reader.pullOnce();

  tracker.step = "cleanup";
  await sqlite.switchSqliteUser(null);
  const cleanupClient = (await sqlite.getSqliteDb()).migrationClient();
  await deleteSourceRows(cleanupClient, snapshot, claim.batch_id);
  await sqlite.switchSqliteUser(targetUserId);
  await rekeyStuckOutboxRows(
    (await sqlite.getSqliteDb()).migrationClient(),
    targetUserId,
  );
  return { migratedRows: snapshot.length };
}

/** Test-only seams for deterministic retry and acknowledgement invariants. */
export const __anonymousMigrationInternals = {
  assertServerAcknowledged,
  flushUntilSettled,
  decodeJsonColumns,
  getOrCreateClaim,
  idempotencyKey,
  rekeySharedLocalIds,
  rekeyStuckOutboxRows,
  resolveClientTs,
};
