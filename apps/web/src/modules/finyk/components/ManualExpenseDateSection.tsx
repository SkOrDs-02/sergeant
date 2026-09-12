/**
 * Last validated: 2026-09-12
 * Status: Active
 *
 * Поле дати для {@link ManualExpenseSheet}. Винесено окремо, щоб аркуш
 * лишався під Hard Rule #18 (`max-lines: 600`).
 *
 * Дата — «сьогодні» у 95%+ випадків, тож завжди відкритий пікер змушував
 * вийти в нативну шторку лише щоб підтвердити вже правдиве. Тому поле
 * згорнуте за чіпом і розкривається, коли людина явно каже «не сьогодні»
 * або коли редагується давніший запис, де дата вже не сьогоднішня.
 *
 * UI-12: замість OS-шторки — горизонтальний скрабер днів для частого
 * випадку «нещодавня дата». Прихований нативний `input` лишається, бо
 * він тримає реєстрацію в react-hook-form і покриває вибір дати
 * старішої за вікно скрабера (фолбек «Інша дата»).
 */
import type { UseFormRegister } from "react-hook-form";
import { DateScrubber } from "@shared/components/ui/DateScrubber";
import { Input } from "@shared/components/ui/Input";
import { Label } from "@shared/components/ui/FormField";
import { toLocalISODate } from "@sergeant/shared";
import {
  HARD_MAX_DAY_KEY,
  HARD_MIN_DAY_KEY,
} from "@shared/lib/time/dateBounds";
import type { ExpenseFormValues } from "./manualExpenseForm";
import { finykPageMessages as finykCopy } from "@shared/i18n/uk.finyk";

const copy = finykCopy.manualExpenseSheet;

export interface ManualExpenseDateSectionProps {
  dateId: string;
  date: string;
  dateError: string | undefined;
  /** Мʼяке вікно: зберігати дозволено, але рік варто перечитати. */
  dateWarning: string | null;
  showDateField: boolean;
  isSubmitting: boolean;
  onReveal: () => void;
  onDateChange: (iso: string) => void;
  register: UseFormRegister<ExpenseFormValues>;
}

export function ManualExpenseDateSection({
  dateId,
  date,
  dateError,
  dateWarning,
  showDateField,
  isSubmitting,
  onReveal,
  onDateChange,
  register,
}: ManualExpenseDateSectionProps) {
  if (date === toLocalISODate() && !showDateField) {
    return (
      <button
        type="button"
        onClick={onReveal}
        className="text-style-caption text-muted hover:text-text underline decoration-dotted underline-offset-2 transition-colors"
      >
        {copy.dateReveal}
      </button>
    );
  }

  return (
    <div>
      <Label htmlFor={dateId}>{copy.dateLabel}</Label>
      <DateScrubber
        aria-label={copy.dateScrubberLabel}
        value={date || toLocalISODate()}
        onChange={onDateChange}
      />
      <details className="mt-2">
        <summary className="text-style-caption text-muted hover:text-text cursor-pointer list-none underline decoration-dotted underline-offset-2">
          {copy.dateOther}
        </summary>
        <Input
          id={dateId}
          type="date"
          className="mt-2"
          min={HARD_MIN_DAY_KEY}
          max={HARD_MAX_DAY_KEY}
          error={!!dateError}
          helperText={dateError ?? undefined}
          disabled={isSubmitting}
          {...register("date")}
        />
      </details>
      {dateWarning ? (
        <p className="mt-2 text-style-caption text-warning-strong dark:text-warning">
          {dateWarning}
        </p>
      ) : null}
    </div>
  );
}
