/**
 * Last validated: 2026-07-20
 * Status: Active
 *
 * Description field + merchant hint chips for ManualExpenseSheet.
 * Extracted for Hard Rule #18 (`max-lines: 600`).
 */
import type { Dispatch, SetStateAction } from "react";
import type { UseFormRegister, UseFormSetValue } from "react-hook-form";
import type { FrequentMerchant } from "@sergeant/finyk-domain/domain/personalization";
import { Input } from "@shared/components/ui/Input";
import { Label } from "@shared/components/ui/FormField";
import { formatMoney, pluralTimes } from "@sergeant/shared";
import {
  CATEGORY_SLUGS,
  upgradeCategory,
  type CategorySlug,
} from "./manualExpenseCategories";
import type { ExpenseFormValues } from "./manualExpenseForm";

interface ManualExpenseDescriptionSectionProps {
  formId: string;
  descId: string;
  isSubmitting: boolean;
  showMerchantHints: boolean;
  merchantSuggestions: FrequentMerchant[];
  setDescFocused: Dispatch<SetStateAction<boolean>>;
  setAiAppliedCategory: Dispatch<SetStateAction<CategorySlug | null>>;
  register: UseFormRegister<ExpenseFormValues>;
  setValue: UseFormSetValue<ExpenseFormValues>;
}

export function ManualExpenseDescriptionSection({
  formId,
  descId,
  isSubmitting,
  showMerchantHints,
  merchantSuggestions,
  setDescFocused,
  setAiAppliedCategory,
  register,
  setValue,
}: ManualExpenseDescriptionSectionProps) {
  return (
    <div>
      <Label htmlFor={descId} optional>
        Назва
      </Label>
      <Input
        id={descId}
        placeholder="Кава, продукти, таксі…"
        disabled={isSubmitting}
        aria-controls={showMerchantHints ? `${formId}-merchants` : undefined}
        aria-autocomplete="list"
        {...register("description", {
          onBlur: () => setDescFocused(false),
        })}
        onFocus={() => setDescFocused(true)}
      />
      {showMerchantHints && (
        <div
          id={`${formId}-merchants`}
          className="flex flex-wrap gap-1.5 mt-2"
          role="group"
          aria-label="Нещодавні мерчанти"
        >
          {merchantSuggestions.map((m) => (
            <button
              key={m.key}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setValue("description", m.name, { shouldDirty: true });
                // Якщо є впевнений підпис manual-категорії для цього
                // мерчанта — підставляємо його, щоб економити тапи.
                // suggestedManualCategory може бути Era 1/2/3 — upgradeCategory
                // нормалізує до slug.
                const suggestedRaw = m.suggestedManualCategory;
                const suggested =
                  suggestedRaw &&
                  CATEGORY_SLUGS.includes(upgradeCategory(suggestedRaw))
                    ? upgradeCategory(suggestedRaw)
                    : null;
                if (suggested) {
                  setValue("category", suggested, { shouldDirty: true });
                  // 6.3: surface the auto-applied category via an AI
                  // badge near the category section so users can see
                  // why their category changed and dismiss if wrong.
                  setAiAppliedCategory(suggested);
                }
              }}
              className="px-2.5 py-1 rounded-full text-style-caption bg-panelHi text-muted border border-line hover:border-muted/50 transition-colors"
              title={`${m.count} ${pluralTimes(m.count)} · ${formatMoney(m.total)}`}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
