/**
 * Last validated: 2026-08-31
 * Status: Active
 *
 * Місток «надходження з категорією Борг → пасив» (спека finyk-observations,
 * PR-3). Рендериться в {@link BankTransactionDetailsSheet} лише коли тег
 * категорії операції — `in_debt`.
 *
 * Привʼязка нового чи наявного пасиву одразу отримує роль `source`
 * (`@sergeant/finyk-domain/domain/debtEngine`) — вона лише пояснює, звідки
 * борг узявся, і НЕ додається до вже введеної суми. Це той самий контракт,
 * що тримає `AssetsDebtTxPicker`.
 */
import { useState } from "react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import type {
  Debt,
  LinkedTxRole,
} from "@sergeant/finyk-domain/domain/debtEngine";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Input } from "@shared/components/ui/Input";
import { Money } from "@shared/components/ui/Money";
import { Sheet } from "@shared/components/ui/Sheet";
import { messages } from "@shared/i18n/uk";
import { NAME_MAX_LEN } from "@shared/lib/text/limits";

const copy = messages.finyk.debtIncomeLink;

export interface DebtIncomeLinkSectionProps {
  transaction: Transaction;
  manualDebts: readonly Debt[];
  setManualDebts: (updater: (debts: Debt[]) => Debt[]) => void;
  setLinkedTxRole: (
    id: string,
    txId: string,
    type: "debt" | "receivable",
    role: LinkedTxRole | null,
    amountUAH?: number,
  ) => void;
}

export function DebtIncomeLinkSection({
  transaction,
  manualDebts,
  setManualDebts,
  setLinkedTxRole,
}: DebtIncomeLinkSectionProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newDebtName, setNewDebtName] = useState("");

  const amountUAH = Math.abs(transaction.amount / 100);
  const linkedDebt = manualDebts.find((d) =>
    (d.linkedTxIds || []).includes(transaction.id),
  );

  const linkExisting = (debtId: string) => {
    setLinkedTxRole(debtId, transaction.id, "debt", "source", amountUAH);
    setShowPicker(false);
  };

  const createDebt = () => {
    const name = newDebtName.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    setManualDebts((debts) => [
      ...debts,
      {
        id,
        name,
        emoji: "\u{1F4B8}",
        amount: amountUAH,
        totalAmount: amountUAH,
        linkedTxIds: [transaction.id],
        txLinks: { [transaction.id]: { role: "source", amount: amountUAH } },
      },
    ]);
    setNewDebtName("");
    setShowCreateForm(false);
  };

  if (linkedDebt) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-3 flex items-center justify-between gap-3">
        <p className="text-style-caption text-subtle">
          {copy.linkedPrefix} «{linkedDebt.name}»
        </p>
        <Button
          variant="ghost"
          module="finyk"
          size="xs"
          onClick={() =>
            setLinkedTxRole(linkedDebt.id, transaction.id, "debt", null)
          }
        >
          {copy.unlink}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-panel p-3 space-y-2">
      <p className="text-style-caption text-subtle">{copy.prompt}</p>
      <div className="flex gap-2">
        {manualDebts.length > 0 && (
          <Button
            variant="secondary"
            module="finyk"
            size="sm"
            className="flex-1"
            onClick={() => setShowPicker(true)}
          >
            {copy.linkExisting}
          </Button>
        )}
        <Button
          variant="secondary"
          module="finyk"
          size="sm"
          className="flex-1"
          onClick={() => setShowCreateForm(true)}
        >
          {copy.createNew}
        </Button>
      </div>

      <Sheet
        open={showPicker}
        onClose={() => setShowPicker(false)}
        title={copy.pickTitle}
      >
        <div className="space-y-2">
          {manualDebts.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => linkExisting(d.id)}
              className="w-full touch-target rounded-xl border border-line px-4 py-3 text-left hover:bg-panelHi transition-colors flex items-center justify-between gap-2"
            >
              <span className="text-style-label text-text">{d.name}</span>
              <Money
                amount={-(d.totalAmount ?? d.amount ?? 0)}
                signed
                tone="inherit"
                className="text-danger-strong dark:text-danger"
              />
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet
        open={showCreateForm}
        onClose={() => setShowCreateForm(false)}
        title={copy.createTitle}
      >
        <div className="space-y-3">
          <p className="text-style-caption text-subtle inline-flex items-center gap-1.5">
            <Icon name="calendar" size={13} aria-hidden />
            <Money amount={amountUAH} /> ·{" "}
            {new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium" }).format(
              new Date(transaction.date || Number(transaction.time) * 1000),
            )}
          </p>
          <Input
            aria-label={copy.namePlaceholder}
            placeholder={copy.namePlaceholder}
            maxLength={NAME_MAX_LEN}
            showCharCount={false}
            value={newDebtName}
            onChange={(e) => setNewDebtName(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              className="flex-1"
              size="sm"
              disabled={!newDebtName.trim()}
              onClick={createDebt}
            >
              {copy.create}
            </Button>
            <Button
              className="flex-1"
              size="sm"
              variant="secondary"
              onClick={() => setShowCreateForm(false)}
            >
              {copy.cancel}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
