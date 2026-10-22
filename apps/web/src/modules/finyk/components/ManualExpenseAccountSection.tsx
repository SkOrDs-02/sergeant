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
import type { CashOnHandState } from "@sergeant/finyk-domain/domain/cashOnHand";
import { isAtOrAfterCashAnchor } from "@sergeant/finyk-domain/domain/cashOnHand";
import { CashAmountForm } from "./CashAmountForm";
import { toExpenseInstant } from "./manualExpenseForm";

const t = messages.finyk.cashOnHand;

export type ManualAccount = "cash" | null;

export function ManualExpenseAccountSection({
  account,
  onAccountChange,
  cashExists,
  onCreateCash,
  isSubmitting,
  date,
  cashCreatedAt,
}: {
  account: ManualAccount;
  onAccountChange: (account: ManualAccount) => void;
  cashExists: boolean;
  onCreateCash: (amountMinor: number) => void;
  isSubmitting: boolean;
  /** День запису `YYYY-MM-DD` і мить створення рахунку для підказки про межу. */
  date?: string | undefined;
  cashCreatedAt?: number | undefined;
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

  const backdated =
    account === "cash" &&
    cashExists &&
    !!date &&
    cashCreatedAt != null &&
    !isAtOrAfterCashAnchor(Date.parse(toExpenseInstant(date)), {
      createdAt: cashCreatedAt,
    } as CashOnHandState);

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
      {backdated && (
        <p
          className="mt-2 text-style-caption text-fg-muted"
          data-testid="finyk-manual-cash-backdated-hint"
        >
          {t.backdatedHint}
        </p>
      )}
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
