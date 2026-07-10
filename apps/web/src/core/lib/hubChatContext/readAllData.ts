/* eslint-disable sergeant-design/no-raw-storage-key --
   All remaining keys in this file (finyk_hidden, finyk_budgets, finyk_debts,
   finyk_recv, finyk_hidden_txs, finyk_tx_cats, finyk_tx_splits,
   finyk_custom_cats_v1, finyk_monthly_plan, finyk_subs, finyk_mono_debt_linked)
   have no SQLite canon yet and are on the 2026-Q3 burn-down list. The two
   tombstoned keys (finyk_tx_cache / finyk_info_cache) were removed in
   Dual-write teardown Phase 3 and replaced by the mirror reader below. */
import { INTERNAL_TRANSFER_ID } from "../../../modules/finyk/constants";
import { ls } from "../hubChatUtils";
import { getCachedFinykMonoMirrorState } from "../../../modules/finyk/lib/monoMirrorReader";
import type {
  AllData,
  Budget,
  Debt,
  MonthlyPlan,
  Receivable,
  Subscription,
} from "./types";

export function readAllData(): AllData {
  const mirror = getCachedFinykMonoMirrorState();

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
