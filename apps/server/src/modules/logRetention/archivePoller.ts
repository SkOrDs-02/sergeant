/**
 * Log-retention archive poller.
 *
 * Periodically streams rows older than `LOG_RETENTION_DAYS` from the
 * three audit tables to GCS as gzipped JSONL, then DELETE-s them.
 *
 * Tables covered (intentionally hard-coded — adding a new table to this
 * list requires a code review touching the archive contract):
 *
 *   - `openclaw_invocations`  (audit-trail for OpenClaw agent calls)
 *   - `tg_alert_acks`         (Telegram alert ACK history, ADR-0038 §1)
 *   - `n8n_webhook_events`    (n8n webhook replay history, PR-28)
 *
 * Design notes:
 *
 *   - **Opt-in.** Off by default (`LOG_ARCHIVE_ENABLED=false`). Existing
 *     `WebhookEventsRetentionPoller` keeps owning `n8n_webhook_events`
 *     deletion when archive is disabled; when both are enabled, they're
 *     idempotent (both filter on the same timestamp predicate; the
 *     archiver wins the race for any given row, the other tick deletes
 *     zero).
 *
 *   - **Fail-closed on archive errors.** If the GCS upload fails (bucket
 *     misconfigured / network glitch / quota exceeded), we log a Sentry
 *     warning and SKIP the DELETE for that batch. Data stays in DB
 *     until the next tick succeeds. Audit log loss is worse than DB
 *     bloat.
 *
 *   - **Idempotent batches.** Each batch is `LIMIT N` ordered by primary
 *     key — re-running a failed tick processes the same rows. GCS
 *     object names include batch start / end IDs so a re-tick after
 *     partial failure may upload duplicates (cheaper than tracking
 *     in-DB checkpoints).
 *
 *   - **In-process, hourly tick.** Same pattern as
 *     `WebhookEventsRetentionPoller` — no BullMQ queue, no external
 *     scheduler dependency, restarts cleanly. Hourly granularity is
 *     overkill for daily retention but gives operators a fast feedback
 *     loop ("did the cron run? did it archive anything?").
 *
 *   - **Bounded batch size.** Each tick processes at most
 *     `LOG_ARCHIVE_BATCH_SIZE` rows per table (default 1000). Long
 *     archival backlog drains over multiple ticks rather than blocking
 *     the event loop with a single huge query.
 */

import { gzipSync } from "node:zlib";

import type { Pool } from "pg";

import { logger } from "../../obs/logger.js";
import { logArchiveRowsTotal } from "../../obs/metrics.js";
import { Sentry } from "../../sentry.js";

import {
  defaultGetAccessToken,
  uploadGzippedJsonl,
  type GcsUploadDeps,
} from "./gcsUpload.js";

/**
 * Table descriptor. The timestamp column is per-table — `openclaw_invocations`
 * uses `invoked_at`, `tg_alert_acks` uses `posted_at`, `n8n_webhook_events`
 * uses `received_at`.
 */
export interface ArchiveTableSpec {
  table: string;
  timestampColumn: string;
}

export const DEFAULT_ARCHIVE_TABLES: readonly ArchiveTableSpec[] = [
  { table: "openclaw_invocations", timestampColumn: "invoked_at" },
  { table: "tg_alert_acks", timestampColumn: "posted_at" },
  { table: "n8n_webhook_events", timestampColumn: "received_at" },
] as const;

export interface LogArchivePollerOptions {
  pool: Pool;
  /** Days to keep rows in the live DB before archiving. */
  retentionDays: number;
  /** Tick interval in ms. Default 1 h; `0` disables the poller. */
  intervalMs?: number;
  /** Rows per batch per table per tick. Default 1000. */
  batchSize?: number;
  /** GCS bucket name (e.g. `sergeant-log-archive`). Empty disables uploads. */
  bucket: string;
  /** Master switch — when `false`, the poller is a no-op. */
  enabled: boolean;
  /**
   * Subset of tables to archive. Override is mostly for tests; production
   * uses `DEFAULT_ARCHIVE_TABLES`.
   */
  tables?: readonly ArchiveTableSpec[];
  /** GCS upload deps (auth + fetch). Defaults wire production GCP auth. */
  gcsDeps?: Partial<GcsUploadDeps>;
  /** Inject a clock for deterministic object-name dates in tests. */
  now?: () => Date;
}

export interface ArchiveTickResult {
  /** Rows successfully archived + deleted, per table. */
  archived: Record<string, number>;
  /** Rows that failed archival (kept in DB), per table. */
  failed: Record<string, number>;
}

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 1000;

export class LogArchivePoller {
  private readonly pool: Pool;
  private readonly retentionDays: number;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private readonly bucket: string;
  private readonly enabled: boolean;
  private readonly tables: readonly ArchiveTableSpec[];
  private readonly gcsDeps: GcsUploadDeps;
  private readonly now: () => Date;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;

  constructor(options: LogArchivePollerOptions) {
    this.pool = options.pool;
    this.retentionDays = options.retentionDays;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.bucket = options.bucket;
    this.enabled = options.enabled;
    this.tables = options.tables ?? DEFAULT_ARCHIVE_TABLES;
    const fetchOverride = options.gcsDeps?.fetchImpl;
    this.gcsDeps = {
      getAccessToken: options.gcsDeps?.getAccessToken ?? defaultGetAccessToken,
      ...(fetchOverride ? { fetchImpl: fetchOverride } : {}),
    };
    this.now = options.now ?? (() => new Date());
  }

