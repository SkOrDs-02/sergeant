import { INTERNAL_TRANSFER_ID } from "../constants";
import { getExpenseCategoryForTransaction } from "./categories.js";

/**
 * Мінімальна форма транзакції, достатня для spend-селекторів.
 * Реальний `Transaction` з `domain/types.ts` її розширює — тут
 * лишаємо вузький контракт, щоб функції працювали і з legacy-обʼєктами.
 */
export interface SpendingTxLike {
  id: string;
  amount: number;
  description?: string;
  mcc?: number;
  categoryId?: string | undefined;
}

/**
 * Split однієї транзакції у спліт-мапі. Поля опціональні, щоб прийняти
 * і strict-типізовані (мобільні) payload-и, і легасі `unknown[]` каст з
 * `apps/web` без змін у web-коді.
 */
export interface SpendingSplitLike {
  categoryId?: string;
  amount?: number;
}

export type TxCategoriesLike = Record<string, string | undefined>;
/**
 * Спліт-мапа транзакцій. Значення — довільне `unknown`; функції, що
 * читають сплити, звужують до `SpendingSplitLike[]` у місці використання,
 * щоб і web (`Record<string, unknown>`, `Record<string, unknown[]>`), і
 * mobile (`Record<string, TxSplit[]>`) могли викликати їх без змін.
 */
export type TxSplitsLike = Record<string, unknown>;

// Ефективна сума транзакції для статистики витрат (враховує спліт).
// Якщо є спліт — сумує лише частини що НЕ є внутрішнім переказом.
function readSplits(
  txSplits: TxSplitsLike,
  id: string,
): readonly SpendingSplitLike[] {
  const v = txSplits[id];
  return Array.isArray(v) ? (v as readonly SpendingSplitLike[]) : [];
}

/**
 * `tx.time` seconds-vs-milliseconds coercion. Finyk stores mono/legacy
 * timestamps as unix seconds, but some sources (import, AI) already hand
 * back milliseconds. `1e10` (~year 2286 in seconds) is the disambiguation
 * threshold — a domain decision that used to sit unnamed in nine call
 * sites across finyk-domain/web/insights (§2.10 audit finding).
 */
export function txTimeMs(time: number | null | undefined): number {
  const raw = time ?? 0;
  if (!Number.isFinite(raw)) return Number.NaN;
  return raw > 1e10 ? raw : raw * 1000;
}

export function getTxStatAmount(
  tx: SpendingTxLike,
  txSplits: TxSplitsLike = {},
): number {
  const splits = readSplits(txSplits, tx.id);
  if (splits.length === 0) return Math.abs(tx.amount / 100);
  return splits
    .filter((s) => s.categoryId !== INTERNAL_TRANSFER_ID)
    .reduce((s, p) => s + (p.amount || 0), 0);
}

// Сума витрат по категорії. txSplits дозволяє розбити одну транзакцію на декілька категорій.
export function calcCategorySpent(
  txs: readonly SpendingTxLike[],
  categoryId: string,
  txCategories: TxCategoriesLike = {},
  txSplits: TxSplitsLike = {},
  customCategories: readonly unknown[] = [],
): number {
  return Math.round(
    txs
      .filter((t) => t.amount < 0)
      .reduce((sum: number, t) => {
        const splits = readSplits(txSplits, t.id);
        if (splits.length > 0) {
          return (
            sum +
            splits
              .filter((s) => s.categoryId === categoryId)
              .reduce((s, p) => s + (p.amount || 0), 0)
          );
        }
        if (
          getExpenseCategoryForTransaction(
            t,
            txCategories[t.id] ?? null,
            customCategories,
          ).id === categoryId
        ) {
          return sum + Math.abs(t.amount / 100);
        }
        return sum;
      }, 0),
  );
}
