/**
 * Last validated: 2026-07-20
 * Status: Active
 *
 * Manual expense add/edit sheet. Orchestrates form state and delegates
 * amount / description / category UI to sibling sections so this file
 * stays under Hard Rule #18 (`max-lines: 600`). Category slug system
 * lives in `./manualExpenseCategories`; pure helpers in
 * `./manualExpenseForm`.
 */
import { useState, useId, useMemo, useEffect } from "react";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { useApiForm } from "@shared/forms";
import { Label } from "@shared/components/ui/FormField";
import { Sheet } from "@shared/components/ui/Sheet";
import { toLocalISODate, useVisualKeyboardInset } from "@sergeant/shared";
import { hapticSuccess } from "@shared/lib/adapters/haptic";
import {
  CANONICAL_TO_MANUAL_LABEL,
  type FrequentCategory,
  type FrequentMerchant,
} from "@sergeant/finyk-domain/domain/personalization";
import {
  CATEGORY_DISPLAY,
  CATEGORY_SLUGS,
  DEFAULT_CATEGORY,
  upgradeCategory,
  type CategorySlug,
} from "./manualExpenseCategories";
import {
  CATEGORY_COLLAPSED_COUNT,
  buildAmountSuggestions,
  expenseFormSchema,
  sortCategoriesByFrequency,
  toExpenseInstant,
  type ExpenseFormValues,
} from "./manualExpenseForm";
import { ManualExpenseAmountSection } from "./ManualExpenseAmountSection";
import { ManualExpenseDescriptionSection } from "./ManualExpenseDescriptionSection";
import { ManualExpenseCategorySection } from "./ManualExpenseCategorySection";

// Re-exported for backward-compat with existing importers / tests.
export {
  CATEGORY_DISPLAY,
  upgradeCategory,
  type CategorySlug,
} from "./manualExpenseCategories";

interface ManualExpenseSheetProps {
  open: boolean;
  onClose: () => void;
  onSave?: (expense: {
    id?: string;
    description: string;
    amount: number;
    category: string;
    date: string;
  }) => void;
  /**
   * Delete the expense currently being edited. Only wired in edit mode
   * (`initialExpense.id` present) — the desktop path has no swipe gesture,
   * so the in-sheet "Видалити" action is the only way to remove a manual
   * expense without a touch device.
   */
  onDelete?: (id: string) => void;
  initialExpense?: {
    id?: string;
    description?: string;
    amount?: number;
    category?: string;
    date?: string;
  } | null;
  frequentCategories?: FrequentCategory[];
  frequentMerchants?: FrequentMerchant[];
  initialCategory?: string | null;
  initialDescription?: string | null;
}

