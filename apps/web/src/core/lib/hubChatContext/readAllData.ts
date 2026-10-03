// AI-CONTEXT: УСІ фінансові слайси беруться з канонічного кешу SQLite
// (`getCachedFinykSqliteState`), а не з kv-ключів `finyk_*`: UI їх не пише
// (data-08), і [План]/[Борги] у контексті асистента будувались із порожнього
// kv. Два tombstoned-ключі (finyk_tx_cache / finyk_info_cache) прибрано в
// Dual-write teardown Phase 3 і замінено mirror-читачем нижче.
import { buildFinykSpendingUniverse } from "@sergeant/finyk-domain";
import { withMerchantRuleOverrides } from "@sergeant/finyk-domain/lib/merchantRuleOverrides";
import { buildMerchantRuleIndex } from "@sergeant/finyk-domain/lib/merchantRules";

import { getVisibleFinykMonoMirrorState } from "../../../modules/finyk/lib/monoMirrorReader";
import { getCachedFinykSqliteState } from "../../../modules/finyk/lib/sqliteReader";
import type {
  AllData,
  Budget,
  Debt,
  MonthlyPlan,
  Receivable,
  Subscription,
} from "./types";

export function readAllData(): AllData {
  const mirror = getVisibleFinykMonoMirrorState();

  const transactions = mirror.transactions;
  const accounts = mirror.accounts as AllData["accounts"];
  const clientName = "";
  const cacheTime = mirror.refreshedAt
    ? new Date(mirror.refreshedAt).getTime()
    : null;

  // Холодний кеш віддає порожні слайси (EMPTY_CACHE) — як і раніше порожній kv.
  const sqlite = getCachedFinykSqliteState();
  const hiddenAccounts: string[] = sqlite.hiddenAccounts;
  const budgets = sqlite.budgets as Budget[];
  const manualDebts = sqlite.manualDebts as Debt[];
  const receivables = sqlite.receivables as Receivable[];
  const hiddenTxIds: string[] = sqlite.hiddenTransactions;
  const txCategories = sqlite.txCategories as Record<string, string>;
  const txSplits = sqlite.txSplits as Record<string, unknown>;
  const customCategories: unknown[] = sqlite.customCategories;
  const monthlyPlan = (sqlite.monthlyPlan ?? {}) as MonthlyPlan;
  const subscriptions = sqlite.subscriptions as Subscription[];
  const monoDebtLinked = sqlite.monoDebtLinkedTxIds as Record<string, unknown>;

  // AI-CONTEXT: канонічний всесвіт витрат (Хвиля 1, W1-CANON-AGG).
  // Стадія 2а: excluded-set більше не збирається вручну з ТРЬОХ частин —
  // раніше мовчки губилася четверта, `finyk_excluded_stat_txs`, тобто
  // транзакції, які користувач явно позначив «виключити зі статистики».
  // Стадія 2d: до всесвіту додано ГОТІВКУ (ручні витрати з SQLite), тож
  // чат більше не називає меншу суму, ніж дайджест і Звіти на тих самих
  // даних. Канон finyk §5 («банк і ручний світ рівні») вимагає одного
  // всесвіту на всіх поверхнях; реєстр розбіжностей —
  // docs/engineering/architecture/metric-registry.md.
  //
  // `transactions` навмисно лишається БАНК-ONLY: на ньому рахуються борги
  // й receivables (`calcDebtRemaining`, `getReceivableEffectiveTotal`), і
  // домішування туди ручних записів перекроїло б зовсім іншу метрику.
  const universe = buildFinykSpendingUniverse({
    bankTxs: transactions,
    manualExpenses: sqlite.manualExpenses,
    hiddenTxIds,
    txCategories,
    receivables,
    excludedStatTxIds: sqlite.excludedStatTxIds ?? [],
  });
  const excludedIds = universe.excludedTxIds;

  const statTx = universe.transactions.filter(
    (t) => !excludedIds.has(t.id),
  ) as AllData["statTx"];

  // Правила «Завжди так для цього магазину» (2026-10-01): чат-контекст бере
  // категорію з `txCategories[tx.id]`, тож віддаємо ефективну мапу (явні
  // override-и + виведене правилами). Виключення вище рахувались з явних
  // override-ів, і правило не може зробити операцію переказом.
  const effectiveTxCategories = withMerchantRuleOverrides(
    universe.transactions,
    txCategories,
    buildMerchantRuleIndex(sqlite.merchantRules),
    customCategories,
  ) as Record<string, string>;

  return {
    transactions,
    accounts,
    clientName,
    cacheTime,
    hiddenAccounts,
    budgets,
    manualDebts,
    receivables,
    txCategories: effectiveTxCategories,
    txSplits,
    customCategories,
    monthlyPlan,
    subscriptions,
    monoDebtLinked,
    statTx,
    excludedIds,
  };
}
