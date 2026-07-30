/* eslint-disable sergeant-design/no-raw-storage-key --
   All remaining keys in this file (finyk_hidden, finyk_budgets, finyk_debts,
   finyk_recv, finyk_hidden_txs, finyk_tx_cats, finyk_tx_splits,
   finyk_custom_cats_v1, finyk_monthly_plan, finyk_subs, finyk_mono_debt_linked)
   have no SQLite canon yet and are on the 2026-Q3 burn-down list. The two
   tombstoned keys (finyk_tx_cache / finyk_info_cache) were removed in
   Dual-write teardown Phase 3 and replaced by the mirror reader below. */
import { buildFinykSpendingUniverse } from "@sergeant/finyk-domain";

import { ls } from "../hubChatUtils";
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

  const hiddenAccounts = ls<string[]>("finyk_hidden", []);
  const budgets = ls<Budget[]>("finyk_budgets", []);
  const manualDebts = ls<Debt[]>("finyk_debts", []);
  const receivables = ls<Receivable[]>("finyk_recv", []);
  const hiddenTxIds = ls<string[]>("finyk_hidden_txs", []);
  const txCategories = ls<Record<string, string>>("finyk_tx_cats", {});
  const txSplits = ls<Record<string, unknown>>("finyk_tx_splits", {});
  const customCategories = ls<unknown[]>("finyk_custom_cats_v1", []);
  const monthlyPlan = ls<MonthlyPlan>("finyk_monthly_plan", {});
  const subscriptions = ls<Subscription[]>("finyk_subs", []);
  const monoDebtLinked = ls<Record<string, unknown>>(
    "finyk_mono_debt_linked",
    {},
  );

  // AI-CONTEXT: канонічний всесвіт витрат (Хвиля 1, W1-CANON-AGG).
  // Стадія 2а: excluded-set більше не збирається вручну з ТРЬОХ частин —
  // раніше мовчки губилася четверта, `finyk_excluded_stat_txs`, тобто
  // транзакції, які користувач явно позначив «виключити зі статистики».
  // Стадія 2d: до всесвіту додано ГОТІВКУ (ручні витрати з SQLite), тож
  // чат більше не називає меншу суму, ніж дайджест і Звіти на тих самих
  // даних. Канон finyk §5 («банк і ручний світ рівні») вимагає одного
  // всесвіту на всіх поверхнях; реєстр розбіжностей —
  // docs/02-engineering/architecture/metric-registry.md.
  //
  // `transactions` навмисно лишається БАНК-ONLY: на ньому рахуються борги
  // й receivables (`calcDebtRemaining`, `getReceivableEffectiveTotal`), і
  // домішування туди ручних записів перекроїло б зовсім іншу метрику.
  const universe = buildFinykSpendingUniverse({
    bankTxs: transactions,
    manualExpenses: getCachedFinykSqliteState().manualExpenses,
    hiddenTxIds,
    txCategories,
    receivables,
    excludedStatTxIds: ls<string[]>("finyk_excluded_stat_txs", []),
  });
  const excludedIds = universe.excludedTxIds;

  const statTx = universe.transactions.filter(
    (t) => !excludedIds.has(t.id),
  ) as AllData["statTx"];

  return {
    transactions,
    accounts,
    clientName,
    cacheTime,
    hiddenAccounts,
    budgets,
    manualDebts,
    receivables,
    txCategories,
    txSplits,
    customCategories,
    monthlyPlan,
    subscriptions,
    monoDebtLinked,
    statTx,
    excludedIds,
  };
}
