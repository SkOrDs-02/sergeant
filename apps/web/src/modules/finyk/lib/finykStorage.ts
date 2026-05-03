/**
 * Централізований storage-шар модуля ФІНІК.
 *
 * Тонкий wrapper над shared `createModuleStorage(prefix)` — вся логіка
 * safe-parse, debounce + skip-if-equal, guaranteed flush on page hide
 * живе у `@shared/lib/storage/createModuleStorage`. Тут лишився тільки доменний API
 * (getTransactions/saveTransactions, getCategories/saveCategories,
 * getBudget/saveBudget) і реекспорт менеджера міграцій.
 *
 * Ключі залишаються ті самі, що вже використовуються застосунком. Міграції
 * "finto_*" → "finyk_*" виконуються через shared `storageManager`.
 */

import { createModuleStorage } from "@shared/lib/storage/createModuleStorage";
import { finykStorageManager } from "./storageManager";
import type {
  Budget,
  Category,
  Transaction,
} from "@sergeant/finyk-domain/domain/types";
import {
  FINYK_STORAGE_KEYS,
  type FinykStorageKey,
} from "@sergeant/finyk-domain/storage-keys";
import { BudgetsSchema } from "@sergeant/shared";

// Re-export the storage keys so existing web call sites keep working
// without updating imports. New code (and mobile) should import from
// `@sergeant/finyk-domain/storage-keys` directly.
export { FINYK_STORAGE_KEYS };
export type { FinykStorageKey };

// Типи створюються локально, бо createModuleStorage.js — untyped JS.
// Сигнатури повторюють публічний API фабрики.
interface ModuleStorage {
  readJSON: <T = unknown>(key: string, fallback?: T | null) => T | null;
  writeJSON: (key: string, value: unknown) => boolean;
  readRaw: (key: string, fallback?: string | null) => string | null;
  writeRaw: (key: string, value: unknown) => boolean;
  removeItem: (key: string) => boolean;
  writeJSONDebounced: (key: string, value: unknown, delay?: number) => void;
  flushPendingWrites: () => void;
}

const storage = createModuleStorage({ name: "finyk" }) as ModuleStorage;

export const {
  readJSON,
  writeJSON,
  readRaw,
  writeRaw,
  removeItem,
  writeJSONDebounced,
  flushPendingWrites,
} = storage;

// ─────────────────────────────────────────────────────────────────────────────
// Доменний API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Повертає список вручну доданих транзакцій (finyk_manual_expenses_v1).
 */
export function getTransactions(): Transaction[] {
  const v = readJSON<Transaction[]>(FINYK_STORAGE_KEYS.transactions, []);
  return Array.isArray(v) ? v : [];
}

/**
 * Зберігає список вручну доданих транзакцій (debounced + skip-if-equal).
 */
export function saveTransactions(
  transactions: readonly Transaction[] | null | undefined,
): void {
  const value = Array.isArray(transactions) ? transactions : [];
  writeJSONDebounced(FINYK_STORAGE_KEYS.transactions, value);
}

/**
 * Повертає кастомні категорії користувача (finyk_custom_cats_v1).
 */
export function getCategories(): Category[] {
  const v = readJSON<Category[]>(FINYK_STORAGE_KEYS.categories, []);
  return Array.isArray(v) ? v : [];
}

/**
 * Зберігає кастомні категорії користувача (debounced + skip-if-equal).
 */
export function saveCategories(
  categories: readonly Category[] | null | undefined,
): void {
  const value = Array.isArray(categories) ? categories : [];
  writeJSONDebounced(FINYK_STORAGE_KEYS.categories, value);
}

/**
 * Повертає конфіг бюджетів (finyk_budgets).
 * Дані валідуються zod-схемою: записи з пошкодженими полями дропаються
 * (замість падіння у споживачів), решта повертається як є.
 */
export function getBudget(): Budget[] {
  const raw = readJSON<unknown>(FINYK_STORAGE_KEYS.budget, []);
  if (!Array.isArray(raw)) return [];
  const result = BudgetsSchema.safeParse(raw);
  if (result.success) return result.data as Budget[];
  // Одиничні биті записи не повинні руйнувати весь список — фільтруємо.
  const clean: Budget[] = [];
  for (const item of raw) {
    const one = BudgetsSchema.element.safeParse(item);
    if (one.success) clean.push(one.data as Budget);
  }
  return clean;
}

/**
 * Зберігає конфіг бюджетів (debounced + skip-if-equal).
 */
export function saveBudget(budget: readonly Budget[] | null | undefined): void {
  const value = Array.isArray(budget) ? budget : [];
  writeJSONDebounced(FINYK_STORAGE_KEYS.budget, value);
}

// Реекспорт менеджера міграцій — щоб споживачі імпортували все з одного модуля.
export { finykStorageManager };
