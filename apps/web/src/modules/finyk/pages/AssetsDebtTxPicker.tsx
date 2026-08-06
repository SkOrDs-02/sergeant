/**
 * Last validated: 2026-08-03
 * Status: Active
 */
import { useState, type ReactNode } from "react";
import { TxRow, type TxRowTx } from "../components/TxRow";
import { Card } from "@shared/components/ui/Card";
import { Money } from "@shared/components/ui/Money";
import { Sheet } from "@shared/components/ui/Sheet";
import { Button } from "@shared/components/ui/Button";
import { cn } from "@shared/lib/ui/cn";
import {
  calcDebtRemaining,
  calcReceivableRemaining,
  defaultDebtTxRole,
  defaultReceivableTxRole,
  describeLinkedTxRole,
  getDebtEffectiveTotal,
  getDebtPaid,
  getLinkedTxRole,
  getReceivableEffectiveTotal,
  getReceivablePaid,
  type Debt,
  type LinkedTxRole,
  type Receivable,
} from "@sergeant/finyk-domain/domain/debtEngine";
import type { CustomCategoryInput } from "@sergeant/finyk-domain/constants";
import { messages } from "@shared/i18n/uk";

const copy = messages.finyk.debtTxLink;

/**
 * Пояснення ролей у пікері. Ключова відмінність, заради якої вибір узагалі
 * зʼявився: `source` **не змінює** суму запису — транзакція лише показує,
 * звідки борг узявся. До 2026-08 роль виводилася зі знаку, і будь-яка
 * origin-транзакція мовчки додавалася поверх уже введеної вручну суми.
 */
const ROLE_HINT: Record<LinkedTxRole, Record<"debt" | "receivable", string>> = {
  source: {
    debt: copy.hints.debtSource,
    receivable: copy.hints.receivableSource,
  },
  increase: {
    debt: copy.hints.debtIncrease,
    receivable: copy.hints.receivableIncrease,
  },
  payment: {
    debt: copy.hints.debtPayment,
    receivable: copy.hints.receivablePayment,
  },
};

const ROLE_ORDER: LinkedTxRole[] = ["source", "increase", "payment"];

interface RoleSheetProps {
  tx: TxRowTx | null;
  kind: "debt" | "receivable";
  currentRole: LinkedTxRole | null;
  onPick: (role: LinkedTxRole) => void;
  onUnlink: () => void;
  onClose: () => void;
}

function RoleSheet({
  tx,
  kind,
  currentRole,
  onPick,
  onUnlink,
  onClose,
}: RoleSheetProps) {
  const amount = tx ? Math.abs(tx.amount / 100) : 0;
  const suggested = tx ? suggestedRole(tx, kind) : null;
  return (
    <Sheet
      open={tx !== null}
      onClose={onClose}
      title={copy.roleSheetTitle}
      description={
        tx
          ? `${tx.description || copy.noDescription} · ${amount.toLocaleString("uk-UA")} ₴`
          : undefined
      }
    >
      <div className="space-y-2">
        {ROLE_ORDER.map((role) => {
          const selected = currentRole === role;
          return (
            <button
              key={role}
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(role)}
              className={cn(
                "w-full touch-target rounded-xl border px-4 py-3 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finyk",
                selected
                  ? "border-finyk bg-finyk/10"
                  : "border-line hover:bg-panel",
              )}
            >
              <div className="text-style-label text-text">
                {describeLinkedTxRole(role, kind).label}
                {currentRole === null && suggested === role && (
                  <span className="text-style-caption text-subtle ml-2">
                    {copy.suggestedHint}
                  </span>
                )}
              </div>
              <div className="text-style-caption text-subtle mt-0.5">
                {ROLE_HINT[role][kind]}
              </div>
            </button>
          );
        })}
        {currentRole !== null && (
          <Button variant="ghost" size="sm" onClick={onUnlink} className="mt-1">
            {copy.unlink}
          </Button>
        )}
      </div>
    </Sheet>
  );
}

export interface AssetsDebtTxPickerProps {
  kind: "debt" | "receivable";
  item: Debt | Receivable;
  transactions: readonly TxRowTx[];
  /** Повний набір для розрахунків — не звужений пошуком/періодом. */
  allTransactions: readonly TxRowTx[];
  setLinkedTxRole: (
    id: string,
    txId: string,
    type: "debt" | "receivable",
    role: LinkedTxRole | null,
    amountUAH?: number,
  ) => void;
  showBalance: boolean;
  customCategories?: readonly CustomCategoryInput[];
  controls: ReactNode;
  onBack: () => void;
}

