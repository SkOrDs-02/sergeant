import type { Request } from "express";
import type { PoolClient } from "pg";
import pool from "../../db.js";
import { logger } from "../../obs/logger.js";
import {
  syncDurationMs,
  syncOperationsTotal,
  syncPayloadBytes,
} from "../../obs/metrics.js";
import type { SyncV2Outcome } from "./syncV2-types.js";

/**
 * syncV2-core — спільні хелпери, які викликаються з per-module
 * `applySync.ts` файлів та з самого `syncV2.ts`-оркестратора.
 *
 * Module label для метрик/логів — стабільний `v2`, незалежно від `table`.
 */
export const SYNC_V2_MODULE = "v2";

export type SyncV2OpKind = "v2_push" | "v2_pull";

/**
 * Maximum tolerated forward clock skew. Клієнти, що надсилають
 * `client_ts > server_ts + 1h`, відхиляються — інакше їхній
 * "майбутній" timestamp перевертатиме LWW і ламатиме реплікацію
 * для нормальних пристроїв.
 */
export const CLOCK_SKEW_FORWARD_MS = 60 * 60 * 1000;

/**
 * Maximum allowed |delta| in a single `op='increment'` payload. PN-counter
 * primitive is built for ±1 toggles (one habit-completion per emit), so
 * a hard cap at 1000 keeps a malformed/malicious client from corrupting
 * the streak counter with `delta=Number.MAX_SAFE_INTEGER`. INTEGER
 * column overflow would otherwise raise PG `numeric value out of range`
 * inside the SAVEPOINT — the cap turns it into a clean apply-level
 * `invalid_delta` reject before DML.
 */
export const INCREMENT_DELTA_MAX_ABS = 1000;

/**
 * Captured truncated header. `X-Origin-Device-Id` — опціональний
 * client-supplied ідентифікатор пристрою; `pull` виключає ops з тим
 * самим device-id, щоб клієнт не реплеїв власні writes. Обмежуємо
 * довжину до 64 char, щоб уникнути smuggle-атак на JSON-fields.
 */
export function readOriginDeviceId(req: Request): string | null {
  const raw = req.headers["x-origin-device-id"];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 64);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Спільне місце: метрика + structured `sync_event` лог + audit-row.
 * Дублює форму `recordSync` з v1 (`./sync.ts`), але з власним вузьким
 * контрактом outcome (включаючи `partial`) і модулем `v2` за
 * замовчуванням.
 */
export function recordSyncV2(
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
 * Parse a possibly-string / Date / null field into a `Date` instance, or
 * return `"invalid"` when the input is unparseable, or `null` when
 * absent. Used by every per-table apply-fn for timestamp fields
 * (`completed_at`, `created_at`, `updated_at`, `deleted_at`, …).
 */
export function parseOptionalDate(value: unknown): Date | null | "invalid" {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "invalid" : value;
  }
  if (typeof value !== "string") return "invalid";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

/**
 * Same as `parseOptionalDate` but treats `null`/`undefined`/missing as
 * `"invalid"` instead of `null` — for fields that are NOT NULL in the
 * table (`started_at`, `measured_at`, `eaten_at`, …).
 */
export function parseRequiredDate(value: unknown): Date | "invalid" {
  if (value == null) return "invalid";
  const parsed = parseOptionalDate(value);
  if (parsed === null) return "invalid";
  return parsed;
}

/**
 * Coerce an unknown into a non-negative integer. Returns `null` when
 * the value is not a finite number, not an integer, or negative.
 * Used for counters (`sort_order`, `current_streak`, `longest_streak`).
 */
export function toNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return null;
  return Math.floor(value);
}

/**
 * Parse a value that may already be a `number` or a stringified number
 * (clients sometimes stringify JSON). Returns `null` when absent,
 * `"invalid"` when unparseable.
 */
export function parseOptionalNumber(value: unknown): number | null | "invalid" {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : "invalid";
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : "invalid";
  }
  return "invalid";
}

/**
 * Same as `parseOptionalNumber` but floors to integer. Used for `kcal`,
 * `reps`, `duration_sec`, `distance_m`, `energy_level`, `mood`.
 */
export function parseOptionalInt(value: unknown): number | null | "invalid" {
  const n = parseOptionalNumber(value);
  if (n === "invalid") return "invalid";
  if (n === null) return null;
  return Math.floor(n);
}

/**
 * Serialize a JSONB-bound value before binding to a `pg` parameter.
 *
 * Why an explicit helper: `pg` will silently coerce a JS object to its
 * default `toString()` form when bound to a `JSONB` column with the
 * default OID inference, producing `"[object Object]"`. Passing
 * `JSON.stringify(value)` forces the string path, which Postgres parses
 * as `JSONB`. `null`/`undefined` short-circuit so the column gets a
 * proper SQL NULL.
 */
export function toJsonbParam(value: unknown): string | null {
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export type { PoolClient };
export type { SyncV2Op } from "../../http/schemas.js";
