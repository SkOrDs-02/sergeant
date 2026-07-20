/**
 * Last validated: 2026-07-20
 * Status: Active
 *
 * Amount display + split/category/hide action buttons for TxRow.
 * Extracted for Hard Rule #18 max-lines.
 */
import { fmtAmt } from "../utils";
import { CURRENCY } from "../constants";
import type { TxSplit } from "@sergeant/finyk-domain/domain/types";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import type { TxRowTx } from "./txRowHelpers";

interface TxRowAmountActionsProps {
  tx: TxRowTx;
  hideAmount: boolean;
  isIncome: boolean;
  splitEditor: boolean;
  catPicker: boolean;
  hidden?: boolean | undefined;
  existingSplitsCount: number;
  onSplitChange?:
    ((id: string, split: TxSplit[] | null) => void) | null | undefined;
  onCatChange?: ((id: string, catId: string | null) => void) | null | undefined;
  onHide?: ((id: string) => void) | null | undefined;
  onOpenSplitEditor: () => void;
  onToggleCatPicker: () => void;
}

export function TxRowAmountActions({
  tx,
  hideAmount,
  isIncome,
  splitEditor,
  catPicker,
  hidden,
  existingSplitsCount,
  onSplitChange,
  onCatChange,
  onHide,
  onOpenSplitEditor,
  onToggleCatPicker,
}: TxRowAmountActionsProps) {
  return (
    <div className="flex items-center gap-1 shrink-0 ml-2">
      <div className="text-right">
        <div
          className={cn(
            "text-style-label tabular-nums",
            tx.amount > 0
              ? "text-success-strong dark:text-success"
              : "text-text",
          )}
        >
          {hideAmount ? "••••" : fmtAmt(tx.amount, CURRENCY.UAH)}
        </div>
        {tx.currencyCode !== CURRENCY.UAH && tx.operationAmount && (
          <div className="text-style-caption text-muted tabular-nums">
            {hideAmount ? "••••" : fmtAmt(tx.operationAmount, tx.currencyCode)}
          </div>
        )}
      </div>
      {onSplitChange && !isIncome && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenSplitEditor();
          }}
          className={cn(
            "touch-target px-2 flex items-center justify-center gap-1 rounded-xl transition-colors text-style-label",
            splitEditor
              ? "text-primary bg-primary/8"
              : existingSplitsCount > 0
                ? "text-primary/70 bg-primary/5"
                : "text-subtle/60 hover:text-subtle hover:bg-panelHi",
          )}
          title="Розподілити транзакцію"
          aria-label="Розподілити транзакцію"
        >
          <Icon name="shuffle" size={16} aria-hidden />
          <span className="text-style-caption">Розділити</span>
        </button>
      )}
      {onCatChange && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCatPicker();
          }}
          className={cn(
            "w-9 h-9 flex items-center justify-center rounded-xl transition-colors",
            catPicker
              ? "text-primary bg-primary/8"
              : "text-subtle/60 hover:text-subtle hover:bg-panelHi",
          )}
          title="Змінити категорію"
          aria-label="Змінити категорію"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      )}
      {onHide && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onHide(tx.id);
          }}
          className={cn(
            "w-9 h-9 flex items-center justify-center rounded-xl transition-colors",
            hidden
              ? "text-success hover:bg-success/8"
              : "text-subtle/60 hover:text-danger hover:bg-danger/8",
          )}
          title={hidden ? "Відновити" : "Приховати"}
          aria-label={hidden ? "Відновити" : "Приховати"}
        >
          {hidden ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M3 12s4-8 9-8 9 8 9 8-4 8-9 8-9-8-9-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <Icon name="trash" size={14} />
          )}
        </button>
      )}
    </div>
  );
}
