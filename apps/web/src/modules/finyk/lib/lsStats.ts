/* eslint-disable sergeant-design/no-raw-storage-key --
   Cold-cache fallback читає retired finyk-ключі
   (finyk_hidden_txs / finyk_tx_cats / finyk_recv / finyk_excluded_stat_txs /
   finyk_tx_splits / finyk_custom_cats_v1) напряму — це і є призначення
   модуля: дашбордні агрегатори працюють поза mounted-хуком useStorage.
   Канонічне джерело — SQLite (див. AI-CONTEXT нижче); LS лишається лише на
   перший кадр, поки кеш холодний. Ключі в burn-down 2026-Q3. */
import {
  buildFinykExcludedTxIds,
  buildFinykSpendingUniverse,
} from "@sergeant/finyk-domain";
import { safeReadLS } from "@shared/lib/storage/storage";
import { getVisibleFinykMonoMirrorState } from "./monoMirrorReader";
import { getCachedFinykSqliteState } from "./sqliteReader";

/**
 * Прочитані персональні налаштування Фініка, з яких збирається excluded-set
 * і розкриваються категорії.
 *
 * AI-CONTEXT (bug 2026-08-09, тижневий дайджест): усі шість ключів нижче
 * **tombstoned** (`@deprecated Stage 8 PR #057k` / `Stage 13 PR #075` у
 * `packages/shared/src/lib/storageKeys.ts`). `useReadonlyPersist` більше в
 * них НЕ пише — єдиний sink це dual-write у SQLite, а residual-import
 * дренає LS на буті. Тобто читання лише з LS повертало порожньо на будь-
 * якому пристрої, де drain уже відпрацював: дайджест і коуч не бачили ані
 * оверрайдів категорій, ані позначки «внутрішній переказ». Наслідок, який
 * бачив користувач: переказ між власними картками рахувався витратою і
 * друкувався сирим `MCC 4829`, хоча в модулі Фінік він давно позначений
 * переказом. Той самий клас багу вже ловили в дайджесті для звичок
 * (`hub_routine_v1`, PR #057r) і для `monthlyBudget` (PR #072) — тут він
 * лишався на шести останніх ключах.
 *
 * Тому канонічне джерело — SQLite warm cache; LS лишається синхронним
 * fallback-ом рівно на той кадр, поки кеш іще холодний
 * (`refreshedAt === null`) — так само, як це робить `useFinykStorageSlots`
 * для самого модуля.
 */
interface FinykPrefsSources {
  hiddenTxIds: string[];
  txCategories: Record<string, string>;
  receivables: Array<{ linkedTxIds?: string[] }>;
  excludedStatTxIds: string[];
  txSplits: Record<string, unknown>;
  customCategories: CategoryLike[];
}

function asObject<T extends object>(value: unknown, fallback: T): T {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as T)
    : fallback;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function readFinykPrefsSources(): FinykPrefsSources {
  const cache = getCachedFinykSqliteState();
  if (cache.refreshedAt !== null) {
    return {
      hiddenTxIds: cache.hiddenTransactions,
      txCategories: cache.txCategories as Record<string, string>,
      receivables: cache.receivables as Array<{ linkedTxIds?: string[] }>,
      // `excludedStatTxIds` — singleton із `finyk_prefs`: `null` означає
      // «рядка ще нема», а не «список порожній».
      excludedStatTxIds: cache.excludedStatTxIds ?? [],
      txSplits: cache.txSplits as Record<string, unknown>,
      customCategories: cache.customCategories as CategoryLike[],
    };
  }
  return {
    hiddenTxIds: asArray<string>(safeReadLS<string[]>("finyk_hidden_txs", [])),
    txCategories: asObject<Record<string, string>>(
      safeReadLS<Record<string, string>>("finyk_tx_cats", {}),
      {},
    ),
    receivables: asArray<{ linkedTxIds?: string[] }>(
      safeReadLS<Array<{ linkedTxIds?: string[] }>>("finyk_recv", []),
    ),
    excludedStatTxIds: asArray<string>(
      safeReadLS<string[]>("finyk_excluded_stat_txs", []),
    ),
    txSplits: asObject<Record<string, unknown>>(
      safeReadLS("finyk_tx_splits", {}),
      {},
    ),
    customCategories: asArray<CategoryLike>(
      safeReadLS<CategoryLike[]>("finyk_custom_cats_v1", []),
    ),
  };
}

// Збирає Set ID транзакцій, що виключаються зі статистики ФІНІК (та сама
// логіка, що в `useStorage` → `excludedTxIds`), читаючи канонічний SQLite-кеш
// (з LS-fallback-ом на холодний кеш). Це дозволяє іншим сторінкам (Звіти,
// AI Digest) використовувати ту саму логіку без mounted-хука useStorage.
export function getFinykExcludedTxIdsFromStorage() {
  // Читання ключів лишається тут (це і є призначення модуля), а сам набір
  // збирає канонічна `buildFinykExcludedTxIds` — та сама, що обслуговує
  // HubChat-контекст і quick-stats.
  const prefs = readFinykPrefsSources();
  return buildFinykExcludedTxIds({
    hiddenTxIds: prefs.hiddenTxIds,
    txCategories: prefs.txCategories,
    receivables: prefs.receivables,
    excludedStatTxIds: prefs.excludedStatTxIds,
  });
}

export function getFinykTxSplitsFromStorage() {
  return readFinykPrefsSources().txSplits;
}

interface BankTxLike {
  id: string;
  amount: number;
  time?: number;
  mcc?: number;
  description?: string;
  categoryId?: string | undefined;
  type?: string | undefined;
  manual?: boolean | undefined;
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
  const prefs = readFinykPrefsSources();

  // Ручні витрати беремо з SQLite, а не з LS: легасі-ключ
  // `finyk_manual_expenses_v1` дренається й tombstone-иться на буті, тож
  // запис, створений AI або сервером, у ньому просто не зʼявиться.
  const universe = buildFinykSpendingUniverse({
    bankTxs: getVisibleFinykMonoMirrorState().transactions,
    manualExpenses: getCachedFinykSqliteState().manualExpenses,
    hiddenTxIds: prefs.hiddenTxIds,
    txCategories: prefs.txCategories,
    receivables: prefs.receivables,
    excludedStatTxIds: prefs.excludedStatTxIds,
  });

  return {
    txs: universe.transactions as BankTxLike[],
    // Excluded-set бере і мапу оверрайдів, і мітку на самій транзакції
    // (`categoryId`/`type` === переказ) — саме тому він рахується з
    // `universe`, а не окремим викликом на самих лише ключах.
    excludedTxIds: universe.excludedTxIds,
    txSplits: prefs.txSplits,
    txCategories: prefs.txCategories,
    customCategories: prefs.customCategories,
  };
}
