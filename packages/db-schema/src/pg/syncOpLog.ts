import {
  bigserial,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { SYNC_OP_LOG_OPS, SYNC_OP_LOG_STATUSES } from "../shared/index.js";

/**
 * Postgres schema for `sync_op_log` table.
 * Mirrors migration 027_sync_op_log.sql.
 *
 * Stage 2 / PR #021 із `docs/planning/storage-roadmap.md` — per-row
 * операційний лог для v2 sync. Append-only. Кожен `applied` рядок
 * є authoritative-операцією; `duplicate` — sentinel-replay (cached
 * відповідь на повтор того самого `idempotency_key`); `rejected` —
 * apply-шлях відхилив op (LWW-конфлікт, FK-violation, не-whitelisted
 * table тощо). Партиціювання + архівація заплановано окремо як PR #050.
 */
export const syncOpLog = pgTable(
  "sync_op_log",
  {
    /** BIGSERIAL у БД; serializer-и завжди coerce-ять у `number` (rule #1). */
    id: bigserial({ mode: "number" }).primaryKey(),
    userId: text("user_id").notNull(),
    /** ULID/UUID-shaped, ≤64 chars (enforced на API-шарі). */
    idempotencyKey: text("idempotency_key").notNull(),
    /** Whitelisted на API-шарі: routine_entries, routine_streaks (initial). */
    tableName: text("table_name").notNull(),
    op: text({ enum: SYNC_OP_LOG_OPS }).notNull(),
    /** Повний row payload (PK + поля). Розмір обмежено на API-шарі (≤256 KB). */
    row: jsonb().notNull(),
    /** Client-supplied — використовується для per-row LWW vs `updated_at`. */
    clientTs: timestamp("client_ts", { withTimezone: true }).notNull(),
    /** Server ingest time — стабільний для cursor-замовлення. */
    serverTs: timestamp("server_ts", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** X-Origin-Device-Id; pull виключає ops з того самого пристрою. */
    originDeviceId: text("origin_device_id"),
    status: text({ enum: SYNC_OP_LOG_STATUSES }).notNull(),
    /** Машинно-читабельна причина для duplicate/rejected (≤120 char). */
    rejectReason: text("reject_reason"),
  },
  (table) => [
    uniqueIndex("sync_op_log_user_idem_key").on(
      table.userId,
      table.idempotencyKey,
    ),
    index("sync_op_log_user_id_idx").on(table.userId, table.id),
    index("sync_op_log_user_table_server_ts_idx").on(
      table.userId,
      table.tableName,
      table.serverTs,
    ),
  ],
);
