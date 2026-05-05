/**
 * Finyk — pure backup / sync payload helpers.
 *
 * Extracted from `apps/web/src/modules/finyk/lib/finykBackup.ts` so
 * both `apps/web` and `apps/mobile` can share the normalize + version
 * logic. The storage-bound helpers (`readFinykBackupFromStorage`,
 * `persistFinykNormalizedToStorage`) stay on the platform side — they
 * wrap `readJSON` / `writeJSON` from the local storage adapter.
 *
 * Everything here is DOM-free: no `localStorage`, no `window`,
 * no React. Safe to import from tests and from the mobile app.
 */

import { FINYK_BACKUP_STORAGE_KEYS } from "./storageKeys.js";

/** Версія формату експорту JSON (бекап). */
export const FINYK_BACKUP_VERSION = 3;

/**
 * Default monthly-plan payload used when a backup doesn't carry one.
 * Mirrors the web default used across FinykApp / Budgets.
 */
export const DEFAULT_FINYK_MONTHLY_PLAN = {
  income: "",
  expense: "",
  savings: "",
} as const;

/**
 * Shape of the JSON backup written/read by Finyk. Fields are
 * intentionally loose — the backup covers untyped legacy persisted
 * data. Tighten only with a version bump + migration.
 */
export interface FinykBackup {
  version?: number;
  budgets?: unknown[];
  subscriptions?: unknown[];
  manualAssets?: unknown[];
  manualDebts?: unknown[];
  receivables?: unknown[];
  hiddenAccounts?: unknown[];
  hiddenTxIds?: unknown[];
  monthlyPlan?: Record<string, unknown>;
  txCategories?: Record<string, unknown>;
  txSplits?: Record<string, unknown>;
  monoDebtLinkedTxIds?: Record<string, unknown>;
  networthHistory?: unknown[];
  customCategories?: unknown[];
  dismissedRecurring?: unknown[];
}

/**
 * Re-export of the backup-field → storage-key map. Kept here so
 * consumers that import from `@sergeant/finyk-domain/backup` get the
 * full picture in one namespace.
 */
export const FINYK_FIELD_TO_STORAGE_KEY = FINYK_BACKUP_STORAGE_KEYS;

function needArr(v: unknown, name: string): unknown[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) throw new Error(`Поле «${name}» має бути масивом`);
  return v;
}

function needObj(
  v: unknown,
  name: string,
): Record<string, unknown> | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "object" || Array.isArray(v))
    throw new Error(`Поле «${name}» має бути об'єктом`);
  return v as Record<string, unknown>;
}

/**
 * Перевіряє та нормалізує об'єкт бекапу для застосування в сховище.
 * Підтримує version 1 (без категорій/сплітів) і 2 (повний набір).
 */