  start(): void {
    if (this.timer) return;
    if (!this.enabled) {
      logger.info({
        msg: "log_archive_poller_disabled",
        reason: "feature_flag_off",
      });
      return;
    }
    if (this.intervalMs <= 0 || this.retentionDays <= 0) {
      logger.info({
        msg: "log_archive_poller_disabled",
        reason: this.intervalMs <= 0 ? "interval_zero" : "retention_zero",
        retentionDays: this.retentionDays,
        intervalMs: this.intervalMs,
      });
      return;
    }
    if (!this.bucket) {
      logger.warn({
        msg: "log_archive_poller_disabled",
        reason: "bucket_unset",
      });
      return;
    }
    logger.info({
      msg: "log_archive_poller_started",
      retentionDays: this.retentionDays,
      intervalMs: this.intervalMs,
      batchSize: this.batchSize,
      bucket: this.bucket,
      tables: this.tables.map((t) => t.table),
    });
    this.timer = setInterval(() => {
      void this.runOnce().catch((err: unknown) => {
        logger.error({
          msg: "log_archive_tick_failed",
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }, this.intervalMs);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    while (this.running) {
      await new Promise((r) => setTimeout(r, 20));
    }
    this.stopping = false;
    logger.info({ msg: "log_archive_poller_stopped" });
  }

  /**
   * Run a single archive pass over all tables. Public for tests +
   * admin-trigger endpoints. Returns per-table counts so callers can
   * surface "nothing to do" vs "made progress" without parsing logs.
   */
  async runOnce(): Promise<ArchiveTickResult> {
    const result: ArchiveTickResult = { archived: {}, failed: {} };
    if (!this.enabled || this.running || this.stopping) return result;
    if (this.retentionDays <= 0 || !this.bucket) return result;
    this.running = true;
    try {
      for (const spec of this.tables) {
        const tableResult = await this.archiveTable(spec);
        result.archived[spec.table] = tableResult.archived;
        result.failed[spec.table] = tableResult.failed;
      }
      return result;
    } finally {
      this.running = false;
    }
  }

  /**
   * Archive one batch from one table:
   *   1. SELECT batch (oldest-first, capped at `batchSize`).
   *   2. Gzip → upload to GCS.
   *   3. DELETE by id.
   *
   * On any error we log + Sentry-capture + return `{ failed: rowCount }`
   * without touching the DB. Next tick will retry the same rows.
   */
  private async archiveTable(
    spec: ArchiveTableSpec,
  ): Promise<{ archived: number; failed: number }> {
    const { table, timestampColumn } = spec;
    // eslint-disable-next-line no-restricted-syntax -- `table` and `timestampColumn` come from the hard-coded `DEFAULT_ARCHIVE_TABLES` allowlist; values that drive bind-params still flow through $1/$2.
    const select = await this.pool.query<
      { id: string } & Record<string, unknown>
    >(
      `SELECT *
         FROM ${table}
        WHERE ${timestampColumn} < now() - ($1::int * INTERVAL '1 day')
        ORDER BY id ASC
        LIMIT $2::int`,
      [this.retentionDays, this.batchSize],
    );
    const rows = select.rows;
    if (rows.length === 0) {
      logArchiveRowsTotal.inc({ table, outcome: "noop" }, 0);
      return { archived: 0, failed: 0 };
    }

    const objectName = this.buildObjectName(table, rows);
    const jsonl = rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
    const gzipped = gzipSync(Buffer.from(jsonl, "utf8"));

    try {
      await uploadGzippedJsonl(
        { bucket: this.bucket, objectName, gzippedBody: gzipped },
        this.gcsDeps,
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.warn({
        msg: "log_archive_upload_failed",
        table,
        bucket: this.bucket,
        objectName,
        rows: rows.length,
        err: errorMessage,
      });
      Sentry.captureMessage(
        `Log archive upload failed for ${table} (${rows.length} rows) — rows kept in DB`,
        {
          level: "warning",
          extra: { table, bucket: this.bucket, objectName, err: errorMessage },
        },
      );
      logArchiveRowsTotal.inc({ table, outcome: "upload_failed" }, rows.length);
      return { archived: 0, failed: rows.length };
    }

    const ids = rows.map((r) => r.id);
    // eslint-disable-next-line no-restricted-syntax -- `table` is allowlisted via `DEFAULT_ARCHIVE_TABLES`; ids flow through $1.
    const deleted = await this.pool.query(
      `DELETE FROM ${table} WHERE id = ANY($1::bigint[])`,
      [ids],
    );
    const deletedCount = deleted.rowCount ?? 0;

    logger.info({
      msg: "log_archive_batch_done",
      table,
      bucket: this.bucket,
      objectName,
      archived: rows.length,
      deleted: deletedCount,
    });
    logArchiveRowsTotal.inc({ table, outcome: "archived" }, deletedCount);
    return { archived: deletedCount, failed: 0 };
  }

  /**
   * GCS object path: `openclaw-archive/<YYYY-MM-DD>/<table>__<minId>-<maxId>.jsonl.gz`.
   * Date prefix supports GCS lifecycle rules ("delete objects older than
   * 365 days"). ID range lets ops reconstruct exact batch boundaries when
   * spelunking a specific row.
   */
  private buildObjectName(
    table: string,
    rows: ReadonlyArray<{ id: string }>,
  ): string {
    const date = this.now().toISOString().slice(0, 10);
    const first = rows[0]?.id ?? "unknown";
    const last = rows[rows.length - 1]?.id ?? first;
    return `openclaw-archive/${date}/${table}__${first}-${last}.jsonl.gz`;
  }
}