/**
 * Привʼязка транзакцій до ручного пасиву або дебіторки. Тап по рядку
 * відкриває вибір ролі — знак суми лишається лише передвибором, а не
 * рішенням за користувача.
 */
export function AssetsDebtTxPicker({
  kind,
  item,
  transactions,
  allTransactions,
  setLinkedTxRole,
  showBalance,
  customCategories,
  controls,
  onBack,
}: AssetsDebtTxPickerProps) {
  const [pending, setPending] = useState<TxRowTx | null>(null);
  const isDebt = kind === "debt";
  const linked = item.linkedTxIds || [];

  const paid = isDebt
    ? getDebtPaid(item as Debt, allTransactions as TxRowTx[])
    : getReceivablePaid(item as Receivable, allTransactions as TxRowTx[]);
  const total = isDebt
    ? getDebtEffectiveTotal(item as Debt, allTransactions as TxRowTx[])
    : getReceivableEffectiveTotal(
        item as Receivable,
        allTransactions as TxRowTx[],
      );
  const remaining = isDebt
    ? calcDebtRemaining(item as Debt, allTransactions as TxRowTx[])
    : calcReceivableRemaining(item as Receivable, allTransactions as TxRowTx[]);

  const roleOf = (tx: TxRowTx): LinkedTxRole | null =>
    getLinkedTxRole(item, tx.id, allTransactions as TxRowTx[], kind);

  const commit = (role: LinkedTxRole) => {
    if (!pending) return;
    setLinkedTxRole(
      item.id,
      pending.id,
      kind,
      role,
      Math.abs(pending.amount / 100),
    );
    setPending(null);
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-bg sticky top-0 z-10">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-muted hover:text-text transition-colors"
        >
          {copy.back}
        </button>
        <span className="text-style-label">
          {isDebt ? copy.debtHeader : copy.receivableHeader}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad">
          <Card variant="flat" radius="md" className="mb-4">
            <div className="text-style-caption text-subtle">
              {item.emoji} {item.name}
            </div>
            <p className="text-style-caption text-subtle mt-2 leading-relaxed">
              {copy.intro}
            </p>
            <div
              className={cn(
                "text-style-headline mt-1",
                isDebt
                  ? "text-danger-strong dark:text-danger"
                  : "text-success-strong dark:text-success",
              )}
            >
              <Money
                amount={isDebt ? -remaining : remaining}
                signed
                tone="inherit"
              />{" "}
              {copy.remainingSuffix}
            </div>
            <div className="text-style-caption text-subtle mt-1">
              {/* Символ один раз на пару: «сплачено X з Y ₴». */}
              {copy.paidPrefix} <Money amount={paid} symbol="" />{" "}
              {copy.paidJoiner} <Money amount={total ?? 0} />
            </div>
          </Card>
          {controls}
          {transactions.map((t, i) => {
            const isLinked = linked.includes(t.id);
            const role = isLinked ? roleOf(t) : null;
            return (
              <div key={t.id || i}>
                {isLinked && role && (
                  <div
                    className="text-style-caption px-1 py-1"
                    style={{ color: describeLinkedTxRole(role, kind).color }}
                  >
                    {describeLinkedTxRole(role, kind).label}
                  </div>
                )}
                <TxRow
                  tx={t}
                  highlighted={isLinked}
                  onClick={() => setPending(t)}
                  hideAmount={!showBalance}
                  customCategories={customCategories}
                />
              </div>
            );
          })}
        </div>
      </div>
      <RoleSheet
        tx={pending}
        kind={kind}
        currentRole={pending ? roleOf(pending) : null}
        onPick={commit}
        onUnlink={() => {
          if (!pending) return;
          setLinkedTxRole(item.id, pending.id, kind, null);
          setPending(null);
        }}
        onClose={() => setPending(null)}
      />
    </div>
  );
}

/** Роль, яку пікер підсвічує як передвибір для ще не привʼязаної операції. */
export function suggestedRole(
  tx: Pick<TxRowTx, "amount">,
  kind: "debt" | "receivable",
): LinkedTxRole {
  return kind === "debt" ? defaultDebtTxRole(tx) : defaultReceivableTxRole(tx);
}
