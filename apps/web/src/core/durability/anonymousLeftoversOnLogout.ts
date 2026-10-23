/**
 * Last validated: 2026-10-23
 * Status: Active
 *
 * Анонімні рядки, що лишились на пристрої після незавершеного переносу
 * акаунта, який зараз виходить (аудит 2026-10-01, `data-46`; рішення
 * власника 2026-10-23, варіант «б»).
 *
 * AI-CONTEXT: перенос (`anonymousDataMigration.ts`) ставить claim
 * `pending` за акаунтом A і стирає анонімні рядки лише після того, як сервер
 * підтвердив кожен. Упав посередині (найчастіше `pull-before` чи `push`), і
 * A вийшов — раніше вихід стирав тільки партицію A, а анонімні рядки й claim
 * A лишались на пристрої до повернення A. Тепер вихід A показує ці рядки в
 * діалозі «є незбережені записи» (разом із чергою синку) і стирає їх разом
 * із claim лише після явного «Все одно вийти»; якщо втрачати нічого, стирає
 * без діалогу. «Залишитись» = вихід не відбувається.
 *
 * Чужий claim (перенос іншого акаунта, `target_user_id !== A`) і рядки без
 * claim цей модуль не чіпає: вони не належать акаунту, що виходить.
 *
 * Модуль імпортується з eager-ланцюжка `AuthContext`, тож sqlite-wasm,
 * db-schema і `applyPullOp` тягнуться лише динамічно (`sqlite.lazy.test.ts`).
 */
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { logger } from "@shared/lib";

import { LOCAL_ANON_USER_ID } from "../auth/localIdentity.js";
import {
  BENIGN_REJECT_REASONS,
  getSyncEngineReader,
} from "../syncEngine/singleton.js";
import { isSyncableUserId } from "../syncEngine/syncableUserId.js";

/** Що лишилось від незавершеного переносу акаунта, який виходить. */
export interface AnonymousLeftovers {
  /** Акаунт, за яким стоїть незавершений claim (той, що виходить). */
  readonly userId: string;
  /** Анонімні рядки в таблицях переносу: їхня єдина копія на пристрої. */
  readonly rows: number;
  /**
   * Скільки з недоставлених записів черги синку A — копії саме цих рядків
   * (перенос встиг поставити їх у чергу, ключ `anonv1_…`). Діалог віднімає їх
   * від лічильника черги, щоб один запис не рахувався двічі.
   */
  readonly queuedCopies: number;
}

/** Префікс idempotency-ключа, яким перенос ставить рядки в чергу A. */
const MIGRATION_KEY_PREFIX = "anonv1_";

type HandoffState = "running" | "settled";
const handoffByUser = new Map<string, HandoffState>();

/**
 * Провайдер переносу повідомляє про прогін для `userId`.
 *
 * Поки прогін іде, вихід анонімну партицію не чіпає: перенос сам перемикає
 * партиції, і друге перемикання посеред нього зламало б обидва. Після успіху
 * (перенос завершено, переносити нічого або claim чужий) анонімних рядків
 * за цим акаунтом немає, і вихід не платить за зайве перемикання партиції.
 * Збій прогону знімає позначку: тоді вихід мусить подивитись сам.
 */
export function trackAnonymousHandoff(
  userId: string,
  run: Promise<unknown>,
): void {
  handoffByUser.set(userId, "running");
  run.then(
    () => handoffByUser.set(userId, "settled"),
    () => handoffByUser.delete(userId),
  );
}

export function __resetAnonymousLeftoversForTests(): void {
  handoffByUser.clear();
}

interface ClaimRow extends Record<string, unknown> {
  readonly target_user_id: string;
  readonly status: string;
}

type Client = SqliteMigrationClient;

function toCount(value: unknown): number {
  // Hard Rule #1: bigint → number з перевіркою.
  const count = Number(value ?? 0);
  if (!Number.isSafeInteger(count) || count < 0)
    throw new Error(`anonymousLeftovers: bad count ${String(value)}`);
  return count;
}

async function tableExists(client: Client, table: string): Promise<boolean> {
  const rows = await client.all<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [table],
  );
  return rows.length > 0;
}

/** Незавершений claim анонімної партиції за `userId`, якщо він є. */
async function hasPendingClaimFor(
  client: Client,
  userId: string,
): Promise<boolean> {
  if (!(await tableExists(client, "anonymous_profile_migrations")))
    return false;
  const claims = await client.all<ClaimRow>(
    `SELECT target_user_id, status FROM anonymous_profile_migrations
      WHERE source_user_id = ?`,
    [LOCAL_ANON_USER_ID],
  );
  const claim = claims[0];
  return (
    claim !== undefined &&
    claim.target_user_id === userId &&
    claim.status !== "completed"
  );
}

async function migrationTables(client: Client): Promise<string[]> {
  const { CLIENT_PULL_SUPPORTED_TABLES } =
    await import("../syncEngine/applyPullOp.js");
  const present: string[] = [];
  for (const table of CLIENT_PULL_SUPPORTED_TABLES) {
    if (await tableExists(client, table)) present.push(table);
  }
  return present;
}

async function countAnonymousRows(client: Client): Promise<number> {
  let total = 0;
  for (const table of await migrationTables(client)) {
    const rows = await client.all<{ count: number | bigint }>(
      `SELECT COUNT(*) AS count FROM ${table} WHERE user_id = ?`,
      [LOCAL_ANON_USER_ID],
    );
    total += toCount(rows[0]?.count);
  }
  return total;
}

