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
      throw new AnonymousMigrationStepError("claim-bound-elsewhere", "");
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

function canonicalPrimaryKey(item: SnapshotRow): string {
  return JSON.stringify(
    item.primaryKey.map((column) => [column, item.row[column]]),
  );
}

async function idempotencyKey(
  batchId: string,
  targetUserId: string,
  item: SnapshotRow,
): Promise<string> {
  const input = JSON.stringify([
    1,
    batchId,
    targetUserId,
    item.table,
    canonicalPrimaryKey(item),
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
    `SELECT id, status, reject_reason
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

async function flushUntilSettled(
  client: SqliteMigrationClient,
  writer: { flushNow: () => Promise<unknown> },
  keys: readonly string[],
): Promise<void> {
  let remaining = unsettledOf(await readUnsettledOps(client, keys)).length;
  let stalls = 0;
  while (remaining > 0 && stalls < FLUSH_STALL_TOLERANCE) {
    await writer.flushNow();
    const next = unsettledOf(await readUnsettledOps(client, keys)).length;
    stalls = next >= remaining ? stalls + 1 : 0;
    remaining = next;
  }
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
      `${unresolved.length}/${keys.length} unsettled, first status ${unresolved[0]?.status ?? "unknown"}`,
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
  constructor(step: string, cause: unknown, storage?: string) {
    const detail =
      cause instanceof Error ? cause.message : String(cause ?? "unknown");
    super(`anon-migration/${step}: ${detail}${storage ? ` [${storage}]` : ""}`);
    this.name = "AnonymousMigrationStepError";
    this.step = step;
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
    const row = { ...decodeJsonColumns(item.row), user_id: targetUserId };
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
    const key = await idempotencyKey(claim.batch_id, targetUserId, item);
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
  return { migratedRows: snapshot.length };
}

/** Test-only seams for deterministic retry and acknowledgement invariants. */
export const __anonymousMigrationInternals = {
  assertServerAcknowledged,
  flushUntilSettled,
  decodeJsonColumns,
  idempotencyKey,
  resolveClientTs,
};
