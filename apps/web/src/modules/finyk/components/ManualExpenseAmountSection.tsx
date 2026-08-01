/**
 * Last validated: 2026-07-20
 * Status: Active
 *
 * Amount block for ManualExpenseSheet — quick chips, hero preview,
 * numeric input, and voice dictation. Extracted for Hard Rule #18.
 */
import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { UseFormRegister, UseFormSetValue } from "react-hook-form";
import { Input } from "@shared/components/ui/Input";
import { Label } from "@shared/components/ui/FormField";
import { NumericAccessoryBar } from "@shared/components/ui/NumericAccessoryBar";
import { VoiceMicButton } from "@shared/components/ui/VoiceMicButton";
import { parseExpenseSpeech, formatMoney } from "@sergeant/shared";
import { canonicalizeAmountInput } from "@shared/lib/format/amount";
import { useCoarsePointer } from "@shared/hooks/useCoarsePointer";
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
  const isCoarse = useCoarsePointer();
  const [amountFocused, setAmountFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Publish a focus callback to the parent (batch entry re-focus).
  useEffect(() => {
    if (!focusRef) return;
    focusRef.current = () => inputRef.current?.focus();
    return () => {
      focusRef.current = null;
    };
  }, [focusRef]);
  // RHF owns the field ref; keep a local handle too so the accessory bar can
  // read the live value and re-focus the input after a chip tap.
  const amountReg = register("amount");

  const commitAmount = (next: string) => {
    setValue("amount", next, {
      shouldDirty: true,
      shouldValidate: Boolean(amountError),
    });
  };

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
                  setValue("amount", String(value), {
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
                    ? `${formatMoney(value)} — часта сума`
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
          error={!!amountError}
          disabled={isSubmitting}
          helperText={amountError ?? undefined}
          {...amountReg}
          ref={(el) => {
            amountReg.ref(el);
            inputRef.current = el;
          }}
          onFocus={() => setAmountFocused(true)}
          onBlur={(e) => {
            // Delay so a tap on an accessory chip (which blurs the input)
            // doesn't tear the bar down before its click handler fires.
            window.setTimeout(() => setAmountFocused(false), 120);
            // «Виправити й показати результат»: « 12,50 » → 12.50. На
            // UA-клавіатурі кома — норма, тож показуємо, як зрозуміли,
            // замість inline-помилки. Невалідний ввід лишаємо як є —
            // помилка валідації має пояснювати саме те, що набрали.
            const canonical = canonicalizeAmountInput(e.target.value);
            if (canonical !== e.target.value) {
              setValue("amount", canonical, {
                shouldDirty: true,
                shouldValidate: Boolean(amountError),
              });
            }
            void amountReg.onBlur(e);
          }}
        />
        {/* UI-15: keyboard accessory bar — only on touch devices, only while
            the amount field is focused. Sits directly above the numeric
            keypad so round-number entry and confirm are one tap each. */}
        {isCoarse && amountFocused && (
          <NumericAccessoryBar
            className="mt-2 rounded-xl border"
            value={amountNumeric ? String(amountNumeric) : ""}
            onValueChange={(next) => {
              commitAmount(next);
              inputRef.current?.focus();
            }}
            onDone={() => inputRef.current?.blur()}
          />
        )}
      </div>
      {/* Mic-only icon was indistinguishable from the rest of the form
          chrome — users didn't realise they could dictate the whole
          expense. Pair the mic with a "Сказати" label so the affordance
          is visible at rest. `VoiceMicButton` hides itself when the
          Web Speech API isn't supported, so we hide the label too in
          that case via `hidden:*`-style absent fallback (the button
          returns null and the flex container collapses to the input
          alone). */}
      <div className="flex flex-col items-center gap-0.5 pb-1">
        <VoiceMicButton
          size="md"
          label="Сказати голосом"
          promptHint="Витрата у гривнях: кава 60 гривень, продукти 350 грн, таксі 200, обід 150."
          onResult={(transcript) => {
            const parsed = parseExpenseSpeech(transcript);
            if (!parsed) return;
            if (parsed.name) {
              setValue("description", parsed.name, { shouldDirty: true });
            }
            if (parsed.amount != null) {
              setValue("amount", String(Math.round(parsed.amount)), {
                shouldDirty: true,
                shouldValidate: Boolean(amountError),
              });
            }
          }}
        />
        <span
          className="text-style-caption text-subtle select-none"
          aria-hidden
        >
          Сказати
        </span>
      </div>
    </div>
  );
}
