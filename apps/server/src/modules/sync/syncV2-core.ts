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
import { NAME_MAX_LEN, NOTE_MAX_LEN } from "@sergeant/shared";

/** Re-exported so per-table `applySync*.ts` files import bounds from one place. */
export { NAME_MAX_LEN, NOTE_MAX_LEN };

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
 * Same as `parseOptionalNumber`, but out-of-`[min, max]` also counts as
 * `"invalid"` — so callers can swap in this helper without changing their
 * existing `=== "invalid"` reject branch (pre-beta input-boundaries audit:
 * `curl` bypasses client-side ceilings on macro/goal fields, e.g.
 * `nutrition_goal_periods.kcal`, which previously had no upper bound at
 * all). `min` defaults to `0` — every field this is used for is a
 * non-negative physical quantity (kcal, grams, ml).
 */
export function parseOptionalBoundedNumber(
  value: unknown,
  bounds: { min?: number; max: number },
): number | null | "invalid" {
  const n = parseOptionalNumber(value);
  if (n === "invalid" || n === null) return n;
  const min = bounds.min ?? 0;
  if (n < min || n > bounds.max) return "invalid";
  return n;
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
 *
 * Already-serialized payloads: клієнтський sync-адаптер тримає ці blob-и
 * у локальному SQLite як TEXT і шле їх рядком. Безумовний
 * `JSON.stringify` загортав такий рядок ще раз, і в `jsonb`-колонку
 * потрапляв jsonb-STRING замість обʼєкта — усі серверні
 * `data_json->>'...'` читали NULL (аудит 2026-08-04, знахідка 3;
 * backfill існуючих рядків — міграція 102). Тому рядок, який сам є
 * валідним JSON-обʼєктом/масивом, пропускаємо як є. Скалярні рядки
 * ("hello") далі серіалізуються звичайним шляхом — для них подвійного
 * загортання ніколи не існувало.
 */
export function toJsonbParam(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        JSON.parse(trimmed);
        return trimmed;
      } catch {
        /* not valid JSON — fall through to plain stringify */
      }
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/**
 * Real-world UTC offset bounds in minutes, matching the sign convention of
 * `Date.prototype.getTimezoneOffset()` (west of UTC → positive). UTC-14:00
 * (Kiribati's Line Islands) to UTC+14:00 is the full range that exists on
 * Earth today — anything outside it is malformed input, not a legitimate
 * device clock.
 */
export const TZ_OFFSET_MIN_LOWER = -14 * 60;
export const TZ_OFFSET_MIN_UPPER = 14 * 60;

/**
 * Parse `tz_offset_min` (migration 109, ADR-0078 device-local day
 * boundary). Missing or non-integer input silently falls back to `null` —
 * old clients don't send this field yet, and that absence is not an error.
 * A PRESENT value outside the real UTC-offset range `[-840, 840]` is
 * `"invalid"` (rejects the op), not silently nulled or clamped: pre-beta
 * input-boundaries audit found `curl` could set e.g. `tz_offset_min:
 * 999999` and it sailed straight through into a nullable-but-unchecked
 * column.
 */
export function parseOptionalTzOffsetMin(
  value: unknown,
): number | null | "invalid" {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < TZ_OFFSET_MIN_LOWER || value > TZ_OFFSET_MIN_UPPER) {
    return "invalid";
  }
  return value;
}

/**
 * Bound check for user-supplied name/label/note/text fields (pre-beta
 * input-boundaries audit, `docs/90-work/planning/specs/beta-input-
 * boundaries.md` Фаза 3 — сервер). Client-side bounds
 * (`apps/web/src/shared/lib/text/limits.ts`) are trivially bypassed via
 * `curl`, so every per-table applier must re-check server-side. Callers
 * keep their existing `typeof row["x"] === "string" ? row["x"] : fallback`
 * line and pass the RESOLVED value through this guard — a non-string input
 * already fell back to `""`/`null` upstream and passes this check
 * trivially (empty string is always within bound).
 *
 * `maxLen` defaults to `NAME_MAX_LEN` (200) — the shorter bound for
 * name/label-shaped fields; pass `NOTE_MAX_LEN` (1000) explicitly for
 * longer free-text fields (notes, pantry `text`).
 */
export function isWithinTextBound(
  value: string | null | undefined,
  maxLen: number = NAME_MAX_LEN,
): boolean {
  if (value == null) return true;
  return value.length <= maxLen;
}

export type { PoolClient };
export type { SyncV2Op } from "../../http/schemas.js";
