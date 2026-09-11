/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * Місток «транзакція з категорією Борг → пасив» (спека finyk-observations,
 * PR-3; узагальнено 2026-09-11 з income-only на обидва напрямки — рішення
 * власника, канон `docs/product/modules/finyk.md` § Журнал рішень).
 * Рендериться в {@link BankTransactionDetailsSheet} для НАДХОДЖЕННЯ з
 * категорією `debt-income` (роль `source`) і для ВИТРАТИ з категорією
 * `debt` (роль `payment`).
 *
 * Роль визначає межу поведінки, не лише підпис:
 *  - `source`  — привʼязка підтверджує базу пасиву; дозволено створити
 *                НОВИЙ пасив просто з цієї операції (борг щойно виник).
 *  - `payment` — привʼязка зменшує залишок; створення нового пасиву
 *                НЕ пропонується (борг, що народжується вже сплаченим —
 *                нонсенс), лише вибір із наявних. Коли їх нема, показуємо
 *                чесну підказку, а не мертву кнопку.
 *
 * Обидві гілки пишуть через той самий `setLinkedTxRole`
 * (`@sergeant/finyk-domain/domain/debtEngine`) — це той самий контракт,
 * що тримає `AssetsDebtTxPicker`.
 */
import { useState } from "react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import type {
  Debt,
  LinkedTxRole,
  SetLinkedTxRole,
} from "@sergeant/finyk-domain/domain/debtEngine";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Input } from "@shared/components/ui/Input";
import { Money } from "@shared/components/ui/Money";
import { Sheet } from "@shared/components/ui/Sheet";
import { messages } from "@shared/i18n/uk";
import { NAME_MAX_LEN } from "@shared/lib/text/limits";

const shared = messages.finyk.debtLinkPrompt;
// Той самий підпис «авто», що й у пікері `AssetsDebtTxPicker` — одна мітка
// на дві поверхні (§ Level 2, вимога «нічого не пишеться мовчки»).
const autoLabel = messages.finyk.debtTxLink.autoLabel;

export interface DebtTxLinkSectionProps {
  transaction: Transaction;
  manualDebts: readonly Debt[];
  setManualDebts: (updater: (debts: Debt[]) => Debt[]) => void;
  setLinkedTxRole: SetLinkedTxRole;
  /**
   * `source` — операція, якою борг виник (надходження на пасив).
   * `payment` — погашення (витрата по пасиву). Визначає і копію, і те,
   * чи пропонується створення нового пасиву.
   *
   * Названо `txRole`, не `role`: JSX-атрибут `role="…"` на власному
   * компоненті все одно ловиться `jsx-a11y/aria-role` (правило перевіряє
   * ім'я атрибута, не тип елемента), і `"source"`/`"payment"` — не валідні
   * ARIA-ролі.
   */
  txRole: LinkedTxRole;
}

export function DebtTxLinkSection({
  transaction,
  manualDebts,
  setManualDebts,
  setLinkedTxRole,
  txRole,
}: DebtTxLinkSectionProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newDebtName, setNewDebtName] = useState("");

  const isPayment = txRole === "payment";
  const copy = isPayment ? shared.payment : shared.source;

  const amountUAH = Math.abs(transaction.amount / 100);
  const linkedDebt = manualDebts.find((d) =>
    (d.linkedTxIds || []).includes(transaction.id),
  );

  const linkExisting = (debtId: string) => {
    setLinkedTxRole(debtId, transaction.id, "debt", txRole, amountUAH);
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
        txLinks: { [transaction.id]: { role: txRole, amount: amountUAH } },
      },
    ]);
    setNewDebtName("");
    setShowCreateForm(false);
  };

  if (linkedDebt) {
    const isAuto = linkedDebt.txLinks?.[transaction.id]?.auto === true;
    return (
      <div className="rounded-2xl border border-line bg-panel p-3 flex items-center justify-between gap-3">
        <p className="text-style-caption text-subtle">
          {copy.linkedPrefix} «{linkedDebt.name}»
          {isAuto && <span> · {autoLabel}</span>}
        </p>
        <Button
          variant="ghost"
          module="finyk"
          size="xs"
          onClick={() =>
            setLinkedTxRole(linkedDebt.id, transaction.id, "debt", null)
          }
        >
          {shared.unlink}
        </Button>
      </div>
    );
  }

  // Платіж без жодного наявного пасиву — привʼязувати нема до чого.
  // Кнопка «створити» тут була б мертвою (§ докблок): пасив, який
  // народжується вже сплаченим, не має сенсу.
  if (isPayment && manualDebts.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-3 space-y-1">
        <p className="text-style-caption text-subtle">{copy.prompt}</p>
        <p className="text-style-caption text-muted">{shared.noDebtsHint}</p>
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
        {!isPayment && (
          <Button
            variant="secondary"
            module="finyk"
            size="sm"
            className="flex-1"
            onClick={() => setShowCreateForm(true)}
          >
            {shared.createNew}
          </Button>
        )}
      </div>

      <Sheet
        open={showPicker}
        onClose={() => setShowPicker(false)}
        title={shared.pickTitle}
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

      {!isPayment && (
        <Sheet
          open={showCreateForm}
          onClose={() => setShowCreateForm(false)}
          title={shared.createTitle}
        >
          <div className="space-y-3">
            <p className="text-style-caption text-subtle inline-flex items-center gap-1.5">
              <Icon name="calendar" size={13} aria-hidden />
              <Money amount={amountUAH} /> ·{" "}
              {new Intl.DateTimeFormat("uk-UA", {
                dateStyle: "medium",
              }).format(
                new Date(transaction.date || Number(transaction.time) * 1000),
              )}
            </p>
            <Input
              aria-label={shared.namePlaceholder}
              placeholder={shared.namePlaceholder}
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
                {shared.create}
              </Button>
              <Button
                className="flex-1"
                size="sm"
                variant="secondary"
                onClick={() => setShowCreateForm(false)}
              >
                {shared.cancel}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
