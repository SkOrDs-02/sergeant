/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Відновлення локальної копії зі знімка сервера, коли журнал змін уже
 * обрізаний (`410 sync_cursor_expired`, ADR-0105 §3). Спека:
 * `docs/work/specs/sync-snapshot-client-bootstrap.md`.
 *
 * Знімок (`GET /api/v2/sync/snapshot`) — поточні рядки модульних
 * sync-таблиць як pull-оп-и `insert` (tombstone-и включно, `origin = null`).
 * Їх застосовує той самий `applyPullOp` (LWW, строге `>`), а потім синк-таблиці
 * ЦЬОГО користувача ЗВОДЯТЬСЯ до стану сервера: локальні рядки, яких у знімку
 * немає, видаляються (рішення власника 2026-11-19 «привести до стану
 * сервера»). Без зведення видалення, зроблене на іншому пристрої понад вікно
 * журналу тому, сюди вже не доїхало б, і рядок жив би вічно.
 *
 * Запобіжники (кожен — з рішень спеки):
 *   - старт лише з порожньою чергою `pending`: знімок, знятий до доставки
 *     локальної правки, інакше перебив би її (`postponed`, наступний тік);
 *   - рядок із записом у `sync_op_outbox` БУДЬ-якого статусу при зведенні не
 *     видаляється: сервер його не має, а людина ще може відновити;
 *   - таблиця, локальний первинний ключ якої не знайшовся в рядках знімка або
 *     в черзі, у зведенні не бере участі зовсім (не вгадуємо);
 *   - зведення — лише після повного проходу всіх сторінок; обрив посеред
 *     означає новий знімок із першої сторінки на наступному тіку.
 */
import type {
  SyncV2PullOp,
  SyncV2SnapshotOptions,
  SyncV2SnapshotResponse,
} from "@sergeant/api-client";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { SYNC_V2_PULL_MAX_LIMIT } from "@sergeant/shared";

import { applyPullOp, CLIENT_PULL_SUPPORTED_TABLES } from "./applyPullOp.js";
import {
  hasPendingOutbox,
  markReplicaBootstrapDone,
} from "./replicaBootstrap.js";
import { setSnapshotRestoring } from "./snapshotRestoreState.js";
import { writePullSinceCursor } from "./syncOpCursor.js";
import { markTxNotesBackfillDone } from "./txNotesBackfill.js";

/** Значення `localDeviceId` для `applyPullOp`: оп-и знімка мають `origin = null`. */
const SNAPSHOT_LOCAL_DEVICE = "snapshot-restore";

export interface SnapshotRestoreDeps {
  readonly client: SqliteMigrationClient;
  readonly userId: string;
  /** Одна сторінка знімка (з повтором на рейт-ліміт — справа викликача). */
  readonly fetchSnapshot: (
    opts: SyncV2SnapshotOptions,
  ) => Promise<SyncV2SnapshotResponse>;
  /** Отруйний рядок (порушення CHECK/FK) не має зупиняти відновлення. */
  readonly isConstraintFailure: (error: unknown) => boolean;
  readonly onRejected?: (op: SyncV2PullOp, error: unknown) => void;
  readonly limit?: number;
}

export type SnapshotRestoreResult =
  | { readonly status: "postponed" }
  | {
      readonly status: "restored";
      readonly asOfOpId: number;
      readonly applied: number;
      readonly rejected: number;
      readonly removed: number;
      readonly affectedTables: ReadonlySet<string>;
    };

