/* eslint-disable sergeant-design/no-raw-storage-key --
   Навмисний legacy-хаб прямого читання retired finyk-ключів
   (finyk_hidden_txs / finyk_tx_cats / finyk_recv / finyk_excluded_stat_txs /
   finyk_tx_splits / finyk_custom_cats_v1) для дашбордних агрегаторів без
   mounted-хука useStorage. Ключі в burn-down 2026-Q3; міграція на
   STORAGE_KEYS — окремий крок. Читання raw тут навмисне. */
import {
  buildFinykExcludedTxIds,
  buildFinykSpendingUniverse,
} from "@sergeant/finyk-domain";
import { safeReadLS } from "@shared/lib/storage/storage";
import { getVisibleFinykMonoMirrorState } from "./monoMirrorReader";
import { getCachedFinykSqliteState } from "./sqliteReader";

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
 * канонічний всесвіт витрат (банк + готівка), набір excluded id-шників (за
 * тими ж правилами що й Overview/Reports), мапу splitʼів, мапу
 * tx → categoryId та користувацькі категорії. Замість кожного разу
 * повторювати 5 викликів `safeReadLS` з різних кешів — забираємо їх в
 * одному місці.
 *
 * AI-CONTEXT (W1-CANON-AGG, стадія 2d): `txs` — це тепер `bank + manual`,
 * а не лише банк. До цього патча дайджест і коуч не бачили готівкових
 * витрат узагалі: людина, що записала 250 грн на ринку руками, читала в
 * тижневому підсумку менше, ніж витратила, а Overview на тому самому
 * пристрої показував більше. Канон finyk §5 («гібрид: банк і ручний світ
 * рівні») вимагає одного всесвіту від усіх поверхонь.
 *
 * ⚠️ Це ПЕРША зміна Хвилі 1, що піднімає видиме число, — тому вона йде
 * разом із бампом `METRICS_VERSION` (3 → 4). Тренд через цю межу будувати
 * не можна: інакше коуч прочитає стрибок визначення як «ти став витрачати
 * більше». Реєстр: docs/02-engineering/architecture/metric-registry.md.
 */
export interface FinykStatsContext {
  txs: BankTxLike[];
  excludedTxIds: Set<string>;
  txSplits: Record<string, unknown>;
  txCategories: Record<string, string>;
  customCategories: CategoryLike[];
}

export function readFinykStatsContext(): FinykStatsContext {
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

  // Ручні витрати беремо з SQLite, а не з LS: легасі-ключ
  // `finyk_manual_expenses_v1` дренається й tombstone-иться на буті, тож
  // запис, створений AI або сервером, у ньому просто не зʼявиться.
  const universe = buildFinykSpendingUniverse({
    bankTxs: getVisibleFinykMonoMirrorState().transactions,
    manualExpenses: getCachedFinykSqliteState().manualExpenses,
  });

  return {
    txs: universe.transactions as BankTxLike[],
    excludedTxIds: getFinykExcludedTxIdsFromStorage(),
    txSplits: getFinykTxSplitsFromStorage() as Record<string, unknown>,
    txCategories,
    customCategories: Array.isArray(customCategories) ? customCategories : [],
  };
}
