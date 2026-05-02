import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import pool from "../../db.js";
import { validateBody, validateQuery } from "../../http/validate.js";
import {
  SyncV2PullSchema,
  SyncV2PushSchema,
  type SyncV2Op,
} from "../../http/schemas.js";
import { logger } from "../../obs/logger.js";
import {
  syncDurationMs,
  syncOperationsTotal,
  syncPayloadBytes,
} from "../../obs/metrics.js";

/**
 * v2 op-log sync — Stage 2 / PR #021 із `docs/planning/storage-roadmap.md`.
 *
 * На відміну від v1 (`./sync.ts`), що пуш-пулить whole-blob LWW у
 * `module_data`, v2 приймає stream per-row операцій (`insert`/
 * `update`/`delete`) для нормалізованих per-module таблиць. Кожна
 * операція durably записується у `sync_op_log` (міграція 027) разом
 * із idempotency-ключем, тож:
 *
 *   * Реплеї офлайн-клієнта — no-op на повторний push;
 *   * `pull?since=<id>` стрімить нові ops іншим пристроям того ж
 *     юзера (cursor-based, append-only);
 *   * `client_ts` дає apply-шляху per-row last-write-wins.
 *
 * v1 і v2 існують паралельно до Stage 7 (PR #052 cleanup). v2 — це
 * фундамент під Stage 3 SPIKE (PR #022 — routine SPIKE) та Stage 4–5
 * (per-module міграції + клієнтський op log).
 */

type WithSessionUser = Request & { user?: { id: string } };

type SyncV2OpKind = "v2_push" | "v2_pull";

/**
 * Outcome для v2 sync_event / `sync_audit_log`. Дзеркалить (й
 * розширює) `SyncOutcome` з v1: додано `partial` для batch-push,
 * де якісь ops applied, якісь rejected. Audit-стовпець `outcome` —
 * TEXT без CHECK, тому розширення безпечне; admin-фільтр в
 * `audit.ts` досі приймає лише v1-значення, але це read-side і не
 * впливає на запис.
 */
type SyncV2Outcome =
  | "ok"
  | "empty"
  | "partial"
  | "conflict"
  | "invalid"
  | "too_large"
  | "unauthorized"
  | "error";

type AppliedStatus =
  | { status: "applied" }
  | { status: "rejected"; reason: string };

type ApplyFn = (
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
) => Promise<AppliedStatus>;

interface SyncOpLogInsertRow {
  id: string;
}

interface SyncOpLogDuplicateRow {
  id: string;
  status: "applied" | "duplicate" | "rejected";
  reject_reason: string | null;
}

interface PullRow {
  id: string;
  table_name: string;
  op: "insert" | "update" | "delete";
  row: unknown;
  client_ts: Date;
  server_ts: Date;
  origin_device_id: string | null;
}

/** Module label для метрик/логів — стабільний `v2`, незалежно від `table`. */
const SYNC_V2_MODULE = "v2";

/**
 * Maximum tolerated forward clock skew. Клієнти, що надсилають
 * `client_ts > server_ts + 1h`, відхиляються — інакше їхній
 * "майбутній" timestamp перевертатиме LWW і ламатиме реплікацію
 * для нормальних пристроїв.
 */
const CLOCK_SKEW_FORWARD_MS = 60 * 60 * 1000;

/**
 * Whitelist таблиць, для яких apply-шар знає, як виконати DML.
 * Початкова версія (PR #021) — тільки routine_*; нові модулі
 * додаються тут разом із власним `applyXxx` на час Stage 4.
 *
 * TODO(roadmap-pr-050): партиціювання + архівація `sync_op_log` —
 * щоб таблиця не росла unbounded.
 */
const OP_LOG_TABLE_REGISTRY: Record<string, ApplyFn> = {
  routine_entries: applyRoutineEntries,
  routine_streaks: applyRoutineStreaks,
};

/**
 * Captured truncated header. `X-Origin-Device-Id` — опціональний
 * client-supplied ідентифікатор пристрою; `pull` виключає ops з тим
 * самим device-id, щоб клієнт не реплеїв власні writes. Обмежуємо
 * довжину до 64 char, щоб уникнути smuggle-атак на JSON-fields.
 */
function readOriginDeviceId(req: Request): string | null {
  const raw = req.headers["x-origin-device-id"];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 64);
  return trimmed.length > 0 ? trimmed : null;
}

