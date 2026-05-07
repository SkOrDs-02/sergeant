import type { SqliteMigrationClient } from "../migrate/adapters/sqlite.js";

/**
 * Idempotent recovery helper for the routine-module client SQLite
 * outbox.
 *
 * Why this exists: `002_sync_op_outbox_retry.sql` rebuilds the
 * outbox via the standard SQLite "12-step ALTER" recipe —
 * `RENAME → CREATE → INSERT SELECT → DROP legacy`. The runner wraps
 * each migration in BEGIN/COMMIT so a mid-flight failure should
 * roll back atomically and leave the original table intact. In
 * practice (`docs/audits/2026-05-07-app-audit.md` §A1) some
 * sqlite-wasm OPFS clients ended up stuck in a corrupted post-002
 * state: `sync_op_outbox_legacy` left behind and no live
 * `sync_op_outbox` table. Re-running 002 from that shape blows up
 * deterministically on its first ALTER (RENAME on a table that no
 * longer exists), and any subsequent `SELECT … FROM sync_op_outbox`
 * — most visibly the periodic sync-engine drain — surfaces
 * `SQLITE_ERROR: no such table: sync_op_outbox` to Sentry
 * (SERGEANT-WEB-A / -5..-9).
 *
 * The same pattern can happen on `003_sync_op_outbox_increment_op.sql`
 * which uses the identical RENAME recipe; the helper recovers from
 * either failure shape because the post-failure on-disk layout is
 * indistinguishable.
 *
 * Strategy: detect the corrupted shape (no `sync_op_outbox`,
 * `sync_op_outbox_legacy` present), restore the legacy table back
 * to its original name, and clear the 002/003 entries from the
 * `__migrations` ledger so the next `runMigrations` call re-applies
 * them on top of the recovered shape rather than skipping them as
 * "already applied".
 *
 * Idempotent on every other layout. A fresh DB (no
 * `sync_op_outbox_legacy`, no `sync_op_outbox`) and a healthy DB
 * (`sync_op_outbox` present) both short-circuit without writing
 * anything, so the helper is safe to call unconditionally on every
 * boot.
 */

export interface RepairOutboxResult {
  /**
   * `true` when the helper detected a corrupted post-002 shape and
   * restored `sync_op_outbox_legacy` back to `sync_op_outbox`. The
   * caller should follow up with `runMigrations(...,
   * ROUTINE_CLIENT_MIGRATIONS)` so 002 (and 003) re-apply on the
   * recovered table.
   */
  readonly recovered: boolean;
}

export interface RepairPartialOutboxMigrationOptions {
  /**
   * Ledger table the runner uses to record applied migrations.
   * Defaults to `__migrations`, matching
   * {@link "./migrations/index.js"#ROUTINE_MIGRATIONS_TABLE}. The
   * value is validated against `[A-Za-z_][A-Za-z0-9_]*` and
   * double-quoted in the emitted SQL — same shape as the runner's
   * own `validateTableName`.
   */
  readonly ledgerTable?: string;
}

const LEDGER_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Inspect the SQLite schema for the post-002 corrupted shape and
 * restore it if found. See module docstring for the detection
 * rationale and ledger semantics.
 */
export async function repairPartialOutboxMigration(
  client: SqliteMigrationClient,
  options: RepairPartialOutboxMigrationOptions = {},
): Promise<RepairOutboxResult> {
  const ledgerTable = options.ledgerTable ?? "__migrations";
  if (!LEDGER_NAME_RE.test(ledgerTable)) {
    throw new Error(
      `Invalid ledger table name: "${ledgerTable}". ` +
        "Must match /^[A-Za-z_][A-Za-z0-9_]*$/.",
    );
  }

  const tables = await client.all<{ name: string }>(
    `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name IN ('sync_op_outbox', 'sync_op_outbox_legacy', ?)`,
    [ledgerTable],
  );
  const present = new Set(tables.map((r) => r.name));

  // Healthy DB or fresh DB → nothing to do. The helper deliberately
  // leaves the ledger alone in both cases so it does not race a
  // concurrent runner that is about to insert 001/002/003 rows.
  if (present.has("sync_op_outbox") || !present.has("sync_op_outbox_legacy")) {
    return { recovered: false };
  }

  await client.exec(
    `ALTER TABLE sync_op_outbox_legacy RENAME TO sync_op_outbox`,
  );

  // The ledger only exists once any migration has been recorded, so
  // a brand-new DB that somehow hit the legacy-only state would not
  // have one — guard the DELETE accordingly. In the recoverable
  // case 001 is always already recorded (002 cannot have run
  // without 001), so the ledger is present in practice.
  if (present.has(ledgerTable)) {
    await client.run(
      `DELETE FROM "${ledgerTable.replace(/"/g, '""')}"
         WHERE name IN (?, ?)`,
      ["002_sync_op_outbox_retry.sql", "003_sync_op_outbox_increment_op.sql"],
    );
  }

  return { recovered: true };
}
