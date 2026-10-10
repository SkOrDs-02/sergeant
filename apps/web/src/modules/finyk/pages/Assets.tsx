import { messages } from "@shared/i18n";
import { useAssetsState, type AssetsProps } from "./useAssetsState";
import { AssetsTxPickerView } from "./AssetsTxPickerView";
import { AssetsTable } from "./AssetsTable";

export function Assets({
  mono,
  storage,
  showBalance = true,
  initialOpenDebt = false,
  initialOpenSubscriptions = false,
}: AssetsProps) {
  const state = useAssetsState({
    mono,
    storage,
    showBalance,
    initialOpenDebt,
    initialOpenSubscriptions,
  });

  if (state.txPicker) {
    return (
      <AssetsTxPickerView
        txPicker={state.txPicker}
        setTxPicker={state.setTxPicker}
        accounts={state.accounts as never}
        transactions={state.transactions}
        loading={state.loadingTx}
        error={state.transactionsError}
        onRetry={state.refetchTransactions}
        monoDebtLinkedTxIds={state.monoDebtLinkedTxIds}
        toggleMonoDebtTx={state.toggleMonoDebtTx}
        subscriptions={state.subscriptions}
        updateSubscription={state.updateSubscription}
        manualDebts={state.manualDebts}
        receivables={state.receivables}
        setLinkedTxRole={state.setLinkedTxRole}
        showBalance={state.showBalance}
        customCategories={state.customCategories}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-5 pt-4 page-tabbar-pad space-y-1">
        <h1 className="text-style-title text-text mb-4">
          {messages.finykRedesign.assetsTitle}
        </h1>
        <AssetsTable state={state} />
      </div>
    </div>
  );
}