/** Локальні колонки первинного ключа таблиці; `null` — таблиці немає. */
async function localPrimaryKey(
  client: SqliteMigrationClient,
  table: string,
): Promise<{ pk: string[]; hasUserId: boolean } | null> {
  try {
    const cols = await client.all<{ name: string; pk: number }>(
      `PRAGMA table_info(${table})`,
    );
    if (cols.length === 0) return null;
    const pk = cols
      .filter((c) => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((c) => c.name);
    return { pk, hasUserId: cols.some((c) => c.name === "user_id") };
  } catch {
    return null;
  }
}

/** Ключ рядка за локальним PK; `null` — у рядку бракує колонки ключа. */
function rowKey(
  pk: readonly string[],
  row: Record<string, unknown>,
): string | null {
  const parts: string[] = [];
  for (const col of pk) {
    const value = row[col];
    if (value === undefined || value === null) return null;
    parts.push(String(value));
  }
  return JSON.stringify(parts);
}

/**
 * Відновити копію зі знімка. Не скидає позначку «триває» в UI при помилці:
 * `finally` гасить її завжди.
 */
export async function restoreFromSnapshot(
  deps: SnapshotRestoreDeps,
): Promise<SnapshotRestoreResult> {
  const { client, userId } = deps;
  if (await hasPendingOutbox(client, userId)) return { status: "postponed" };

  setSnapshotRestoring(true);
  try {
    const tables = [...CLIENT_PULL_SUPPORTED_TABLES];
    const pkByTable = new Map<
      string,
      { pk: string[]; hasUserId: boolean } | null
    >();
    for (const table of tables) {
      pkByTable.set(table, await localPrimaryKey(client, table));
    }

    // Таблиці, які зводити НЕ можна: немає локальної таблиці, немає PK або
    // рядок знімка/черги без колонки ключа.
    const unsweepable = new Set<string>();
    for (const [table, info] of pkByTable) {
      if (!info || info.pk.length === 0) unsweepable.add(table);
    }
    const seen = new Set<string>();
    const affectedTables = new Set<string>();
    let applied = 0;
    let rejected = 0;

    const limit = deps.limit ?? SYNC_V2_PULL_MAX_LIMIT;
    let page = await deps.fetchSnapshot({ limit });
    const asOfOpId = page.as_of_op_id;
    for (;;) {
      for (const op of page.ops) {
        const info = pkByTable.get(op.table);
        if (info && info.pk.length > 0) {
          const key = rowKey(info.pk, op.row);
          if (key === null) unsweepable.add(op.table);
          else seen.add(`${op.table}\u0000${key}`);
        }
        try {
          const outcome = await applyPullOp(
            client,
            op,
            userId,
            SNAPSHOT_LOCAL_DEVICE,
          );
          if (outcome === "applied") {
            applied += 1;
            affectedTables.add(op.table);
          } else if (outcome === "rejected") {
            rejected += 1;
          }
        } catch (error) {
          if (!deps.isConstraintFailure(error)) throw error;
          rejected += 1;
          deps.onRejected?.(op, error);
        }
      }
      if (page.next_cursor === null) break;
      page = await deps.fetchSnapshot({
        cursor: page.next_cursor,
        asOfOpId,
        limit,
      });
    }

    // Захищене чергою: локальні правки, яких сервер не має (будь-який статус).
    const protectedKeys = new Set<string>();
    try {
      const queued = await client.all<{ table_name: string; row: string }>(
        `SELECT table_name, row FROM sync_op_outbox WHERE user_id = ?`,
        [userId],
      );
      for (const entry of queued) {
        const info = pkByTable.get(entry.table_name);
        if (!info || info.pk.length === 0) continue;
        let row: Record<string, unknown> | null = null;
        try {
          row = JSON.parse(entry.row) as Record<string, unknown>;
        } catch {
          row = null;
        }
        const key = row ? rowKey(info.pk, row) : null;
        if (key === null) unsweepable.add(entry.table_name);
        else protectedKeys.add(`${entry.table_name}\u0000${key}`);
      }
    } catch {
      // Черги в розділі немає: захищати нічого.
    }

    let removed = 0;
    for (const table of tables) {
      if (unsweepable.has(table)) continue;
      const info = pkByTable.get(table);
      if (!info) continue;
      const cols = info.pk.join(", ");
      const scope = info.hasUserId ? ` WHERE user_id = ?` : "";
      const rows = await client.all<Record<string, unknown>>(
        `SELECT ${cols} FROM ${table}${scope}`,
        info.hasUserId ? [userId] : [],
      );
      for (const row of rows) {
        const key = rowKey(info.pk, row);
        if (key === null) continue;
        const id = `${table}\u0000${key}`;
        if (seen.has(id) || protectedKeys.has(id)) continue;
        const where = info.pk.map((c) => `${c} = ?`).join(" AND ");
        await client.run(
          `DELETE FROM ${table} WHERE ${where}${info.hasUserId ? " AND user_id = ?" : ""}`,
          [...info.pk.map((c) => row[c]), ...(info.hasUserId ? [userId] : [])],
        );
        removed += 1;
        affectedTables.add(table);
      }
    }

    await writePullSinceCursor(client, userId, asOfOpId);
    await markReplicaBootstrapDone(client, userId);
    await markTxNotesBackfillDone(client, userId);

    return {
      status: "restored",
      asOfOpId,
      applied,
      rejected,
      removed,
      affectedTables,
    };
  } finally {
    setSnapshotRestoring(false);
  }
}
