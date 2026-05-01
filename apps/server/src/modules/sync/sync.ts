import type { Request, Response } from "express";
import pool from "../../db.js";
import { validateBody } from "../../http/validate.js";
import {
  SyncPullSchema,
  SyncPushAllSchema,
  SyncPushSchema,
} from "../../http/schemas.js";
import { logger } from "../../obs/logger.js";
import {
  syncConflictsTotal,
  syncDurationMs,
  syncOperationsTotal,
  syncPayloadBytes,
} from "../../obs/metrics.js";

type WithSessionUser = Request & { user?: { id: string } };

type SyncOp = "push" | "pull" | "push_all" | "pull_all";
type SyncOutcome =
  | "ok"
  | "empty"
  | "conflict"
  | "invalid"
  | "too_large"
  | "unauthorized"
  | "error";

interface RecordSyncOptions {
  ms?: number;
  bytes?: number;
  extra?: Record<string, unknown>;
  /**
   * Якщо виставлений — `recordSync` додатково пише рядок у
   * `sync_audit_log`. Пропускається для early-reject-ів, де жодне
   * `req.user` ще не встигло бути зарезолвленим.
   */
  userId?: string | null;
  /**
   * Якщо виставлений — буде переданий у audit-рядок; інакше
   * походить від outcome==="conflict".
   */
  conflict?: boolean;
}

interface ModuleDataRow {
  data: unknown;
  client_updated_at: Date;
  server_updated_at: Date;
  version: number;
}

interface ModuleDataRowWithModule extends ModuleDataRow {
  module: string;
}

interface ModuleDataUpsertRow {
  server_updated_at: Date;
  version: number;
}

interface PushAllPayloadEntry {
  data: unknown;
  clientUpdatedAt: string | number | Date;
}

interface PushAllResult {
  ok: boolean;
  error?: string;
  conflict?: boolean;
  serverUpdatedAt?: Date;
  version?: number;
}

function recordConflict(module: string): void {
  try {
    syncConflictsTotal.inc({ module });
  } catch {
    /* ignore */
  }
}

/**
 * Асинхронний fire-and-forget запис у `sync_audit_log` (міграція 023).
 *
 * Stage 0 / PR #005 з `docs/planning/storage-roadmap.md`. На відміну
 * від `sync_event` в логах (Loki, ~30 днів, не індексовано per-user)
 * цей слід лежить у Postgres-і і доступний через `/api/sync/audit/me`
 * для юзера та `/api/sync/audit?user_id=X` для адміна.
 *
 * Не await-имо результат INSERT-у: аудит не повинен блокувати
 * відповідь, і тимпольний збій audit-вставки не має ламати
 * sync-флоу. Пропущений audit-рядок — не катастрофа: метрика
 * + `sync_event` лог вже виїхали у `recordSync`.
 *
 * `userId` як `null` — легальний випадок для early-reject-ів, де
 * `req.user` навіть не встиг бути зарезолвленим (`unauthorized`).
 * У цьому випадку не пишемо взагалі: FK `user_id` NOT NULL.
 */
