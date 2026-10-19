import { Button } from "@shared/components/ui/Button";

interface TransactionsFilterChipProps {
  label: string;
  clearLabel: string;
  clearAria: string;
  onClear?: (() => void) | undefined;
}

/** Плашка звуження списку (день або період Аналітики) з кнопкою зняття. */
export function TransactionsFilterChip({
  label,
  clearLabel,
  clearAria,
  onClear,
}: TransactionsFilterChipProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-panel border border-line bg-panel px-3 py-2">
      <span className="text-style-caption text-text">{label}</span>
      {onClear && (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={onClear}
          aria-label={clearAria}
        >
          {clearLabel}
        </Button>
      )}
    </div>
  );
}