export function ManualExpenseSheet({
  open,
  onClose,
  onSave,
  onDelete,
  initialExpense,
  frequentCategories = [],
  frequentMerchants = [],
  initialCategory,
  initialDescription,
}: ManualExpenseSheetProps) {
  const formId = useId();
  const descId = `${formId}-desc`;
  const amountId = `${formId}-amount`;
  const dateId = `${formId}-date`;
  const catLabelId = `${formId}-cat-label`;
  const kbInsetPx = useVisualKeyboardInset(open);
  const isEditing = !!initialExpense?.id;

  const { register, submit, reset, setValue, watch, formState, isSubmitting } =
    useApiForm<ExpenseFormValues, void>({
      schema: expenseFormSchema,
      defaultValues: {
        description: "",
        amount: "",
        category: DEFAULT_CATEGORY,
        date: toLocalISODate(),
      },
      onSubmit: async (values) => {
        const slug = upgradeCategory(values.category);
        const trimmedDesc = values.description.trim();
        // Fallback description uses the UA label from the display map.
        const description =
          trimmedDesc || (CATEGORY_DISPLAY[slug]?.label ?? slug);
        hapticSuccess();
        onSave?.({
          ...(initialExpense?.id ? { id: String(initialExpense.id) } : {}),
          description,
          amount: parseFloat(values.amount),
          // Write path: always emit slug (Era 3).
          category: slug,
          // "YYYY-MM-DD" як local date може з'їхати при toISOString() в UTC.
          // Ставимо полудень, щоб стабільно зберігати правильний день.
          date: toExpenseInstant(values.date || toLocalISODate()),
        });
        onClose();
      },
    });

  const description = watch("description");
  const category = watch("category");
  const date = watch("date");
  const amount = watch("amount");
  const amountError = formState.errors.amount?.message;

  // 6.2 hero preview — show big display-hero typography above the input
  // once a value is set. Input stays editable below. Parsed defensively
  // because react-hook-form stores `amount` as string while the schema
  // validates it as a non-empty numeric string.
  const amountNumeric = useMemo(() => {
    if (!amount) return 0;
    const n = parseFloat(amount);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [amount]);
  const amountHeroVisible = amountNumeric > 0;

  // 6.3 inline AI suggestion — surfaces the silent merchant-driven
  // category auto-application as a dismissible badge. Set when a
  // merchant chip with `suggestedManualCategory` is clicked; cleared on
  // dismiss OR when the user picks a different category manually OR on
  // form reset.
  const [aiAppliedCategory, setAiAppliedCategory] =
    useState<CategorySlug | null>(null);

  // showDateField — UI-only, не частина zod-схеми. Раніше жило в
  // form-state, але то був лиш toggle для видимості поля — без валідації
  // чи подачі на сервер. Тримаємо окремо, щоб схема лишалася
  // чистою (description/amount/category/date).
  const [showDateField, setShowDateField] = useState(false);

  // UI-only toggle-и, які скидаються в reset-ефекті нижче. Оголошені тут
  // (перед ефектом), щоб їхні сеттери були доступні у момент виклику.
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [descFocused, setDescFocused] = useState(false);

  const openInitKey = useMemo(
    () =>
      open
        ? [
            initialExpense?.id ?? "new",
            initialCategory ?? "",
            initialDescription ?? "",
            frequentCategories.map((c) => c.id).join(","),
          ].join("|")
        : "",
    [
      open,
      initialExpense,
      initialCategory,
      initialDescription,
      frequentCategories,
    ],
  );
  const [prevOpenInitKey, setPrevOpenInitKey] = useState("");

  useEffect(() => {
    if (!open) {
      void Promise.resolve().then(() => {
        setPrevOpenInitKey("");
      });
      return;
    }
    if (openInitKey === prevOpenInitKey) return;

    void Promise.resolve().then(() => {
      setPrevOpenInitKey(openInitKey);

      if (initialExpense?.id) {
        reset({
          description: String(initialExpense.description || ""),
          amount:
            initialExpense.amount != null ? String(initialExpense.amount) : "",
          category: upgradeCategory(initialExpense.category),
          date: initialExpense.date
            ? toLocalISODate(initialExpense.date)
            : toLocalISODate(),
        });
      } else {
        let startCategory: CategorySlug = DEFAULT_CATEGORY;
        if (initialCategory) {
          startCategory = upgradeCategory(initialCategory);
        } else if (frequentCategories.length > 0) {
          const top = frequentCategories[0];
          if (top) {
            const manualLabel =
              typeof top.manualLabel === "string" ? top.manualLabel : null;
            const canonicalLabel = top.id
              ? CANONICAL_TO_MANUAL_LABEL[top.id]
              : null;
            const topSlug = manualLabel ?? canonicalLabel;
            const upgradedTopSlug = topSlug ? upgradeCategory(topSlug) : null;
            if (upgradedTopSlug && CATEGORY_SLUGS.includes(upgradedTopSlug)) {
              startCategory = upgradedTopSlug;
            }
          }
        }
        reset({
          description:
            typeof initialDescription === "string" ? initialDescription : "",
          amount: "",
          category: startCategory,
          date: toLocalISODate(),
        });
      }
      setCategoriesExpanded(false);
      setDescFocused(false);
      setShowDateField(false);
      setAiAppliedCategory(null);
    });
  }, [
    open,
    openInitKey,
    prevOpenInitKey,
    initialExpense,
    initialCategory,
    initialDescription,
    frequentCategories,
    reset,
  ]);

  const sortedCategories = useMemo(
    () => sortCategoriesByFrequency(frequentCategories),
    [frequentCategories],
  );

  // Top-N категорії для згорнутого стану. Якщо обрана категорія випадає
  // за межі top-N — підтягуємо її у видимий ряд, щоб активний чип завжди
  // залишався видимим і не плутав користувача при відкритті аркуша.
  // Normalise the watched category value so comparison against slug list is
  // stable even if a legacy value slips through.
  const categorySlug = upgradeCategory(category);

  const visibleCategories = useMemo(() => {
    if (categoriesExpanded) return sortedCategories;
    const base = sortedCategories.slice(0, CATEGORY_COLLAPSED_COUNT);
    if (categorySlug && !base.includes(categorySlug)) {
      return [categorySlug, ...base].slice(0, CATEGORY_COLLAPSED_COUNT);
    }
    return base;
  }, [sortedCategories, categoriesExpanded, categorySlug]);
  const hasHiddenCategories =
    sortedCategories.length > CATEGORY_COLLAPSED_COUNT;

  const amountSuggestions = useMemo(
    () => buildAmountSuggestions(frequentMerchants),
    [frequentMerchants],
  );

  // Список мерчант-пропозицій, що рендериться інлайн під полем «Назва»
  // замість окремої секції «Нещодавнє». Ховаємо мерчанта, якого вже
  // введено як опис. Видимість регулюється через `showMerchantHints`
  // нижче — показуємо лише поки поле порожнє або у фокусі, щоб не
  // перевантажувати аркуш, коли користувач уже обрав назву.
  const merchantSuggestions = useMemo(() => {
    if (!frequentMerchants.length) return [];
    const currentKey = (description || "").trim().toLocaleLowerCase("uk-UA");
    return frequentMerchants
      .filter((m) => m.name && m.name.toLocaleLowerCase("uk-UA") !== currentKey)
      .slice(0, 5);
  }, [frequentMerchants, description]);
  const showMerchantHints =
    merchantSuggestions.length > 0 &&
    (descFocused || description.trim() === "");

  if (!open) return null;

  // Sheet рендерить footer окремо від body, тож submit-кнопка не сидить в
  // <form>. `useApiForm.submit` приймає опціональний event і все одно
  // проходить zod-валідацію + isSubmitting флаг.
  const handleSubmit = () => {
    void submit();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEditing ? "Редагувати витрату" : "Додати витрату"}
      kbInsetPx={kbInsetPx}
      panelClassName="finyk-sheet"
      bodyClassName="space-y-4"
      footer={
        <div className="space-y-2">
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Скасувати
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isEditing ? "Зберегти" : "Додати"}
            </Button>
          </div>
          {isEditing && onDelete && initialExpense?.id ? (
            <Button
              variant="danger"
              className="w-full"
              onClick={() => {
                const id = String(initialExpense.id);
                onDelete(id);
                onClose();
              }}
              disabled={isSubmitting}
            >
              Видалити
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-3">
        {/* S15: amount is the only «must-fill» field — it used to live
            under the name input, so new users had to scroll past an
            optional field before they could do the single thing that
            makes an expense valid. Amount is now the first block on the
            sheet; the mic stays near it because dictation typically
            produces both the amount and the description in one shot. */}
        <ManualExpenseAmountSection
          amountId={amountId}
          amountSuggestions={amountSuggestions}
          amountError={amountError}
          amountHeroVisible={amountHeroVisible}
          amountNumeric={amountNumeric}
          isSubmitting={isSubmitting}
          register={register}
          setValue={setValue}
        />

        <ManualExpenseDescriptionSection
          formId={formId}
          descId={descId}
          isSubmitting={isSubmitting}
          showMerchantHints={showMerchantHints}
          merchantSuggestions={merchantSuggestions}
          setDescFocused={setDescFocused}
          setAiAppliedCategory={setAiAppliedCategory}
          register={register}
          setValue={setValue}
        />

        {/* Date is "today" 95%+ of the time — the always-visible picker
            forced a tap out to a native date sheet just to confirm what
            was already true. Collapse behind a chip; reveal only when the
            user explicitly says "not today" or when editing an older
            entry where the date is already not today. */}
        {date !== toLocalISODate() || showDateField ? (
          <div>
            <Label htmlFor={dateId}>Дата</Label>
            <Input
              id={dateId}
              type="date"
              disabled={isSubmitting}
              {...register("date")}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowDateField(true)}
            className="text-xs text-muted hover:text-text underline decoration-dotted underline-offset-2 transition-colors"
          >
            Не сьогодні? Змінити дату
          </button>
        )}

        <ManualExpenseCategorySection
          catLabelId={catLabelId}
          aiAppliedCategory={aiAppliedCategory}
          categorySlug={categorySlug}
          visibleCategories={visibleCategories}
          hasHiddenCategories={hasHiddenCategories}
          categoriesExpanded={categoriesExpanded}
          setCategoriesExpanded={setCategoriesExpanded}
          setAiAppliedCategory={setAiAppliedCategory}
          setValue={setValue}
        />
      </div>
    </Sheet>
  );
}
