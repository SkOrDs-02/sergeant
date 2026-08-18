/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Одне гривневе поле для review-екрана чек-скану — той самий
 * `useDecimalDraft` контракт, що `TxRowSplitEditor.tsx::SplitAmountInput`
 * (кома не зникає під пальцями, порожнє поле ≠ 0). Тут — окремий файл,
 * бо поле спільне для `ReceiptReviewForm` (сума чека) і
 * `ReceiptReviewItemRow` (ціна/сума позиції).
 */
import { useDecimalDraft } from "@shared/hooks/useDecimalDraft";
import { MAX_AMOUNT_HRYVNIA } from "@shared/lib/format/amount";
import { cn } from "@shared/lib/ui/cn";

export interface ReceiptMoneyInputProps {
  /** Значення в копійках (домен-інваріант) — конвертується в гривні лише
   * для показу/редагування тут. */
  kopiykas: number;
  onCommitKopiykas: (kopiykas: number) => void;
  ariaLabel: string;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

export function ReceiptMoneyInput({
  kopiykas,
  onCommitKopiykas,
  ariaLabel,
  disabled,
  className,
}: ReceiptMoneyInputProps) {
  const draft = useDecimalDraft(
    kopiykas / 100,
    MAX_AMOUNT_HRYVNIA,
    (hryvnia) => {
      onCommitKopiykas(Math.round((hryvnia ?? 0) * 100));
    },
  );
  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft.value}
      onChange={draft.onChange}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder="0"
      className={cn(
        "input-focus-finyk h-9 min-w-0 rounded-xl border border-line bg-panelHi px-2 text-right text-style-caption text-text tabular-nums",
        className,
      )}
    />
  );
}
