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
  /** Ручні операції. Див. `FINYK_BACKUP_STORAGE_KEYS.manualExpenses`. */
  manualExpenses?: unknown[];
  manualAssets?: unknown[];
  manualDebts?: unknown[];
  receivables?: unknown[];
  hiddenAccounts?: unknown[];
  hiddenTxIds?: unknown[];
  excludedStatTxIds?: unknown[];
  monthlyPlan?: Record<string, unknown>;
  txCategories?: Record<string, unknown>;
  txSplits?: Record<string, unknown>;
  /**
   * Нотатки до банківських операцій (`txId → текст`, лише LS пристрою).
   * Необовʼязкове поле: старі файли його не мають.
   */
  txNotes?: Record<string, string>;
  monoDebtLinkedTxIds?: Record<string, unknown>;
  networthHistory?: unknown[];
  customCategories?: unknown[];
  dismissedRecurring?: unknown[];
  /**
   * Правила «Завжди так для цього магазину» (`MerchantRule[]`, 2026-10-01).
   * Необовʼязкове поле: старі файли його не мають і лишають правила на
   * пристрої як є.
   */
  merchantRules?: unknown[];
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
    throw new Error(`Поле «${name}» має бути обʼєктом`);
  return v as Record<string, unknown>;
}

/**
 * Перевіряє та нормалізує обʼєкт бекапу для застосування в сховище.
 * Підтримує version 1 (без категорій/сплітів) і 2 (повний набір).
 */
export function normalizeFinykBackup(parsed: unknown): FinykBackup {
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Файл має містити JSON-обʼєкт");
  }
  const obj = parsed as Record<string, unknown>;
  if (Object.keys(obj).length === 0) {
    throw new Error("Порожній обʼєкт у файлі");
  }

  const version = typeof obj["version"] === "number" ? obj["version"] : 1;
  if (version < 1 || version > 999) {
    throw new Error("Невідома версія бекапу");
  }

  const out: FinykBackup = {};

  const ARRAY_FIELDS = [
    "budgets",
    "subscriptions",
    "manualExpenses",
    "manualAssets",
    "manualDebts",
    "receivables",
    "hiddenAccounts",
    "hiddenTxIds",
    "excludedStatTxIds",
    "merchantRules",
  ] as const;
  for (const field of ARRAY_FIELDS) {
    const v = needArr(obj[field], field);
    if (v) out[field] = v;
  }

  if (obj["monthlyPlan"] !== undefined && obj["monthlyPlan"] !== null) {
    if (
      typeof obj["monthlyPlan"] !== "object" ||
      Array.isArray(obj["monthlyPlan"])
    ) {
      throw new Error("Поле «monthlyPlan» має бути обʼєктом");
    }
    out.monthlyPlan = obj["monthlyPlan"] as Record<string, unknown>;
  }

  const OBJECT_FIELDS = [
    "txCategories",
    "txSplits",
    "monoDebtLinkedTxIds",
  ] as const;
  for (const field of OBJECT_FIELDS) {
    const v = needObj(obj[field], field);
    if (v) out[field] = v;
  }

  const notes = needObj(obj["txNotes"], "txNotes");
  if (notes) {
    for (const note of Object.values(notes)) {
      if (typeof note !== "string") {
        throw new Error("Некоректний запис у txNotes");
      }
    }
    out.txNotes = notes as Record<string, string>;
  }

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
