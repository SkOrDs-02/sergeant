/**
 * Рахунок ручного запису (Р3 спеки `finyk-analytics-v3.md`): «Готівка на
 * руках» або «Без рахунку». Банківських карток тут немає: банк сам привозить
 * свої операції, і запис на картку дав би дубль.
 *
 * Вибір готівки, поки рахунку немає, спершу просить поточну суму (Р3.3).
 * Радіо на hairline, як перемикач типу запису вище.
 */
import { useState } from "react";
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
      <fieldset disabled={isSubmitting} className="divide-y divide-line">
        <legend className="text-style-label text-muted">
          {t.accountLegend}
        </legend>
        {(
          [
            ["cash", t.title],
            [null, t.noAccount],
          ] as const
        ).map(([value, label]) => (
          <label
            key={label}
            className="flex min-h-touch-target items-center justify-between gap-3 py-3 text-style-body text-text"
          >
            <span>{label}</span>
            <input
              type="radio"
              name="manual-operation-account"
              checked={
                value === "cash"
                  ? account === "cash" || settingUp
                  : account === null && !settingUp
              }
              onChange={() => pick(value)}
            />
          </label>
        ))}
      </fieldset>
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
