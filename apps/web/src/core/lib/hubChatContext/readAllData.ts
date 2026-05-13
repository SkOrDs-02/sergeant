import { INTERNAL_TRANSFER_ID } from "../../../modules/finyk/constants";
import { ls } from "../hubChatUtils";
import type {
  AllData,
  Budget,
  Debt,
  InfoCache,
  MonthlyPlan,
  Receivable,
  Subscription,
  TxCache,
} from "./types";

export function readAllData(): AllData {
  const txCache = ls<TxCache | null>("finyk_tx_cache", null);
  const rawInfo = ls<{ info?: InfoCache } | InfoCache | null>(
    "finyk_info_cache",
    null,
  );
  const infoCache: InfoCache | null =
    (rawInfo && "info" in rawInfo ? rawInfo.info : (rawInfo as InfoCache)) ||
    null;

  const transactions = txCache?.txs || [];
  const accounts = infoCache?.accounts || [];
  const clientName = infoCache?.name || "";
  const cacheTime = txCache?.timestamp || null;

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

  const transferTxIds = Object.entries(txCategories)
    .filter(([, catId]) => catId === INTERNAL_TRANSFER_ID)
    .map(([txId]) => txId);

  const excludedIds = new Set<string>([
    ...hiddenTxIds,
    ...transferTxIds,
    ...receivables.flatMap((r) => r.linkedTxIds || []),
  ]);

  const statTx = transactions.filter((t) => !excludedIds.has(t.id));

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
