import { DropdownMenu } from "@shared/components/ui/DropdownMenu";
import { Icon } from "@shared/components/ui/Icon";
import { Money } from "@shared/components/ui/Money";
import { RecurringSuggestions } from "../components/RecurringSuggestions";
import { FinykStatsStrip } from "../components/FinykStatsStrip";
import { QuickActionButton, SectionBar } from "./AssetsBars";
import { AssetsNetworthCard } from "./AssetsNetworthCard";
import { AssetsSubscriptionsSection } from "./AssetsSubscriptionsSection";
import { AssetsAssetsSection } from "./AssetsAssetsSection";
import { AssetsLiabilitiesSection } from "./AssetsLiabilitiesSection";
import type { useAssetsState } from "./useAssetsState";

// Re-export section components for backward compatibility with existing tests
// and call-sites (`AssetsTable.test.tsx` imports `AssetsNetworthCard` from
// `./AssetsTable`). Keeping the public surface stable while the body lives in
// per-section files (initiative 0013, Sprint 2 PR — drain >600 LOC allowlist).
export { AssetsNetworthCard } from "./AssetsNetworthCard";
export { AssetsSubscriptionsSection } from "./AssetsSubscriptionsSection";
export { AssetsAssetsSection } from "./AssetsAssetsSection";
export { AssetsLiabilitiesSection } from "./AssetsLiabilitiesSection";

type State = ReturnType<typeof useAssetsState>;

export function AssetsTable({ state }: { state: State }) {
  const {
    networth,
    totalAssets,
    totalDebt,
    showBalance,
    urgentLiability,
    todayStart,
    open,
    setOpen,
    subscriptions,
    transactions,
    dismissedRecurring,
    excludedTxIds,
    addSubscriptionFromRecurring,
    dismissRecurring,
    openSubscriptionForm,
    openAssetForm,
    openReceivableForm,
    openDebtForm,
  } = state;

  return (
    <>
      <AssetsNetworthCard
        networth={networth}
        totalAssets={totalAssets}
        totalDebt={totalDebt}
        showBalance={showBalance}
      />

      <FinykStatsStrip
        subsMonthly={0}
        subsCount={0}
        nextCharge={null}
        urgentLiability={urgentLiability}
        todayStart={todayStart}
        showBalance={showBalance}
        onOpenLiabilities={() => setOpen((v) => ({ ...v, liabilities: true }))}
        className="mb-3"
      />

      <div className="grid grid-cols-3 gap-2 mb-3">
        <QuickActionButton
          label="Підписка"
          tone="finyk"
          onClick={openSubscriptionForm}
        />
        {/* «+ Актив» — пікер, а не пряма кнопка: у секції дві різні
            сутності («Інші активи» й «Мені винні»), і після зняття кнопок
            усередині груп це єдине місце, де людина обирає між ними. */}
        <DropdownMenu
          ariaLabel="Що додати в активи"
          placement="bottom-start"
          items={[
            {
              type: "item",
              id: "asset",
              label: "Актив",
              description: "Готівка, депозит, інвестиції, авто",
              icon: <Icon name="wallet" size={16} aria-hidden />,
              onSelect: openAssetForm,
            },
            {
              type: "item",
              id: "receivable",
              label: "Мені винні",
              description: "Борг, який мають повернути тобі",
              icon: <Icon name="hand-coins" size={16} aria-hidden />,
              onSelect: openReceivableForm,
            },
          ]}
          trigger={<QuickActionButton label="Актив" tone="finyk" />}
        />
        <QuickActionButton label="Пасив" tone="danger" onClick={openDebtForm} />
      </div>

      <RecurringSuggestions
        transactions={transactions}
        subscriptions={subscriptions}
        dismissedRecurring={dismissedRecurring}
        excludedTxIds={excludedTxIds}
        onAdd={(candidate) => addSubscriptionFromRecurring?.(candidate)}
        onDismiss={(key) => dismissRecurring?.(key)}
      />

      {/* Subscriptions section */}
      <div id="finyk-subscriptions-section">
        <SectionBar
          title="Підписки"
          iconName="refresh-cw"
          iconTone="finyk"
          summary={`${subscriptions.length} активн${
            subscriptions.length === 1 ? "а" : "их"
          }`}
          open={open.subscriptions}
          onToggle={() =>
            setOpen((v) => ({ ...v, subscriptions: !v.subscriptions }))
          }
        />
        {open.subscriptions && <AssetsSubscriptionsSection state={state} />}
      </div>

      {/* Assets section */}
      <SectionBar
        title="Активи"
        iconName="trending-up"
        iconTone="success"
        summary={
          showBalance ? (
            <Money amount={totalAssets} signed />
          ) : (
            "\u2022\u2022\u2022\u2022"
          )
        }
        open={open.assets}
        onToggle={() => setOpen((v) => ({ ...v, assets: !v.assets }))}
      />
      {open.assets && <AssetsAssetsSection state={state} />}

      {/* Liabilities section */}
      <SectionBar
        title="Пасиви"
        iconName="trending-down"
        iconTone="danger"
        summary={
          showBalance ? (
            <Money amount={-totalDebt} />
          ) : (
            "\u2022\u2022\u2022\u2022"
          )
        }
        open={open.liabilities}
        onToggle={() => setOpen((v) => ({ ...v, liabilities: !v.liabilities }))}
      />
      {open.liabilities && <AssetsLiabilitiesSection state={state} />}
    </>
  );
}
