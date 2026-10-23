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

/** Текст відмови для файлу з версією, новішою за {@link FINYK_BACKUP_VERSION}. */
export const FINYK_BACKUP_NEWER_VERSION_MESSAGE =
  "Файл з новішої версії застосунку, онови сторінку";

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
  /** Теги операцій (`txId → string[]`, спека finyk-analytics-v3 Р6). */
  txTags?: Record<string, string[]>;
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
  /**
   * «Готівка на руках» (`CashOnHandState`, ADR-0076). Необовʼязкове поле:
   * файл без нього лишає рахунок на пристрої як є.
   */
  cashOnHand?: Record<string, unknown>;
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

/** Поля-масиви, де кожен елемент це рядок-id. */
const STRING_ITEM_FIELDS: ReadonlySet<string> = new Set([
  "hiddenAccounts",
  "hiddenTxIds",
  "excludedStatTxIds",
]);

/**
 * Типи елементів масивів до запису (аудит 2026-10-01, data-34). Нижче за
 * течією `blobsFromArray` / `idsFromArray` мовчки відкидають усе, що не
 * схоже на рядок із рядковим `id`, тож без цієї перевірки зіпсований елемент
 * зникав би з відновлених даних без жодної помилки.
 */
function checkArrayItems(field: string, items: unknown[]): void {
  const bad = new Error(`Некоректний запис у «${field}»`);
  if (STRING_ITEM_FIELDS.has(field)) {
    if (items.some((t) => typeof t !== "string" || t.length === 0)) throw bad;
    return;
  }
  if (field === "merchantRules") {
    // Правила мерчантів чистить власний санітайзер; тут лише форма елемента.
    if (items.some((r) => !r || typeof r !== "object" || Array.isArray(r))) {
      throw bad;
    }
    return;
  }
  for (const row of items) {
    if (
      !row ||
      typeof row !== "object" ||
      Array.isArray(row) ||
      typeof (row as { id?: unknown }).id !== "string" ||
      (row as { id: string }).id.length === 0
    ) {
      throw bad;
    }
  }
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

  // За замовчуванням 1 лише для ВІДСУТНЬОГО поля: `"4"` чи `null` у файлі -
  // невідома версія, а не мовчазне читання за схемою v1.
  const version = obj["version"] === undefined ? 1 : obj["version"];
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    throw new Error("Невідома версія бекапу");
  }
  // Файл новішої версії читати «по-старому» не можна: невідомі поля мовчки
  // втратяться (аудит 2026-10-01, data-34). Відхиляємо до будь-якого запису.
  if (version > FINYK_BACKUP_VERSION) {
    throw new Error(FINYK_BACKUP_NEWER_VERSION_MESSAGE);
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
    if (v) {
      checkArrayItems(field, v);
      out[field] = v;
    }
  }

  const cash = obj["cashOnHand"];
  if (cash && typeof cash === "object" && !Array.isArray(cash)) {
    out.cashOnHand = cash as Record<string, unknown>;
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

  const tags = needObj(obj["txTags"], "txTags");
  if (tags) {
    for (const list of Object.values(tags)) {
      if (!Array.isArray(list) || list.some((t) => typeof t !== "string")) {
        throw new Error("Некоректний запис у txTags");
      }
    }
    out.txTags = tags as Record<string, string[]>;
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
