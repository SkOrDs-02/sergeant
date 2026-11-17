import { Card } from "@shared/components/ui/Card";
import { AddAction } from "@shared/components/ui/CornerAction";
import { Money } from "@shared/components/ui/Money";
import { FinykStatsStrip } from "../components/FinykStatsStrip";
import { SectionBar } from "./AssetsBars";
import { AssetsNetworthCard } from "./AssetsNetworthCard";
import { AssetsAssetsSection } from "./AssetsAssetsSection";
import { AssetsLiabilitiesSection } from "./AssetsLiabilitiesSection";
import type { useAssetsState } from "./useAssetsState";

// Re-export section components for backward compatibility with existing tests
// and call-sites (`AssetsTable.test.tsx` imports `AssetsNetworthCard` from
// `./AssetsTable`). Keeping the public surface stable while the body lives in
// per-section files (initiative 0013, Sprint 2 PR — drain >600 LOC allowlist).
export { AssetsNetworthCard } from "./AssetsNetworthCard";
export { AssetsAssetsSection } from "./AssetsAssetsSection";
export { AssetsLiabilitiesSection } from "./AssetsLiabilitiesSection";

type State = ReturnType<typeof useAssetsState>;

export function AssetsTable({ state }: { state: State }) {
  const {
    networth,
    nonUahManualAssetCount,
    totalAssets,
    totalDebt,
    showBalance,
    urgentLiability,
    todayStart,
    open,
    setOpen,
    openAssetForm,
    openDebtForm,
  } = state;

  return (
    <>
      <AssetsNetworthCard
        networth={networth}
        totalAssets={totalAssets}
        totalDebt={totalDebt}
        showBalance={showBalance}
        nonUahManualAssetCount={nonUahManualAssetCount}
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

      {/* Підписки й підказки про регулярні витрати переїхали в Планування
          (2026-09-03): «Активи» — це баланс, майбутнє живе поруч із планом.
          Додавання - лише кутова кнопка з аркушем джерел (redesign v3.2,
          позиція 02), без «+ Актив» / «+ Пасив» над списком. */}
      <AddAction
        sources={[
          {
            id: "asset",
            label: "Актив",
            hint: "Готівка, депозит, авто або борг тобі",
            onSelect: openAssetForm,
          },
          {
            id: "debt",
            label: "Пасив",
            hint: "Кредит, борг, розстрочка",
            onSelect: openDebtForm,
          },
        ]}
      />

      {/* Assets section */}
      <Card padding="none" className="mb-7 overflow-hidden">
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
        {open.assets && (
          <div className="px-4">
            <AssetsAssetsSection state={state} />
          </div>
        )}
      </Card>

      {/* Liabilities section */}
      <Card padding="none" className="mb-7 overflow-hidden">
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
          onToggle={() =>
            setOpen((v) => ({ ...v, liabilities: !v.liabilities }))
          }
        />
        {open.liabilities && (
          <div className="px-4 pb-4 pt-4">
            <AssetsLiabilitiesSection state={state} />
          </div>
        )}
      </Card>
    </>
  );
}
