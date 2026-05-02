import { useAssetsState, type AssetsProps } from "./useAssetsState";
import { AssetsTxPickerView } from "./AssetsTxPickerView";
import { AssetsTable } from "./AssetsTable";

export function Assets({
  mono,
  storage,
  showBalance = true,
  initialOpenDebt = false,
}: AssetsProps) {
  const state = useAssetsState({ mono, storage, showBalance, initialOpenDebt });

  if (state.txPicker) {
    return (
      <AssetsTxPickerView
        txPicker={state.txPicker}
        setTxPicker={state.setTxPicker}
        accounts={state.accounts as never}
        transactions={state.transactions}
        monoDebtLinkedTxIds={state.monoDebtLinkedTxIds}
        toggleMonoDebtTx={state.toggleMonoDebtTx}
        subscriptions={state.subscriptions}
        updateSubscription={state.updateSubscription}
        manualDebts={state.manualDebts}
        receivables={state.receivables}
        toggleLinkedTx={state.toggleLinkedTx}
        showBalance={state.showBalance}
        customCategories={state.customCategories}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-1">
        <AssetsTable state={state} />
      </div>
    </div>
  );
}
