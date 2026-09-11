/**
 * Last validated: 2026-09-03
 * Status: Active
 */
import { useState } from "react";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import { messages } from "@shared/i18n/uk";
import { RecurringSuggestions } from "../../components/RecurringSuggestions";
import { QuickActionButton, SectionBar } from "../AssetsBars";
import { AssetsSubscriptionsSection } from "../AssetsSubscriptionsSection";
import { AssetsTxPickerView } from "../AssetsTxPickerView";
import { useAssetsState, type AssetsProps } from "../useAssetsState";
import { useFlowSchedule } from "../overview/useFlowSchedule";
import { PlannedFlowsCard } from "./PlannedFlowsCard";

/**
 * Блок «майбутнього» на сторінці Планування: найближчі платежі, підказки
 * про регулярні витрати («схоже на підписку»), список підписок і вхід у
 * форму нової підписки.
 *
 * AI-CONTEXT: до 2026-09-03 підписки й підказки жили в «Активах», а
 * «Найближчі платежі» — в Огляді (канон § 13, рядок «Дублювання
 * підписок»). Рішення власника 2026-09-03: «Активи» — це баланс (картки,
 * банки, борги, мені винні), а все, що про майбутнє — план, підписки,
 * регулярні потоки, ліміти, цілі — живе в Плануванні. Стан беремо з
 * `useAssetsState`: він уже вміє форму підписки, прив'язку транзакцій і
 * місячну суму, і дублювати цю логіку заради іншої сторінки не варто.
 * Зайві для цієї сторінки поля хука (активи/пасиви) просто не читаються.
 */
const t = messages.finyk.planning;

export function PlanningSubscriptions({
  mono,
  storage,
  showBalance = true,
  initialOpen = false,
}: {
  mono: AssetsProps["mono"];
  storage: AssetsProps["storage"];
  showBalance?: boolean;
  /** `?section=subscriptions` — розгорнути список одразу. */
  initialOpen?: boolean;
}) {
  const state = useAssetsState({
    mono,
    storage,
    showBalance,
    initialOpenSubscriptions: initialOpen,
  });
  const {
    open,
    setOpen,
    subscriptions,
    transactions,
    dismissedRecurring,
    excludedTxIds,
    addSubscriptionFromRecurring,
    dismissRecurring,
    openSubscriptionForm,
    manualDebts,
    receivables,
  } = state;

  // Київські частини «сьогодні» — раз на монтування, як в `useOverviewData`.
  const [kyivToday] = useState(() => getKyivDateParts(Date.now()));
  const { plannedFlows } = useFlowSchedule({
    subscriptions,
    manualDebts,
    receivables,
    transactions,
    kyivYear: kyivToday.year,
    kyivMonth: kyivToday.month - 1,
    kyivDay: kyivToday.day,
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
    <div className="space-y-3" id="finyk-subscriptions-section">
      <PlannedFlowsCard plannedFlows={plannedFlows} showBalance={showBalance} />

      <RecurringSuggestions
        transactions={transactions}
        subscriptions={subscriptions}
        dismissedRecurring={dismissedRecurring}
        excludedTxIds={excludedTxIds}
        onAdd={(candidate) => addSubscriptionFromRecurring?.(candidate)}
        onDismiss={(key) => dismissRecurring?.(key)}
      />

      <div>
        <SectionBar
          title={t.subscriptionsTitle}
          iconName="refresh-cw"
          iconTone="finyk"
          summary={`${subscriptions.length} ${
            subscriptions.length === 1 ? t.activeOne : t.activeMany
          }`}
          open={open.subscriptions}
          onToggle={() =>
            setOpen((v) => ({ ...v, subscriptions: !v.subscriptions }))
          }
        />
        {open.subscriptions && <AssetsSubscriptionsSection state={state} />}
      </div>

      <QuickActionButton
        label={t.addSubscription}
        tone="finyk"
        onClick={openSubscriptionForm}
      />
    </div>
  );
}