function elapsedMs(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

/**
 * Спільне місце: метрика + structured `sync_event` лог + audit-row.
 * Дублює форму `recordSync` з v1 (`./sync.ts`), але з власним вузьким
 * контрактом outcome (включаючи `partial`) і модулем `v2` за
 * замовчуванням.
 */
function recordSyncV2(
  op: SyncV2OpKind,
  outcome: SyncV2Outcome,
  {
    ms,
    bytes,
    userId,
    extra,
  }: {
    ms?: number;
    bytes?: number;
    userId?: string | null;
    extra?: Record<string, unknown>;
  } = {},
): void {
  try {
    syncOperationsTotal.inc({ op, module: SYNC_V2_MODULE, outcome });
    if (ms != null) syncDurationMs.observe({ op, module: SYNC_V2_MODULE }, ms);
    if (bytes != null)
      syncPayloadBytes.observe({ op, module: SYNC_V2_MODULE }, bytes);
  } catch {
    /* metrics must never break a request */
  }

  const level: "info" | "warn" | "error" =
    outcome === "error"
      ? "error"
      : outcome === "conflict" ||
          outcome === "invalid" ||
          outcome === "too_large" ||
          outcome === "unauthorized" ||
          outcome === "partial"
        ? "warn"
        : "info";
  try {
    logger[level]({
      msg: "sync_event",
      op,
      module: SYNC_V2_MODULE,
      outcome,
      ms: ms != null ? Math.round(ms) : undefined,
      bytes,
      ...(extra || {}),
    });
  } catch {
    /* logging must never break a request */
  }

  // Audit: тримаємо ту ж семантику, що й v1. invalid/unauthorized/too_large
  // — це валідаційні reject-и до того, як юзер виконав хоч щось над
  // даними, тож пропускаємо їх (як і `auditSync()` у v1).
  if (
    !userId ||
    outcome === "invalid" ||
    outcome === "unauthorized" ||
    outcome === "too_large"
  ) {
    return;
  }
  try {
    const promise = pool.query(
      `INSERT INTO sync_audit_log
         (user_id, op_type, module, outcome, conflict, payload_size_bytes, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        op,
        SYNC_V2_MODULE,
        outcome,
        outcome === "conflict",
        bytes ?? null,
        ms != null ? Math.round(ms) : null,
      ],
    );
    if (promise && typeof (promise as Promise<unknown>).catch === "function") {
      (promise as Promise<unknown>).catch((err: unknown) => {
        try {
          logger.warn({
            msg: "sync_audit_insert_failed",
            op,
            module: SYNC_V2_MODULE,
            outcome,
            err: err instanceof Error ? err.message : String(err),
          });
        } catch {
          /* logging must never break a request */
        }
      });
    }
  } catch {
    /* audit must never break a request */
  }
}

/**
 * Apply-шлях для `routine_entries`. Кожна операція — повний UPSERT за
 * `id` (UUID PK). LWW-guard: existing.updated_at < clientTs. Власник
 * рядка перевіряється явно SELECT-ом до DML-у — якщо PK уже існує і
 * належить іншому юзеру, повертаємо `fk_violation` замість `lww_conflict`,
 * щоб не ховати security-related reject в нормальній conflict-метриці.
 *
 * Soft-delete: `op === "delete"` → ставимо `deleted_at = clientTs`,
 * `updated_at = clientTs`. Жорстке видалення не використовується для
 * Routine, бо клієнт може потім повернути виконання.
 */
async function applyRoutineEntries(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row.id === "string" ? row.id : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  // Cross-user ownership check. Якщо клієнт надіслав `user_id` у row,
  // воно мусить збігатись із сесією; якщо ні — підставляємо у DML
  // server-side userId, щоб не дозволяти smuggle через payload.
  if (row.user_id != null && row.user_id !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{ user_id: string; updated_at: Date }>(
    `SELECT user_id, updated_at FROM routine_entries WHERE id = $1`,
    [id],
  );
  if (existing.rows.length > 0) {
    if (existing.rows[0].user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing.rows[0].updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
  }

  if (op.op === "delete") {
    if (existing.rows.length === 0) {
      return { status: "rejected", reason: "not_found" };
    }
    await client.query(
      `UPDATE routine_entries
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const name = typeof row.name === "string" ? row.name : null;
  if (!name) return { status: "rejected", reason: "missing_name" };

  const completedAt = parseOptionalDate(row.completed_at);
  if (completedAt === "invalid") {
    return { status: "rejected", reason: "invalid_completed_at" };
  }
  const deletedAt = parseOptionalDate(row.deleted_at);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }
  const createdAt = parseOptionalDate(row.created_at);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO routine_entries
         (id, user_id, name, completed_at, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        userId,
        name,
        completedAt ?? null,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE routine_entries
         SET name = $1,
             completed_at = $2,
             updated_at = $3,
             deleted_at = $4
       WHERE id = $5 AND user_id = $6`,
      [name, completedAt ?? null, clientTs, deletedAt ?? null, id, userId],
    );
  }
  return { status: "applied" };
}

/**
 * Apply-шлях для `routine_streaks` (per-user aggregate). PK = user_id,
 * один рядок на юзера; історичного `updated_at` нема. LWW-guard
 * робимо проти `MAX(client_ts)` із `sync_op_log` для (user_id,
 * `routine_streaks`, status='applied') — так v2 не залежить від форми
 * конкретної таблиці й може застосовуватись для будь-якої агрегованої
 * сутності в Stage 4.
 *
 * `delete` — жорстке видалення (немає soft-delete-стовпця). Клієнт
 * рідко це виконує, але семантика синхронна з реальною кнопкою
 * "reset streaks".
 */
async function applyRoutineStreaks(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  if (row.user_id != null && row.user_id !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const lwwGuard = await client.query<{ max_ts: Date | null }>(
    `SELECT MAX(client_ts) AS max_ts
       FROM sync_op_log
      WHERE user_id = $1
        AND table_name = 'routine_streaks'
        AND status = 'applied'`,
    [userId],
  );
  if (
    lwwGuard.rows[0].max_ts &&
    lwwGuard.rows[0].max_ts.getTime() >= clientTs.getTime()
  ) {
    return { status: "rejected", reason: "lww_conflict" };
  }

  if (op.op === "delete") {
    await client.query(`DELETE FROM routine_streaks WHERE user_id = $1`, [
      userId,
    ]);
    return { status: "applied" };
  }

  const currentStreak = toNonNegativeInt(row.current_streak) ?? 0;
  const longestStreak = toNonNegativeInt(row.longest_streak) ?? 0;
  const lastCompletedAt = parseOptionalDate(row.last_completed_at);
  if (lastCompletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_last_completed_at" };
  }

  await client.query(
    `INSERT INTO routine_streaks
       (user_id, current_streak, longest_streak, last_completed_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE
       SET current_streak = EXCLUDED.current_streak,
           longest_streak = EXCLUDED.longest_streak,
           last_completed_at = EXCLUDED.last_completed_at`,
    [userId, currentStreak, longestStreak, lastCompletedAt ?? null],
  );
  return { status: "applied" };
}

function parseOptionalDate(value: unknown): Date | null | "invalid" {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "invalid" : value;
  }
  if (typeof value !== "string") return "invalid";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

function toNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return null;
  return Math.floor(value);
}

/**
 * `POST /api/v2/sync/push` — батч per-row ops у транзакції.
 *
 * Для кожної операції:
 *   1. Перевірити `(user_id, idempotency_key)` у `sync_op_log`. Якщо
 *      існує — додати кешований результат до response, не апплаїти.
 *   2. Перевірити clock-skew (`client_ts > now + 1h` → reject).
 *   3. Якщо `table` не у whitelist-і → reject з `table_not_allowed`.
 *   4. Викликати `applyXxx` усередині `SAVEPOINT`. На exception
 *      `ROLLBACK TO SAVEPOINT` повертає таблицю у стан до op-у; status
 *      = `rejected`, reason = `apply_failed`. На LWW-conflict apply-фн
 *      повертає `{status: 'rejected', reason: 'lww_conflict'}` без
 *      DML-у — savepoint rollback no-op-ить.
 *   5. INSERT у `sync_op_log` із фінальним status; повертає `id` для
 *      `last_op_id`.
 *
 * Усе йде в одній транзакції; на будь-яку catastrophic exception
 * (наприклад, DB-disconnect) — ROLLBACK і 500 через errorHandler.
 * Per-op rollback через savepoint-и НЕ скасовує `sync_op_log` insert
 * (savepoint обмежує тільки apply-шар).
 */
export async function syncV2Push(req: Request, res: Response): Promise<void> {
  const start = process.hrtime.bigint();
  const user = (req as WithSessionUser).user!;
  const originDeviceId = readOriginDeviceId(req);

  const parsed = validateBody(SyncV2PushSchema, req, res);
  if (!parsed.ok) {
    recordSyncV2("v2_push", "invalid", {
      ms: elapsedMs(start),
      userId: user.id,
    });
    return;
  }
  const { ops } = parsed.data;

  // bytes-метрика: serialized payload size. Тримаємо до COMMIT-а;
  // оригінальне `req.body` уже розпарсене.
  const payloadBytes = JSON.stringify({ ops }).length;

  type OpResult = {
    idempotency_key: string;
    status: "applied" | "duplicate" | "rejected";
    reason?: string;
  };
  const results: OpResult[] = [];
  let acceptedCount = 0;
  let lastOpId = 0;
  let appliedCount = 0;
  let rejectedCount = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const op of ops) {
      // 1. Idempotency check.
      const dup = await client.query<SyncOpLogDuplicateRow>(
        `SELECT id, status, reject_reason
           FROM sync_op_log
          WHERE user_id = $1 AND idempotency_key = $2`,
        [user.id, op.idempotency_key],
      );
      if (dup.rows.length > 0) {
        const r = dup.rows[0];
        // Hard rule #1: BIGINT id → number.
        const id = Number(r.id);
        if (id > lastOpId) lastOpId = id;
        // Кешований результат: повертаємо ОРИГІНАЛЬНИЙ status (applied
        // / rejected), а не "duplicate" — клієнту важливий ефект
        // first-write-у, а не той факт, що ми вже бачили цей ключ.
        // Метрика `outcome="partial"` все ще побачить це через
        // appliedCount/rejectedCount.
        results.push({
          idempotency_key: op.idempotency_key,
          status: r.status,
          ...(r.reject_reason != null
            ? { reason: r.reject_reason }
            : r.status === "duplicate"
              ? { reason: "duplicate" }
              : {}),
        });
        if (r.status === "applied") {
          acceptedCount++;
          appliedCount++;
        } else if (r.status === "rejected") {
          rejectedCount++;
        }
        continue;
      }

      // 2. Validate client_ts vs server clock.
      const clientTs = new Date(op.client_ts);
      let status: "applied" | "rejected" = "applied";
      let reason: string | null = null;

      const skewMs = clientTs.getTime() - Date.now();
      if (skewMs > CLOCK_SKEW_FORWARD_MS) {
        status = "rejected";
        reason = "clock_skew";
      }

      // 3. Whitelist check.
      const applyFn = OP_LOG_TABLE_REGISTRY[op.table];
      if (status === "applied" && !applyFn) {
        status = "rejected";
        reason = "table_not_allowed";
      }

      // 4. Apply усередині SAVEPOINT — щоб FK/unique-violation не
      //    poison-нув цілу транзакцію. На очікувані LWW-reject-и
      //    apply-fn просто повертає `{rejected, reason}` без DML.
      if (status === "applied" && applyFn) {
        await client.query("SAVEPOINT op_apply");
        try {
          const applied = await applyFn(client, op, user.id, clientTs);
          if (applied.status === "rejected") {
            status = "rejected";
            reason = applied.reason;
          }
        } catch (err: unknown) {
          status = "rejected";
          reason = "apply_failed";
          try {
            await client.query("ROLLBACK TO SAVEPOINT op_apply");
          } catch {
            /* primary rollback below will catch transactional poison */
          }
          logger.warn({
            msg: "sync_v2_apply_failed",
            module: SYNC_V2_MODULE,
            op: op.op,
            table: op.table,
            err: err instanceof Error ? err.message : String(err),
          });
        }
        try {
          await client.query("RELEASE SAVEPOINT op_apply");
        } catch {
          /* idempotent: already released after rollback */
        }
      }

      // 5. INSERT у `sync_op_log`. ON CONFLICT не потрібен — idempotency-
      //    check вище вже відсіяв повтори; UNIQUE-constraint тут служить
      //    як остання сторожа на race з паралельним push-ем тієї ж
      //    сесії (PG поверне 23505 — ловиться як unhandled exception).
      const inserted = await client.query<SyncOpLogInsertRow>(
        `INSERT INTO sync_op_log
           (user_id, idempotency_key, table_name, op, row, client_ts,
            origin_device_id, status, reject_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          user.id,
          op.idempotency_key,
          op.table,
          op.op,
          JSON.stringify(op.row),
          clientTs,
          originDeviceId,
          status,
          reason,
        ],
      );
      const insertedId = Number(inserted.rows[0].id);
      if (insertedId > lastOpId) lastOpId = insertedId;

      if (status === "applied") {
        acceptedCount++;
        appliedCount++;
        results.push({
          idempotency_key: op.idempotency_key,
          status: "applied",
        });
      } else {
        rejectedCount++;
        results.push({
          idempotency_key: op.idempotency_key,
          status: "rejected",
          ...(reason ? { reason } : {}),
        });
      }
    }

    await client.query("COMMIT");
  } catch (err: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* secondary rollback failure swallowed */
    }
    recordSyncV2("v2_push", "error", {
      ms: elapsedMs(start),
      bytes: payloadBytes,
      userId: user.id,
    });
    throw err;
  } finally {
    client.release();
  }

  // Outcome класифікація: усі applied → ok; жодного applied →
  // conflict (всі ops відхилено); змішаний — partial.
  const outcome: SyncV2Outcome =
    rejectedCount === 0
      ? appliedCount > 0
        ? "ok"
        : "empty"
      : appliedCount === 0
        ? "conflict"
        : "partial";
  recordSyncV2("v2_push", outcome, {
    ms: elapsedMs(start),
    bytes: payloadBytes,
    userId: user.id,
    extra: {
      ops: ops.length,
      applied: appliedCount,
      rejected: rejectedCount,
    },
  });

  res.json({
    accepted: acceptedCount,
    last_op_id: lastOpId,
    results,
  });
}

