/**
 * Last validated: 2026-09-12
 * Status: Active
 *
 * Перемикач «Витрата / Надходження» для {@link ManualExpenseSheet}.
 * Винесено окремо, щоб аркуш лишався під Hard Rule #18 (`max-lines: 600`).
 *
 * §1 fab-and-manual-income spec: сегмент живе вгорі самої форми (без
 * fan-menu і long-press) і за замовчуванням стоїть на «Витрата».
 * Перемикання скидає категорію на дефолт нової таксономії — це робить
 * `onKindChange` у батька, не цей компонент.
 */
import type { ManualExpenseKind } from "@sergeant/finyk-domain/domain/transactions";

import { ChoiceGroup } from "@shared/components/ui/Choice";
import { messages } from "@shared/i18n/uk";

export interface ManualExpenseKindTabsProps {
  isIncome: boolean;
  isSubmitting: boolean;
  onKindChange: (kind: ManualExpenseKind) => void;
}

const copy = messages.finyk.manualExpenseSheet;

const KIND_ITEMS = [
  { value: "expense", label: copy.kindExpense },
  { value: "income", label: copy.kindIncome },
] as const;

export function ManualExpenseKindTabs({
  isIncome,
  isSubmitting,
  onKindChange,
}: ManualExpenseKindTabsProps) {
  return (
    <ChoiceGroup<ManualExpenseKind>
      items={KIND_ITEMS}
      value={isIncome ? "income" : "expense"}
      onChange={onKindChange}
      ariaLabel={copy.kindTablistLabel}
      disabled={isSubmitting}
      className="grid grid-cols-2"
    />
  );
}
