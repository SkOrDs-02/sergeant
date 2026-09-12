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
import { cn } from "@shared/lib/ui/cn";
import { finykPageMessages as finykCopy } from "@shared/i18n/uk.finyk";

export interface ManualExpenseKindTabsProps {
  isIncome: boolean;
  isSubmitting: boolean;
  onKindChange: (kind: ManualExpenseKind) => void;
}

const copy = finykCopy.manualExpenseSheet;

const tabClass = (active: boolean) =>
  cn(
    "touch-target rounded-md text-style-body font-medium transition-colors duration-fast",
    active
      ? "bg-finyk-strong text-white shadow-sm"
      : "text-muted hover:text-text",
  );

export function ManualExpenseKindTabs({
  isIncome,
  isSubmitting,
  onKindChange,
}: ManualExpenseKindTabsProps) {
  return (
    <div
      role="tablist"
      aria-label={copy.kindTablistLabel}
      className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-panelHi"
    >
      <button
        type="button"
        role="tab"
        aria-selected={!isIncome}
        disabled={isSubmitting}
        onClick={() => onKindChange("expense")}
        className={tabClass(!isIncome)}
      >
        {copy.kindExpense}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={isIncome}
        disabled={isSubmitting}
        onClick={() => onKindChange("income")}
        className={tabClass(isIncome)}
      >
        {copy.kindIncome}
      </button>
    </div>
  );
}