export function normalizeFinykBackup(parsed: unknown): FinykBackup {
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Файл має містити JSON-об'єкт");
  }
  const obj = parsed as Record<string, unknown>;
  if (Object.keys(obj).length === 0) {
    throw new Error("Порожній об'єкт у файлі");
  }

  const version = typeof obj["version"] === "number" ? obj["version"] : 1;
  if (version < 1 || version > 999) {
    throw new Error("Невідома версія бекапу");
  }

  const out: FinykBackup = {};

  const b = needArr(obj["budgets"], "budgets");
  if (b) out.budgets = b;
  const s = needArr(obj["subscriptions"], "subscriptions");
  if (s) out.subscriptions = s;
  const ma = needArr(obj["manualAssets"], "manualAssets");
  if (ma) out.manualAssets = ma;
  const md = needArr(obj["manualDebts"], "manualDebts");
  if (md) out.manualDebts = md;
  const r = needArr(obj["receivables"], "receivables");
  if (r) out.receivables = r;
  const ha = needArr(obj["hiddenAccounts"], "hiddenAccounts");
  if (ha) out.hiddenAccounts = ha;
  const ht = needArr(obj["hiddenTxIds"], "hiddenTxIds");
  if (ht) out.hiddenTxIds = ht;

  if (obj["monthlyPlan"] !== undefined && obj["monthlyPlan"] !== null) {
    if (
      typeof obj["monthlyPlan"] !== "object" ||
      Array.isArray(obj["monthlyPlan"])
    ) {
      throw new Error("Поле «monthlyPlan» має бути об'єктом");
    }
    out.monthlyPlan = obj["monthlyPlan"] as Record<string, unknown>;
  }

  const tc = needObj(obj["txCategories"], "txCategories");
  if (tc) out.txCategories = tc;
  const ts = needObj(obj["txSplits"], "txSplits");
  if (ts) out.txSplits = ts;
  const mdl = needObj(obj["monoDebtLinkedTxIds"], "monoDebtLinkedTxIds");
  if (mdl) out.monoDebtLinkedTxIds = mdl;

  if (obj["networthHistory"] !== undefined && obj["networthHistory"] !== null) {
    const nh = needArr(obj["networthHistory"], "networthHistory");
    if (nh) {
      for (const row of nh) {
        if (
          !row ||
          typeof row !== "object" ||
          typeof (row as { month?: unknown }).month !== "string"
        ) {
          throw new Error("Некоректний запис у networthHistory");
        }
      }
      out.networthHistory = nh;
    }
  }

  const cc = needArr(obj["customCategories"], "customCategories");
  if (cc) {
    for (const row of cc) {
      const rec = row as { id?: unknown; label?: unknown } | null;
      if (
        !rec ||
        typeof rec !== "object" ||
        typeof rec.id !== "string" ||
        typeof rec.label !== "string"
      ) {
        throw new Error("Некоректний запис у customCategories");
      }
    }
    out.customCategories = cc;
  }

  const dr = needArr(obj["dismissedRecurring"], "dismissedRecurring");
  if (dr) {
    for (const item of dr) {
      if (typeof item !== "string") {
        throw new Error("Некоректний запис у dismissedRecurring");
      }
    }
    out.dismissedRecurring = dr;
  }

  if (Object.keys(out).length === 0) {
    throw new Error(
      "У файлі немає даних для імпорту (очікуйте поля бекапу ФІНІК)",
    );
  }

  return out;
}

/**
 * Дані з ?sync= (компактні ключі b,s,a… або повний JSON бекапу).
 * Повертає те саме, що normalizeFinykBackup, для applyData.
 */
export function normalizeFinykSyncPayload(data: unknown): FinykBackup {
  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Некоректні дані синку");
  }
  const d = data as Record<string, unknown>;

  const has = (k: string) => Object.prototype.hasOwnProperty.call(d, k);
  const looksLikeFullBackup =
    has("version") ||
    has("budgets") ||
    has("subscriptions") ||
    has("manualAssets") ||
    has("manualDebts") ||
    has("receivables") ||
    has("hiddenAccounts") ||
    has("hiddenTxIds") ||
    has("monthlyPlan") ||
    has("txCategories") ||
    has("txSplits") ||
    has("monoDebtLinkedTxIds") ||
    has("networthHistory") ||
    has("customCategories") ||
    has("dismissedRecurring");

  if (looksLikeFullBackup) {
    const withVer = has("version") ? d : { ...d, version: 1 };
    return normalizeFinykBackup(withVer);
  }

  const v = typeof d["v"] === "number" ? d["v"] : 1;
  if (v < 1 || v > 99) {
    throw new Error("Невідома версія синку");
  }

  const full: FinykBackup = { version: FINYK_BACKUP_VERSION };
  if (has("b")) full.budgets = d["b"] as unknown[];
  if (has("s")) full.subscriptions = d["s"] as unknown[];
  if (has("a")) full.manualAssets = d["a"] as unknown[];
  if (has("d")) full.manualDebts = d["d"] as unknown[];
  if (has("r")) full.receivables = d["r"] as unknown[];
  if (has("h")) full.hiddenAccounts = d["h"] as unknown[];
  if (has("mp")) full.monthlyPlan = d["mp"] as Record<string, unknown>;
  if (has("tc")) full.txCategories = d["tc"] as Record<string, unknown>;
  if (has("ts")) full.txSplits = d["ts"] as Record<string, unknown>;
  if (has("md")) full.monoDebtLinkedTxIds = d["md"] as Record<string, unknown>;
  if (has("nh")) full.networthHistory = d["nh"] as unknown[];
  if (has("cc")) full.customCategories = d["cc"] as unknown[];
  if (has("dr")) full.dismissedRecurring = d["dr"] as unknown[];

  return normalizeFinykBackup(full);
}