function auditSync(
  userId: string | null | undefined,
  op: SyncOp,
  module: string,
  outcome: SyncOutcome,
  {
    ms,
    bytes,
    conflict,
  }: { ms?: number; bytes?: number; conflict?: boolean } = {},
): void {
  if (!userId) return;
  // `invalid` / `unauthorized` / `too_large` — це валідаційні відмови
  // до того, як юзер виконав хоч якусь дію над своїми даними; такі
  // рядки тільки забивали б `sync_audit_log` шумом від багів клієнта
  // чи атак, а подавлення бот-навантаження вже робить rate-limit +
  // `sync_event` лог. Audit-сліду для цих випадків нема, бо нема й
  // самої дії над `module_data`. Якщо колись треба буде розбирати
  // attack-traffic — для цього є `sync_operations_total{outcome=...}`
  // метрика, яка для invalid/too_large/unauthorized емітиться завжди.
  if (
    outcome === "invalid" ||
    outcome === "unauthorized" ||
    outcome === "too_large"
  ) {
    return;
  }
  // try/catch охоплює і синхронні exception-и (наприклад, `pool.query`
  // у тесті, де мок без `.mockResolvedValue` повертає undefined → `.catch`
  // на undefined кине TypeError), і async-проблеми через `.catch`. audit
  // не повинен ламати sync-флоу за жодних обставин.
  try {
    const promise = pool.query(
      `INSERT INTO sync_audit_log
         (user_id, op_type, module, outcome, conflict, payload_size_bytes, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        op,
        module,
        outcome,
        conflict ?? outcome === "conflict",
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
            module,
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
 * Спільно: метрика + structured `sync_event` лог. Карта outcome→level:
 *   ok | empty                         → info
 *   conflict | invalid | too_large | unauthorized → warn
 *   error                              → error
 *
 * `extra` — довільні JSON-поля для тріажу (версії, timestamp-и). requestId,
 * userId, module підтягуються з ALS у Pino `mixin()` автоматично — не дублюй.
 *
 * `userId` (опціонально) — якщо переданий, функція додатково
 * пише fire-and-forget рядок у `sync_audit_log` (Див. `auditSync`).
 *
 * Query pattern (Loki/Railway):
 *   {service="sergeant-api"} | json | msg="sync_event" | outcome="conflict" | module="routine"
 */
function recordSync(
  op: SyncOp,
  module: string,
  outcome: SyncOutcome,
  { ms, bytes, extra, userId, conflict }: RecordSyncOptions = {},
): void {
  try {
    syncOperationsTotal.inc({ op, module, outcome });
    if (ms != null) syncDurationMs.observe({ op, module }, ms);
    if (bytes != null) syncPayloadBytes.observe({ op, module }, bytes);
  } catch {
    /* metrics must never break a request */
  }
  const level: "info" | "warn" | "error" =
    outcome === "error"
      ? "error"
      : outcome === "conflict" ||
          outcome === "invalid" ||
          outcome === "too_large" ||
          outcome === "unauthorized"
        ? "warn"
        : "info";
  try {
    logger[level]({
      msg: "sync_event",
      op,
      module,
      outcome,
      ms: ms != null ? Math.round(ms) : undefined,
      bytes,
      ...(extra || {}),
    });
  } catch {
    /* logging must never break a request */
  }
  auditSync(userId, op, module, outcome, { ms, bytes, conflict });
}

function elapsedMs(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

export const VALID_MODULES = new Set([
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
  "profile",
]);
export const MAX_BLOB_SIZE = 5 * 1024 * 1024;

export async function syncPush(req: Request, res: Response): Promise<void> {
  const start = process.hrtime.bigint();
  const user = (req as WithSessionUser).user!;

  const parsed = validateBody(SyncPushSchema, req, res);
  if (!parsed.ok) {
    const rawModule = (req.body as { module?: unknown } | undefined)?.module;
    recordSync(
      "push",
      typeof rawModule === "string" ? rawModule.slice(0, 32) : "unknown",
      "invalid",
      { ms: elapsedMs(start), userId: user.id },
    );
    return;
  }
  const { module, data, clientUpdatedAt } = parsed.data;

  const blob = JSON.stringify(data);
  if (blob.length > MAX_BLOB_SIZE) {
    recordSync("push", module, "too_large", {
      ms: elapsedMs(start),
      bytes: blob.length,
      userId: user.id,
    });
    res.status(413).json({ error: "Data too large" });
    return;
  }

  // `clientUpdatedAt` — required у `SyncPushSchema`, тому fallback на
  // `new Date()` прибрано: раніше він мовчки переписував свіжіший серверний
  // запис, бо `client_updated_at <= NOW()` завжди true.
  const clientTs = new Date(clientUpdatedAt);

  try {
    // EXPLAIN ANALYZE (типовий plan):
    //   Insert on module_data  (rows=1)
    //     Conflict Resolution: UPDATE
    //     Conflict Arbiter Indexes: module_data_user_id_module_key
    //       -> Index Scan using module_data_user_id_module_key  (rows=1)
    // WHERE module_data.client_updated_at <= $4 — це last-write-wins guard;
    // старіший клієнт отримує 0 рядків і сервер віддає 409-like conflict.
    const result = await pool.query<ModuleDataUpsertRow>(
      `INSERT INTO module_data (user_id, module, data, client_updated_at, version)
       VALUES ($1, $2, $3, $4, 1)
       ON CONFLICT (user_id, module) DO UPDATE
         SET data = $3, client_updated_at = $4, server_updated_at = NOW(),
             version = module_data.version + 1
       WHERE module_data.client_updated_at <= $4
       RETURNING server_updated_at, version`,
      [user.id, module, blob, clientTs],
    );

    if (result.rows.length === 0) {
      const existing = await pool.query<ModuleDataUpsertRow>(
        `SELECT server_updated_at, version FROM module_data WHERE user_id = $1 AND module = $2`,
        [user.id, module],
      );
      recordConflict(module);
      recordSync("push", module, "conflict", {
        ms: elapsedMs(start),
        bytes: blob.length,
        userId: user.id,
        extra: {
          clientUpdatedAt: clientTs.toISOString(),
          serverUpdatedAt: existing.rows[0]?.server_updated_at,
          serverVersion: existing.rows[0]?.version ?? 0,
        },
      });
      res.json({
        ok: true,
        module,
        conflict: true,
        serverUpdatedAt: existing.rows[0]?.server_updated_at,
        version: existing.rows[0]?.version ?? 0,
      });
      return;
    }

    recordSync("push", module, "ok", {
      ms: elapsedMs(start),
      bytes: blob.length,
      userId: user.id,
    });
    res.json({
      ok: true,
      module,
      serverUpdatedAt: result.rows[0].server_updated_at,
      version: result.rows[0].version,
    });
  } catch (e: unknown) {
    recordSync("push", module, "error", {
      ms: elapsedMs(start),
      bytes: blob.length,
      userId: user.id,
    });
    throw e;
  }
}

export async function syncPull(req: Request, res: Response): Promise<void> {
  const start = process.hrtime.bigint();
  const user = (req as WithSessionUser).user!;

  const parsed = validateBody(SyncPullSchema, req, res);
  if (!parsed.ok) {
    const rawModule = (req.body as { module?: unknown } | undefined)?.module;
    recordSync(
      "pull",
      typeof rawModule === "string" ? rawModule.slice(0, 32) : "unknown",
      "invalid",
      { ms: elapsedMs(start), userId: user.id },
    );
    return;
  }
  const { module } = parsed.data;

  try {
    // EXPLAIN ANALYZE: Index Scan using module_data_user_id_module_key,
    //   Index Cond: (user_id = $1 AND module = $2). Point-lookup на
    //   UNIQUE-індексі — data читається одним I/O (toast-ed JSONB).
    const result = await pool.query<ModuleDataRow>(
      `SELECT data, client_updated_at, server_updated_at, version
       FROM module_data
       WHERE user_id = $1 AND module = $2`,
      [user.id, module],
    );

    if (result.rows.length === 0) {
      recordSync("pull", module, "empty", {
        ms: elapsedMs(start),
        userId: user.id,
      });
      res.json({
        ok: true,
        module,
        data: null,
        serverUpdatedAt: null,
        version: 0,
      });
      return;
    }

    const row = result.rows[0];
    let data: unknown;
    try {
      data = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
    } catch {
      data = row.data;
    }

    const bytes =
      typeof row.data === "string"
        ? row.data.length
        : row.data != null
          ? JSON.stringify(row.data).length
          : 0;
    recordSync("pull", module, "ok", {
      ms: elapsedMs(start),
      bytes,
      userId: user.id,
    });

    res.json({
      ok: true,
      module,
      data,
      clientUpdatedAt: row.client_updated_at,
      serverUpdatedAt: row.server_updated_at,
      version: row.version,
    });
  } catch (e: unknown) {
    recordSync("pull", module, "error", {
      ms: elapsedMs(start),
      userId: user.id,
    });
    throw e;
  }
}

export async function syncPullAll(req: Request, res: Response): Promise<void> {
  const start = process.hrtime.bigint();
  const user = (req as WithSessionUser).user!;

  try {
    // Явно фільтруємо по `VALID_MODULES`. У `module_data` можуть лежати і
    // не-sync записи (напр. `coach` memory, яка пишеться через окремий
    // endpoint), і витягати їх сюди — це і зайві bytes на pull-all, і
    // ламання інкапсуляції (клієнт sync-шару не повинен знати про coach).
    //
    // EXPLAIN ANALYZE (типовий план):
    //   Bitmap Heap Scan on module_data  (rows≤5)
    //     -> Bitmap Index Scan on module_data_user_id_module_key
    //          Index Cond: (user_id = $1 AND module = ANY($2::text[]))
    // ANY($2::text[]) дозволяє Bitmap-скан по UNIQUE-індексу одним round-trip
    // замість окремого lookup-а на кожен модуль. ORDER BY стабілізує відповідь.
    const result = await pool.query<ModuleDataRowWithModule>(
      `SELECT module, data, client_updated_at, server_updated_at, version
       FROM module_data
       WHERE user_id = $1 AND module = ANY($2::text[])
       ORDER BY module`,
      [user.id, Array.from(VALID_MODULES)],
    );

    const modules: Record<
      string,
      {
        data: unknown;
        clientUpdatedAt: Date;
        serverUpdatedAt: Date;
        version: number;
      }
    > = {};
    for (const row of result.rows) {
      let data: unknown;
      try {
        data = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
      } catch {
        data = row.data;
      }
      modules[row.module] = {
        data,
        clientUpdatedAt: row.client_updated_at,
        serverUpdatedAt: row.server_updated_at,
        version: row.version,
      };
    }

    recordSync("pull_all", "all", "ok", {
      ms: elapsedMs(start),
      userId: user.id,
    });
    res.json({ ok: true, modules });
  } catch (e: unknown) {
    recordSync("pull_all", "all", "error", {
      ms: elapsedMs(start),
      userId: user.id,
    });
    throw e;
  }
}

export async function syncPushAll(req: Request, res: Response): Promise<void> {
  const start = process.hrtime.bigint();
  const user = (req as WithSessionUser).user!;

  const parsed = validateBody(SyncPushAllSchema, req, res);
  if (!parsed.ok) {
    recordSync("push_all", "all", "invalid", {
      ms: elapsedMs(start),
      userId: user.id,
    });
    return;
  }
  const { modules } = parsed.data as {
    modules: Record<string, PushAllPayloadEntry>;
  };

  const results: Record<string, PushAllResult> = {};
  // Per-module метрики `push` накопичуємо тут і емітимо ЛИШЕ після COMMIT.
  // Якщо один із модулів посеред транзакції кине — `ROLLBACK` відкотить
  // уже «успішні» INSERT-и, але лічильник `sync_operations_total{outcome="ok"}`
  // уже був би інкрементований → SLI бреше, `SyncErrorBudgetBurn` пропускає
  // реальні збої. `too_large` — виняток: це per-item reject ДО будь-якого
  // DML, тому rollback його не зачіпає, фіксуємо одразу.
  const pending: Array<{
    module: string;
    outcome: "ok" | "conflict";
    bytes: number;
  }> = [];
  const client = await pool.connect();
  try {
    // Pre-fetch current server state for all valid modules in ONE round-trip.
    // Used for conflict reporting without an extra SELECT per module inside
    // the transaction (avoids N additional queries when all modules conflict).
    const existingRows = await client.query<
      ModuleDataUpsertRow & { module: string }
    >(
      `SELECT module, server_updated_at, version
       FROM module_data
       WHERE user_id = $1 AND module = ANY($2::text[])`,
      [user.id, Array.from(VALID_MODULES)],
    );
    const existingByModule = new Map(
      existingRows.rows.map((r) => [r.module, r]),
    );

    await client.query("BEGIN");
    for (const [mod, payload] of Object.entries(modules)) {
      if (!VALID_MODULES.has(mod)) continue;
      const { data, clientUpdatedAt } = payload;
      if (data === undefined || data === null) continue;
      const blob = JSON.stringify(data);
      if (blob.length > MAX_BLOB_SIZE) {
        recordSync("push", mod, "too_large", {
          bytes: blob.length,
          userId: user.id,
        });
        results[mod] = { ok: false, error: "Too large" };
        continue;
      }
      // `clientUpdatedAt` — required у `SyncPushAllSchema`; fallback на
      // `new Date()` прибрано з тієї ж причини, що й у `syncPush` вище.
      const clientTs = new Date(clientUpdatedAt);
      const r = await client.query<ModuleDataUpsertRow>(
        `INSERT INTO module_data (user_id, module, data, client_updated_at, version)
         VALUES ($1, $2, $3, $4, 1)
         ON CONFLICT (user_id, module) DO UPDATE
           SET data = $3, client_updated_at = $4, server_updated_at = NOW(),
               version = module_data.version + 1
         WHERE module_data.client_updated_at <= $4
         RETURNING server_updated_at, version`,
        [user.id, mod, blob, clientTs],
      );
      if (r.rows.length === 0) {
        const existing = existingByModule.get(mod);
        pending.push({ module: mod, outcome: "conflict", bytes: blob.length });
        results[mod] = {
          ok: true,
          conflict: true,
          serverUpdatedAt: existing?.server_updated_at,
          version: existing?.version ?? 0,
        };
      } else {
        pending.push({ module: mod, outcome: "ok", bytes: blob.length });
        results[mod] = {
          ok: true,
          serverUpdatedAt: r.rows[0].server_updated_at,
          version: r.rows[0].version,
        };
      }
    }
    await client.query("COMMIT");
  } catch (err: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore secondary rollback failure — original error matters more */
    }
    // Все, що «встигло» в pending — насправді відкотилося. Перекласифікуй
    // як error, щоб метрики відображали реальний стан БД. audit-рядки
    // теж пишемо як error — вони вже виявиться поверх відкоченої
    // транзакції, бо беруться з default-го пулу, а не з `client`.
    for (const p of pending) {
      recordSync("push", p.module, "error", {
        bytes: p.bytes,
        userId: user.id,
      });
    }
    recordSync("push_all", "all", "error", {
      ms: elapsedMs(start),
      userId: user.id,
    });
    throw err;
  } finally {
    client.release();
  }

  for (const p of pending) {
    if (p.outcome === "conflict") recordConflict(p.module);
    recordSync("push", p.module, p.outcome, {
      bytes: p.bytes,
      userId: user.id,
    });
  }
  recordSync("push_all", "all", "ok", {
    ms: elapsedMs(start),
    userId: user.id,
  });
  res.json({ ok: true, results });
}