/** Ті самі статуси, що рахує `countUnsyncedOutboxForUser`, лише копії переносу. */
async function countQueuedCopies(
  client: Client,
  userId: string,
): Promise<number> {
  if (!(await tableExists(client, "sync_op_outbox"))) return 0;
  const benign = [...BENIGN_REJECT_REASONS];
  const rows = await client.all<{ count: number | bigint }>(
    `SELECT COUNT(*) AS count FROM sync_op_outbox
      WHERE user_id = ? AND idempotency_key LIKE ?
        AND (
          status IN ('pending', 'dead_letter')
          OR (status = 'rejected' AND (reject_reason IS NULL OR reject_reason NOT IN (${benign.map(() => "?").join(", ")})))
        )`,
    [userId, `${MIGRATION_KEY_PREFIX}%`, ...benign],
  );
  return toCount(rows[0]?.count);
}

/**
 * Дивиться, чи лишились анонімні рядки за незавершеним claim акаунта, що
 * зараз активний у SQLite. Викликається з `logout()` ДО діалогу.
 *
 * `null` — нічого стирати не треба або перевірити не вдалось. Друге навмисно
 * трактується як «не чіпати»: тоді вихід поводиться як до `data-46` (рядки й
 * claim лишаються), бо стерти не порахувавши означало б мовчазну втрату.
 *
 * AI-DANGER: на час перевірки активна партиція SQLite перемикається на
 * анонімну й назад. Runtime синку резолвить клієнта на кожному тіку, тож
 * pull, що вклинився в це вікно, писав би рядки A в анонімний файл. Тому
 * перед перемиканням reader ставиться на паузу ({@link pauseSyncReader}):
 * pull, що вже йде, дописує у партицію A, а нові не стартують, доки
 * партицію не повернуто. Відкривається вікно лише в сесії, де перенос для A
 * не завершився (див. {@link trackAnonymousHandoff}).
 */
export async function inspectAnonymousLeftoversOnLogout(): Promise<AnonymousLeftovers | null> {
  let sqlite: typeof import("../db/sqlite") | null = null;
  let userId: string | null = null;
  let switched = false;
  let resume: (() => void) | null = null;
  try {
    sqlite = await import("../db/sqlite");
    userId = sqlite.readActiveSqliteUserId();
    if (userId === null || !isSyncableUserId(userId)) return null;
    if (handoffByUser.has(userId)) return null;

    const ownClient = (await sqlite.getSqliteDb()).migrationClient();
    const queuedCopies = await countQueuedCopies(ownClient, userId);

    resume = await pauseSyncReader();
    switched = true;
    await sqlite.switchSqliteUser(null);
    const anonClient = (await sqlite.getSqliteDb()).migrationClient();
    if (!(await hasPendingClaimFor(anonClient, userId))) return null;
    const rows = await countAnonymousRows(anonClient);
    return { userId, rows, queuedCopies };
  } catch {
    return null;
  } finally {
    if (sqlite && userId !== null && switched) {
      // Назад у партицію A: діалог може закінчитись «Залишитись», і тоді
      // сесія продовжується саме в ній. Збій тут уже нічого не змінить.
      await sqlite.switchSqliteUser(userId).catch(() => undefined);
    }
    // Лише ПІСЛЯ повернення партиції: pull, що чекав, піде вже в партицію A.
    resume?.();
  }
}

/**
 * Пауза reader-а синку на час перемикання партиції. Reader-а може не бути
 * (вкладка-послідовник, синк ще не піднявся) — тоді й писати нікому.
 */
async function pauseSyncReader(): Promise<() => void> {
  const reader = getSyncEngineReader();
  return reader ? reader.pause() : () => {};
}

/**
 * Стирає анонімні рядки й незавершений claim акаунта, що виходить. Лише
 * після {@link inspectAnonymousLeftoversOnLogout}, що їх порахувала, і після
 * згоди людини (або коли втрачати нічого). Викликається з `logout()` після
 * стирання партиції A, коли активна вже анонімна.
 *
 * Перед стиранням ще раз звіряє claim: якщо між перевіркою й цим кроком він
 * перестав бути незавершеним claim цього акаунта, нічого не чіпає. Ніколи не
 * кидає: вихід уже за точкою неповернення.
 */
export async function discardAnonymousLeftoversOnLogout(
  leftovers: AnonymousLeftovers,
): Promise<boolean> {
  try {
    const sqlite = await import("../db/sqlite");
    await sqlite.switchSqliteUser(null);
    const client = (await sqlite.getSqliteDb()).migrationClient();
    if (!(await hasPendingClaimFor(client, leftovers.userId))) return false;
    const tables = await migrationTables(client);
    await client.run("BEGIN", []);
    try {
      for (const table of tables) {
        await client.run(`DELETE FROM ${table} WHERE user_id = ?`, [
          LOCAL_ANON_USER_ID,
        ]);
      }
      await client.run(
        `DELETE FROM anonymous_profile_migrations
          WHERE source_user_id = ? AND target_user_id = ?
            AND status <> 'completed'`,
        [LOCAL_ANON_USER_ID, leftovers.userId],
      );
      await client.run("COMMIT", []);
    } catch (error) {
      await client.run("ROLLBACK", []);
      throw error;
    }
    return true;
  } catch (err) {
    logger.warn("[auth.logout] anonymous leftovers discard failed", err);
    return false;
  }
}

/**
 * Скільки записів зникне з виходом: недоставлена черга A плюс анонімні
 * рядки, мінус копії тих самих рядків, які перенос уже поставив у чергу.
 */
export function countLogoutLoss(
  queued: number,
  leftovers: AnonymousLeftovers | null,
): number {
  if (!leftovers) return queued;
  return queued - Math.min(leftovers.queuedCopies, queued) + leftovers.rows;
}
