/**
 * Last validated: 2026-08-31
 * Status: Active
 *
 * Категорія «Борг» у надходженнях (спека `finyk-observations.md` PR-3).
 * Одразу після вибору цієї категорії на надходженні пропонує прив'язати
 * транзакцію до наявного пасиву або створити новий, підставивши суму й
 * дату з транзакції.
 *
 * AI-CONTEXT: створений/прив'язаний запис завжди отримує роль `source`
 * (`debtEngine.LinkedTxRole`) — вона лише пояснює походження боргу й НЕ
 * додається поверх суми (`getDebtEffectiveTotal` рахує лише `increase`).
 * Це навмисний виняток із загального правила «роль питаємо явно»: сама
 * категорія вже й є відповіддю на питання «звідки взявся борг».
 */
import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { DateField } from "@shared/components/ui/DateField";
import { Input } from "@shared/components/ui/Input";
import { Money } from "@shared/components/ui/Money";
import { messages } from "@shared/i18n/uk";
import { NAME_MAX_LEN } from "@shared/lib/text/limits";
import type { Debt } from "@sergeant/finyk-domain/domain/debtEngine";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

export interface CreateDebtFromTransactionInput {
  name: string;
  amountUAH: number;
  dueDate: string | null;
  txId: string;
}

export interface DebtIncomeLinkSectionProps {
  transaction: Transaction;
  manualDebts: readonly Debt[];
  onAttachExisting: (debtId: string, txId: string, amountUAH: number) => void;
  onCreateNew: (input: CreateDebtFromTransactionInput) => void;
}

export function DebtIncomeLinkSection({
  transaction,
  manualDebts,
  onAttachExisting,
  onCreateNew,
}: DebtIncomeLinkSectionProps) {
  const copy = messages.finyk.debtIncomePrompt;
  const amountUAH = Math.abs(transaction.amount / 100);
  const linkedDebt = manualDebts.find((d) =>
    (d.linkedTxIds || []).includes(transaction.id),
  );
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState(transaction.description || "");
  const [dueDate, setDueDate] = useState(transaction.date || "");

  if (linkedDebt) {
    return (
      <section className="rounded-2xl border border-line bg-panel p-3">
        <p className="text-style-caption text-muted">
          {copy.linkedPrefix} «{linkedDebt.name || copy.unnamedDebt}»
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2.5 rounded-2xl border border-danger/25 bg-danger-soft/30 p-3">
      <div>
        <h3 className="text-style-label text-text">{copy.title}</h3>
        <p className="mt-0.5 text-style-caption text-muted">{copy.hint}</p>
      </div>

      {manualDebts.length > 0 && !showCreateForm && (
        <div className="space-y-1.5">
          {manualDebts.map((debt) => (
            <Button
              key={debt.id}
              type="button"
              variant="secondary"
              module="finyk"
              size="sm"
              className="w-full justify-start"
              onClick={() =>
                onAttachExisting(debt.id, transaction.id, amountUAH)
              }
            >
              {debt.name || copy.unnamedDebt}
            </Button>
          ))}
        </div>
      )}

      {!showCreateForm ? (
        <Button
          type="button"
          variant="primary"
          module="finyk"
          size="sm"
          className="w-full"
          onClick={() => setShowCreateForm(true)}
        >
          {copy.createNew}
        </Button>
      ) : (
        <div className="space-y-2">
          <Input
            aria-label={copy.newDebtNameLabel}
            placeholder={copy.newDebtNameLabel}
            maxLength={NAME_MAX_LEN}
            showCharCount={false}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <DateField
            aria-label={copy.dueDateLabel}
            className="w-full"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <p className="text-style-caption text-subtle">
            <Money amount={amountUAH} />
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="primary"
              module="finyk"
              size="sm"
              className="flex-1"
              onClick={() => {
                onCreateNew({
                  name:
                    name.trim() || transaction.description || copy.unnamedDebt,
                  amountUAH,
                  dueDate: dueDate || null,
                  txId: transaction.id,
                });
                setShowCreateForm(false);
              }}
            >
              {copy.createCta}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => setShowCreateForm(false)}
            >
              {copy.cancelCta}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
