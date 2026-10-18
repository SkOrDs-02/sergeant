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

import { messages } from "@shared/i18n/uk";

export interface ManualExpenseKindTabsProps {
  isIncome: boolean;
  isSubmitting: boolean;
  onKindChange: (kind: ManualExpenseKind) => void;
}

const copy = messages.finyk.manualExpenseSheet;

export function ManualExpenseKindTabs({
  isIncome,
  isSubmitting,
  onKindChange,
}: ManualExpenseKindTabsProps) {
  return (
    <fieldset disabled={isSubmitting} className="divide-y divide-line">
      <legend className="sr-only">{copy.kindTablistLabel}</legend>
      {(
        [
          ["expense", copy.kindExpense],
          ["income", copy.kindIncome],
        ] as const
      ).map(([kind, label]) => (
        <label
          key={kind}
          className="flex min-h-touch-target items-center justify-between gap-3 py-3 text-style-body text-text"
        >
          <span>{label}</span>
          <input
            type="radio"
            name="manual-operation-kind"
            value={kind}
            checked={isIncome === (kind === "income")}
            onChange={() => onKindChange(kind)}
          />
        </label>
      ))}
    </fieldset>
  );
}
