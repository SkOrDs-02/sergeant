import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Money } from "@shared/components/ui/Money";
import { messages } from "@shared/i18n/uk";
import { FinanceItemHeading } from "../components/FinanceItemHeading";
import { CashAmountForm } from "../components/CashAmountForm";
import { AssetsGroupCard, usePersistedGroupOpen } from "./AssetsGroupCard";

const t = messages.finyk.cashOnHand;

/**
 * Група «Готівка на руках» в Активах (Р2.8): назва й дія, тоді баланс.
 * Без рахунку група пропонує ввести поточну суму (Р2.2), з рахунком дає
 * «Вказати фактичну суму» (Р2.3).
 */
export function AssetsCashOnHand({
  balanceMinor,
  onCreate,
  onSetActual,
  showBalance,
}: {
  /** `null`, коли рахунку ще немає. */
  balanceMinor: number | null;
  onCreate: (amountMinor: number) => void;
  onSetActual: (amountMinor: number) => void;
  showBalance: boolean;
}) {
  const [groupOpen, toggleGroup] = usePersistedGroupOpen(
    "finyk_assets_cash_open_v1",
  );
  const [reconciling, setReconciling] = useState(false);

  return (
    <AssetsGroupCard
      title={t.title}
      iconName="wallet"
      open={groupOpen}
      onToggle={toggleGroup}
    >
      {balanceMinor === null ? (
        <div data-testid="finyk-cash-setup">
          <p className="mb-3 text-style-body text-text">{t.setupPrompt}</p>
          <CashAmountForm
            label={t.amountLabel}
            hint={t.setupHint}
            submitLabel={t.create}
            onSubmit={onCreate}
          />
        </div>
      ) : (
        <div data-testid="finyk-cash-card" className="py-1">
          <FinanceItemHeading
            title={t.title}
            actions={
              !reconciling && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setReconciling(true)}
                >
                  {t.reconcile}
                </Button>
              )
            }
            value={
              showBalance ? (
                // Копійки, як у балансі картки: це залишок, який звіряють.
                <Money amount={balanceMinor / 100} kopecks />
              ) : (
                "••••"
              )
            }
          />
          {reconciling && (
            <CashAmountForm
              label={t.reconcileLabel}
              hint={t.reconcileHint}
              submitLabel={t.save}
              onSubmit={(minor) => {
                onSetActual(minor);
                setReconciling(false);
              }}
              onCancel={() => setReconciling(false)}
            />
          )}
        </div>
      )}
    </AssetsGroupCard>
  );
}