/**
 * `GET /api/v2/sync/pull?since=<id>&limit=<int>` — cursor-based стрім
 * applied-ops іншого пристрою того ж юзера, починаючи з `id > since`.
 *
 * Заголовок `X-Origin-Device-Id` (опціональний) виключає ops з тим
 * самим device-id, щоб клієнт ніколи не реплеїв власні writes. Без
 * заголовка повертаємо всі applied-ops юзера.
 *
 * Повертаємо тільки `status='applied'` — реплейний клієнт не має
 * шансу побачити rejected/duplicate-маркери та зайти в нескінченний
 * цикл-резолв. План:
 *   Index Scan using sync_op_log_user_id_idx
 *     Index Cond: (user_id = $1) AND (id > $2)
 *   Filter: status = 'applied' AND origin_device_id IS DISTINCT FROM $3
 *   LIMIT N
 */
export async function syncV2Pull(req: Request, res: Response): Promise<void> {
  const start = process.hrtime.bigint();
  const user = (req as WithSessionUser).user!;

  const parsed = validateQuery(SyncV2PullSchema, req, res);
  if (!parsed.ok) {
    recordSyncV2("v2_pull", "invalid", {
      ms: elapsedMs(start),
      userId: user.id,
    });
    return;
  }
  const { since, limit } = parsed.data;
  const originDeviceId = readOriginDeviceId(req);

  try {
    const result = await pool.query<PullRow>(
      `SELECT id, table_name, op, row, client_ts, server_ts, origin_device_id
         FROM sync_op_log
        WHERE user_id = $1
          AND id > $2
          AND status = 'applied'
          AND origin_device_id IS DISTINCT FROM $3
        ORDER BY id ASC
        LIMIT $4`,
      [user.id, since, originDeviceId, limit],
    );

    // Hard rule #1: BIGSERIAL `id` повертається як string. Coerce у
    // number — JSON-споживачі очікують number, JS-число тримає 2^53,
    // що еквівалентно ~3000 років при 100k op/sec.
    const opsOut = result.rows.map((r) => ({
      id: Number(r.id),
      table: r.table_name,
      op: r.op,
      row: r.row,
      client_ts: r.client_ts.toISOString(),
      server_ts: r.server_ts.toISOString(),
      // eslint-disable-next-line sergeant-design/no-bigint-string -- TEXT column (UUID/ULID), not bigint; rule heuristic flags `_id` suffix indiscriminately.
      origin_device_id: r.origin_device_id,
    }));

    const nextCursor =
      opsOut.length === limit ? opsOut[opsOut.length - 1].id : null;

    const bytes = result.rows.reduce((acc, r) => {
      try {
        return acc + JSON.stringify(r.row).length;
      } catch {
        return acc;
      }
    }, 0);

    recordSyncV2("v2_pull", opsOut.length === 0 ? "empty" : "ok", {
      ms: elapsedMs(start),
      bytes,
      userId: user.id,
      extra: { since, limit, returned: opsOut.length },
    });

    res.json({
      ops: opsOut,
      next_cursor: nextCursor,
    });
  } catch (err) {
    recordSyncV2("v2_pull", "error", {
      ms: elapsedMs(start),
      userId: user.id,
    });
    throw err;
  }
}

/**
 * Експортуємо whitelist для тестів і потенційних admin-ендпоінтів —
 * щоб не тримати copy-paste списку tables у `routes/sync.ts` чи
 * у тестовому коді.
 */
export const SYNC_V2_SUPPORTED_TABLES = Object.freeze(
  Object.keys(OP_LOG_TABLE_REGISTRY),
);
