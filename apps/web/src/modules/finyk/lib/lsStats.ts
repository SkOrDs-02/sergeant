/* eslint-disable sergeant-design/no-raw-storage-key --
   Навмисний legacy-хаб прямого читання retired finyk-ключів
   (finyk_hidden_txs / finyk_tx_cats / finyk_recv / finyk_excluded_stat_txs /
   finyk_tx_splits / finyk_custom_cats_v1) для дашбордних агрегаторів без
   mounted-хука useStorage. Ключі в burn-down 2026-Q3; міграція на
   STORAGE_KEYS — окремий крок. Читання raw тут навмисне. */
import { buildFinykExcludedTxIds } from "@sergeant/finyk-domain";
import { safeReadLS } from "@shared/lib/storage/storage";
import { getVisibleFinykMonoMirrorState } from "./monoMirrorReader";

// Збирає Set ID транзакцій, що виключаються зі статистики ФІНІК (та сама логіка, що
// в `useStorage` → `excludedTxIds`), читаючи безпосередньо з localStorage.
// Це дозволяє іншим сторінкам (Звіти, AI Digest) використовувати ту саму логіку
// без mounted-хука useStorage.
export function getFinykExcludedTxIdsFromStorage() {
  // Читання ключів лишається тут (це і є призначення модуля), а сам набір
  // збирає канонічна `buildFinykExcludedTxIds` — та сама, що обслуговує
  // HubChat-контекст і quick-stats. Заміна zero-delta: попередня ручна
  // збірка вже мала всі чотири частини, тож жодне число не зрушило.
  return buildFinykExcludedTxIds({
    hiddenTxIds: safeReadLS<string[]>("finyk_hidden_txs", []),
    txCategories: safeReadLS<Record<string, string>>("finyk_tx_cats", {}),
    receivables: safeReadLS<Array<{ linkedTxIds?: string[] }>>(
      "finyk_recv",
      [],
    ),
    excludedStatTxIds: safeReadLS<string[]>("finyk_excluded_stat_txs", []),
  });
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
  const txs: BankTxLike[] = getVisibleFinykMonoMirrorState().transactions;
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
