/**
 * Last validated: 2026-07-31
 * Status: Active
 *
 * Amount block for ManualExpenseSheet — quick chips, hero preview,
 * numeric input, and voice dictation. Extracted for Hard Rule #18.
 *
 * AI-CONTEXT: the `NumericAccessoryBar` (+10 / +100 / +500 / `.00` strip
 * that used to float under the focused amount field) was removed on
 * founder request 2026-07-31 — it covered the field on both the витрата
 * and надходження tabs and duplicated the numeric keypad. Merchant-driven
 * `amountSuggestions` above the input stay: they are real per-user amounts,
 * not blind increments.
 */
import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { UseFormRegister, UseFormSetValue } from "react-hook-form";
import { Input } from "@shared/components/ui/Input";
import { Label } from "@shared/components/ui/FormField";
import { VoiceMicButton } from "@shared/components/ui/VoiceMicButton";
import { parseExpenseSpeech, formatMoney } from "@sergeant/shared";
import { canonicalizeAmountInput } from "@shared/lib/format/amount";
import { groupIntegerDigits } from "@shared/lib/format/digitGrouping";
import { useGroupedAmountField } from "@shared/hooks/useGroupedAmountField";
import type { ExpenseFormValues } from "./manualExpenseForm";

interface AmountSuggestion {
  value: number;
  personal: boolean;
}

interface ManualExpenseAmountSectionProps {
  amountId: string;
  amountSuggestions: AmountSuggestion[];
  amountError: string | undefined;
  amountHeroVisible: boolean;
  amountNumeric: number;
  isSubmitting: boolean;
  register: UseFormRegister<ExpenseFormValues>;
  setValue: UseFormSetValue<ExpenseFormValues>;
  /**
   * UX-15: the parent sheet populates this ref with a "focus the amount
   * input" callback so batch entry ("Зберегти й додати ще") can jump the
   * cursor back to the amount field for the next item.
   */
  focusRef?: MutableRefObject<(() => void) | null>;
}

export function ManualExpenseAmountSection({
  amountId,
  amountSuggestions,
  amountError,
  amountHeroVisible,
  amountNumeric,
  isSubmitting,
  register,
  setValue,
  focusRef,
}: ManualExpenseAmountSectionProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Publish a focus callback to the parent (batch entry re-focus).
  useEffect(() => {
    if (!focusRef) return;
    focusRef.current = () => inputRef.current?.focus();
    return () => {
      focusRef.current = null;
    };
  }, [focusRef]);
  // RHF owns the field ref; keep a local handle too so the batch-entry
  // re-focus callback above can drive the input directly.
  const amountReg = useGroupedAmountField(register("amount"));

  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1">
        <Label htmlFor={amountId}>Сума ₴</Label>
        {amountSuggestions.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-1.5 mb-2"
            role="group"
            aria-label="Швидкі суми"
          >
            {amountSuggestions.map(({ value, personal }) => (
              <button
                key={`${personal ? "f" : "q"}-${value}`}
                type="button"
                onClick={() =>
                  setValue("amount", groupIntegerDigits(String(value)), {
                    shouldDirty: true,
                    shouldValidate: Boolean(amountError),
                  })
                }
                className={
                  personal
                    ? "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-style-caption bg-success/10 text-success-strong dark:text-success border border-success/30 hover:bg-success/15 transition-colors tabular-nums"
                    : "px-2.5 py-1 rounded-full text-style-caption bg-panelHi text-muted border border-line hover:border-muted/50 transition-colors tabular-nums"
                }
                aria-label={
                  personal
                    ? `${formatMoney(value)} · часта сума`
                    : `${formatMoney(value)}`
                }
              >
                {personal ? (
                  <span
                    aria-hidden
                    className="w-1.5 h-1.5 rounded-full bg-finyk"
                  />
                ) : null}
                {formatMoney(value)}
              </button>
            ))}
          </div>
        )}
        {/* 6.2: display-hero preview anchors the sheet on the single
            "must-fill" field. Input stays editable below so users can
            tap to correct without losing the visual emphasis. Hidden
            from screen readers (aria-hidden) — the editable input
            below carries the accessible label + value. */}
        {amountHeroVisible ? (
          <div
            aria-hidden
            className="text-style-display font-mono tabular-nums text-finyk-strong dark:text-finyk leading-none mb-2 select-none"
          >
            {formatMoney(amountNumeric)}
          </div>
        ) : null}
        <Input
          id={amountId}
          // `type="text"` навмисно: `type="number"` віддає порожній
          // `value` для «12,50», тож нормалізація коми стала б неможливою.
          // `inputMode="decimal"` усе одно піднімає цифрову клавіатуру.
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          maxLength={20}
          showCharCount={false}
          error={!!amountError}
          disabled={isSubmitting}
          helperText={amountError ?? undefined}
          {...amountReg}
          ref={(el) => {
            amountReg.ref(el);
            inputRef.current = el;
          }}
          onBlur={(e) => {
            // «Виправити й показати результат»: « 12,50 » → 12.50. На
            // UA-клавіатурі кома — норма, тож показуємо, як зрозуміли,
            // замість inline-помилки. Невалідний ввід лишаємо як є —
            // помилка валідації має пояснювати саме те, що набрали.
            const canonical = groupIntegerDigits(
              canonicalizeAmountInput(e.target.value),
            );
            if (canonical !== e.target.value) {
              setValue("amount", canonical, {
                shouldDirty: true,
                shouldValidate: Boolean(amountError),
              });
            }
            void amountReg.onBlur(e);
          }}
        />
      </div>
      {/* Гола іконка мікрофона губилася серед решти хрому форми — люди не
          розуміли, що витрату можна надиктувати цілком. Тому в неї є
          видимий підпис «Сказати».

          Підпис передається ПРОПОМ, а не сусіднім елементом. Раніше він
          стояв окремим `<span>` у цьому ж `div`, і тутешній коментар
          стверджував, що контейнер «сколапситься» разом із кнопкою. Не
          сколапсувався: `VoiceMicButton` повертає `null`, а span лишався
          сиротою — підпис без іконки в кожному сценарії, де голосу немає
          (провайдер не підтримується; з 2026-08-10 — вимкнений
          kill-switch). Привʼязка до компонента робить це неможливим. */}
      <VoiceMicButton
        size="md"
        label="Сказати голосом"
        caption="Сказати"
        captionWrapperClassName="pb-1"
        promptHint="Витрата у гривнях: кава 60 гривень, продукти 350 грн, таксі 200, обід 150."
        onResult={(transcript) => {
          const parsed = parseExpenseSpeech(transcript);
          if (!parsed) return;
          if (parsed.name) {
            setValue("description", parsed.name, { shouldDirty: true });
          }
          if (parsed.amount != null) {
            setValue(
              "amount",
              groupIntegerDigits(String(Math.round(parsed.amount))),
              {
                shouldDirty: true,
                shouldValidate: Boolean(amountError),
              },
            );
          }
        }}
      />
    </div>
  );
}
