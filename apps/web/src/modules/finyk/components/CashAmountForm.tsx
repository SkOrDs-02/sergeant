import { useId, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { MoneyInput } from "@shared/components/ui/MoneyInput";
import { messages } from "@shared/i18n/uk";

const t = messages.finyk.cashOnHand;

/**
 * Поле суми готівки з кнопкою. Спільне для створення рахунку «Готівка на
 * руках» (Активи і форма ручного запису, Р2.2 і Р3.3) і для «Вказати
 * фактичну суму» (Р2.3). Нуль валідний: готівки може не бути зовсім.
 */
export function CashAmountForm({
  label,
  hint,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  label: string;
  hint?: string | undefined;
  submitLabel: string;
  onSubmit: (amountMinor: number) => void;
  onCancel?: (() => void) | undefined;
}) {
  const id = useId();
  const [value, setValue] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const invalid = touched && value === null;

  const submit = () => {
    setTouched(true);
    if (value === null) return;
    onSubmit(Math.round(value * 100));
  };

  return (
    <div className="space-y-3">
      <MoneyInput
        id={id}
        label={label}
        value={value}
        onValueChange={setValue}
        error={invalid}
        helperText={invalid ? t.amountInvalid : hint}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="solid"
          tone="finyk"
          size="sm"
          onClick={submit}
        >
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t.cancel}
          </Button>
        )}
      </div>
    </div>
  );
}
