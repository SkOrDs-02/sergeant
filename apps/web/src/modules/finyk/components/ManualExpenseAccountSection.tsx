/**
 * Рахунок ручного запису (Р3 спеки `finyk-analytics-v3.md`): «Готівка на
 * руках» або «Без рахунку». Банківських карток тут немає: банк сам привозить
 * свої операції, і запис на картку дав би дубль.
 *
 * Вибір готівки, поки рахунку немає, спершу просить поточну суму (Р3.3).
 * Плитки `ChoiceGroup`, як перемикач типу запису вище.
 */
import { useId, useState } from "react";
import { ChoiceGroup } from "@shared/components/ui/Choice";
import { FIELD_LABEL } from "@shared/components/ui/Input";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import { CashAmountForm } from "./CashAmountForm";

const t = messages.finyk.cashOnHand;

export type ManualAccount = "cash" | null;

export function ManualExpenseAccountSection({
  account,
  onAccountChange,
  cashExists,
  onCreateCash,
  isSubmitting,
}: {
  account: ManualAccount;
  onAccountChange: (account: ManualAccount) => void;
  cashExists: boolean;
  onCreateCash: (amountMinor: number) => void;
  isSubmitting: boolean;
}) {
  const [settingUp, setSettingUp] = useState(false);
  const legendId = useId();

  const pick = (next: ManualAccount) => {
    if (next === "cash" && !cashExists) {
      setSettingUp(true);
      return;
    }
    setSettingUp(false);
    onAccountChange(next);
  };

  return (
    <div>
      <p id={legendId} className={cn(FIELD_LABEL, "mb-1")}>
        {t.accountLegend}
      </p>
      <ChoiceGroup<"cash" | "none">
        items={[
          { value: "cash", label: t.title },
          { value: "none", label: t.noAccount },
        ]}
        value={account === "cash" || settingUp ? "cash" : "none"}
        onChange={(value) => pick(value === "cash" ? "cash" : null)}
        ariaLabelledBy={legendId}
        disabled={isSubmitting}
        className="grid grid-cols-2"
      />
      {settingUp && !cashExists && (
        <div className="mt-3" data-testid="finyk-manual-cash-setup">
          <CashAmountForm
            label={t.setupPrompt}
            hint={t.setupHint}
            submitLabel={t.create}
            onSubmit={(minor) => {
              onCreateCash(minor);
              setSettingUp(false);
              onAccountChange("cash");
            }}
            onCancel={() => setSettingUp(false)}
          />
        </div>
      )}
    </div>
  );
}
