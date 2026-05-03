import { safeReadLS } from "@shared/lib/storage/storage";
import { INTERNAL_TRANSFER_ID } from "../constants";

// Збирає Set ID транзакцій, що виключаються зі статистики ФІНІК (та сама логіка, що
// в `useStorage` → `excludedTxIds`), читаючи безпосередньо з localStorage.
// Це дозволяє іншим сторінкам (Звіти, AI Digest) використовувати ту саму логіку
// без mounted-хука useStorage.
export function getFinykExcludedTxIdsFromStorage() {
  const hidden = safeReadLS<string[]>("finyk_hidden_txs", []);
  const txCats = safeReadLS<Record<string, string>>("finyk_tx_cats", {});
  const recv = safeReadLS<Array<{ linkedTxIds?: string[] }>>("finyk_recv", []);
  const extra = safeReadLS<string[]>("finyk_excluded_stat_txs", []);
  const transferIds = Object.entries(
    txCats && typeof txCats === "object" ? txCats : {},
  )
    .filter(([, v]) => v === INTERNAL_TRANSFER_ID)
    .map(([k]) => k);
  const recvIds = Array.isArray(recv)
    ? recv.flatMap((r) => (Array.isArray(r?.linkedTxIds) ? r.linkedTxIds : []))
    : [];
  return new Set([
    ...(Array.isArray(hidden) ? hidden : []),
    ...transferIds,
    ...recvIds,
    ...(Array.isArray(extra) ? extra : []),
  ]);
}

export function getFinykTxSplitsFromStorage() {
  const v = safeReadLS("finyk_tx_splits", {});
  return v && typeof v === "object" ? v : {};
}

interface BankTxLike {
  id: string;
  amount: number;
  time?: number;
  mcc?: number;
  description?: string;
}

interface CategoryLike {
  id: string;
  label?: string;
  name?: string;
  mccs?: number[];
}

/**
 * Повертає весь контекст, потрібний для агрегації Фінік-транзакцій
 * дашбордними споживачами (`useWeeklyDigest`, `useCoachInsight` тощо):
 * список банківських транзакцій з кешу, набір excluded id-шників (за тими
 * ж правилами що й Overview/Reports), мапу spli-ів, мапу tx → categoryId
 * та користувацькі категорії. Замість кожного разу повторювати 5 викликів
 * `safeReadLS` з різних кешів — забираємо їх в одному місці.
 */
export interface FinykStatsContext {
  txs: BankTxLike[];
  excludedTxIds: Set<string>;
  txSplits: Record<string, unknown>;
  txCategories: Record<string, string>;
  customCategories: CategoryLike[];
}

export function readFinykStatsContext(): FinykStatsContext {
  const txRaw = safeReadLS<{ txs?: BankTxLike[] } | BankTxLike[] | null>(
    "finyk_tx_cache",
    null,
  );
  const txs: BankTxLike[] = Array.isArray(txRaw)
    ? txRaw
    : Array.isArray(txRaw?.txs)
      ? txRaw.txs
      : [];
  const txCategoriesRaw = safeReadLS<Record<string, string>>(
    "finyk_tx_cats",
    {},
  );
  const txCategories =
    txCategoriesRaw && typeof txCategoriesRaw === "object"
      ? txCategoriesRaw
      : {};
  const customCategories =
    safeReadLS<CategoryLike[]>("finyk_custom_cats_v1", []) || [];
  return {
    txs,
    excludedTxIds: getFinykExcludedTxIdsFromStorage(),
    txSplits: getFinykTxSplitsFromStorage() as Record<string, unknown>,
    txCategories,
    customCategories: Array.isArray(customCategories) ? customCategories : [],
  };
}
