/**
 * Last validated: 2026-05-20
 * Status: Active
 */
import { useState, useId, useMemo } from "react";
import { z } from "zod";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { useApiForm } from "@shared/forms/useApiForm";
import { Label } from "@shared/components/ui/FormField";
import { Sheet } from "@shared/components/ui/Sheet";
import { VoiceMicButton } from "@shared/components/ui/VoiceMicButton";
import {
  parseExpenseSpeech,
  toLocalISODate,
  useVisualKeyboardInset,
} from "@sergeant/shared";
import { hapticSuccess } from "@shared/lib/adapters/haptic";
import { formatMoney, pluralTimes } from "@sergeant/shared";
import { Icon } from "@shared/components/ui/Icon";
import { Badge } from "@shared/components/ui/Badge";
import {
  CANONICAL_TO_MANUAL_LABEL,
  type FrequentCategory,
  type FrequentMerchant,
} from "@sergeant/finyk-domain/domain/personalization";

// Category-slug system (types, display map, three-era upgrade) extracted to
// `./manualExpenseCategories` to keep this component under the 600-LOC
// `max-lines` gate (Hard Rule #18 / initiative 0013). Re-exported below for
// backward-compat with existing importers.
import {
  CATEGORY_DISPLAY,
  CATEGORY_SLUGS,
  DEFAULT_CATEGORY,
  isCategorySlug,
  upgradeCategory,
  type CategorySlug,
} from "./manualExpenseCategories";

export {
  CATEGORY_DISPLAY,
  upgradeCategory,
  type CategorySlug,
} from "./manualExpenseCategories";

// Amount suggestion pills. Defaults give a first-run user sane round
// values; personalised «часті» amounts (from top merchants' average
// spend) are merged into the same row and rendered first, marked with
// a small dot so the user can still tell which suggestion is based on
// their own history. One row instead of two separately-labelled rows
// cuts visual chrome without hiding the personalised shortcuts.
const DEFAULT_AMOUNTS = [50, 100, 200, 500];
const MAX_AMOUNT_CHIPS = 6;
const DAY_NOON_UTC = "T12:00:00.000Z";

function toExpenseInstant(dayKey: string): string {
  // API stores an ISO instant; UTC noon preserves the selected day key
  // without reading the host-local timezone.
  return new Date(Date.parse(`${dayKey}${DAY_NOON_UTC}`)).toISOString();
}

function buildAmountSuggestions(
  frequentMerchants: FrequentMerchant[] | undefined,
) {
  const frequentRaw: number[] = [];
  for (const m of frequentMerchants || []) {
    if (!m || typeof m.total !== "number" || !m.count) continue;
    const avg = Math.round(m.total / m.count);
    if (avg > 0 && !frequentRaw.includes(avg)) frequentRaw.push(avg);
    if (frequentRaw.length >= 3) break;
  }
  const frequent = frequentRaw.map((v) => ({ value: v, personal: true }));
  const quick = DEFAULT_AMOUNTS.filter((v) => !frequentRaw.includes(v)).map(
    (v) => ({ value: v, personal: false }),
  );
  return [...frequent, ...quick].slice(0, MAX_AMOUNT_CHIPS);
}

// Сортує доступні підписи категорій за персональною частотою, зберігаючи
// стабільний порядок для категорій без статистики.
// `amount` зберігається як string (бо Input value="" легше описується як
// string); refine перевіряє parse + > 0. description / category / date —
// вільні string-поля без mandatory-валідаторів, бо UI дає дефолти.
const expenseFormSchema = z.object({
  description: z.string(),
  amount: z
    .string()
    .refine(
      (v) => Boolean(v) && !Number.isNaN(parseFloat(v)) && parseFloat(v) > 0,
      "Вкажи суму більше 0",
    ),
  category: z.string().min(1),
  date: z.string(),
});

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

function sortCategoriesByFrequency(
  frequentCategories: FrequentCategory[] = [],
): CategorySlug[] {
  if (!frequentCategories.length) return CATEGORY_SLUGS;
  // Перетворюємо частотну статистику на індекс slug → rank.
  // manualLabel може зберігати будь-яку з 3 ер — upgradeCategory нормалізує.
  // CANONICAL_TO_MANUAL_LABEL повертає slug (F5b), тож подвійне upgradeCategory
  // — no-op для Era 3; безпечно для Era 2/1.
  const rank = new Map<CategorySlug, number>();
  frequentCategories.forEach((cat, idx) => {
    const rawLabel = cat.manualLabel
      ? upgradeCategory(cat.manualLabel)
      : cat.id
        ? upgradeCategory(CANONICAL_TO_MANUAL_LABEL[cat.id] ?? null)
        : null;
    const slug = rawLabel && isCategorySlug(rawLabel) ? rawLabel : null;
    if (slug && CATEGORY_SLUGS.includes(slug) && !rank.has(slug)) {
      rank.set(slug, idx);
    }
  });
  const withRank = CATEGORY_SLUGS.map((slug, originalIdx) => ({
    slug,
    rank: rank.has(slug) ? (rank.get(slug) ?? Infinity) : Infinity,
    originalIdx,
  }));
  withRank.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.originalIdx - b.originalIdx;
  });
  return withRank.map((x) => x.slug);
}

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

  const [prevOpen, setPrevOpen] = useState(open);
  if (open && !prevOpen) {
    setPrevOpen(true);
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
  } else if (!open && prevOpen) {
    setPrevOpen(false);
  }

  const sortedCategories = useMemo(
    () => sortCategoriesByFrequency(frequentCategories),
    [frequentCategories],
  );

  // Top-N категорії для згорнутого стану. Якщо обрана категорія випадає
  // за межі top-N — підтягуємо її у видимий ряд, щоб активний чип завжди
  // залишався видимим і не плутав користувача при відкритті аркуша.
  const CATEGORY_COLLAPSED_COUNT = 6;

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
                className="text-style-display-hero font-mono tabular-nums text-finyk-strong dark:text-finyk leading-none mb-2 select-none"
              >
                {formatMoney(amountNumeric)}
              </div>
            ) : null}
            <Input
              id={amountId}
              type="number"
              inputMode="decimal"
              placeholder="0"
              min="0"
              step="0.01"
              error={!!amountError}
              disabled={isSubmitting}
              helperText={amountError ?? undefined}
              {...register("amount")}
            />
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

        <div>
          <Label htmlFor={descId} optional>
            Назва
          </Label>
          <Input
            id={descId}
            placeholder="Кава, продукти, таксі…"
            disabled={isSubmitting}
            aria-controls={
              showMerchantHints ? `${formId}-merchants` : undefined
            }
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

        <div>
          <div
            id={catLabelId}
            // eslint-disable-next-line sergeant-design/no-eyebrow-drift -- Category group label needs a stable id (catLabelId) for aria-labelledby; Label would require dropping htmlFor.
            className="block text-xs text-muted uppercase tracking-wide font-semibold mb-1"
          >
            Категорія
          </div>
          {/* 6.3: AI-applied badge surfaces the silent merchant→category
              auto-application. Renders only when AI applied and current
              category still matches the AI suggestion (so dismissal +
              manual overrides hide it). Dismiss = clear local state only;
              category stays applied (user can still change it via picker
              below).
              motion-safe wrappers — reduced-motion users see a static
              badge without the fade-in. */}
          {aiAppliedCategory && categorySlug === aiAppliedCategory ? (
            <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 mb-2">
              <Badge
                variant="finyk"
                tone="soft"
                size="sm"
                className="inline-flex items-center gap-1.5"
              >
                <Icon name="sparkles" size={12} aria-hidden />
                AI ·{" "}
                {CATEGORY_DISPLAY[aiAppliedCategory]?.label ??
                  aiAppliedCategory}
                <button
                  type="button"
                  onClick={() => setAiAppliedCategory(null)}
                  aria-label="Сховати AI-підказку"
                  className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-finyk/20 transition-colors touch-target"
                >
                  <Icon name="close" size={10} aria-hidden />
                </button>
              </Badge>
            </div>
          ) : null}
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-labelledby={catLabelId}
          >
            {visibleCategories.map((slug) => {
              const display = CATEGORY_DISPLAY[slug];
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => {
                    setValue("category", slug, { shouldDirty: true });
                    // Manual category pick supersedes any AI suggestion;
                    // clear the badge so it doesn't linger after an
                    // explicit user choice.
                    if (slug !== aiAppliedCategory) {
                      setAiAppliedCategory(null);
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-style-caption border transition-[background-color,border-color,color,opacity,transform] duration-150 ease-smooth active:scale-95 ${
                    categorySlug === slug
                      ? "bg-finyk-strong text-white border-finyk-strong shadow-sm"
                      : "bg-panelHi text-muted border-line hover:border-muted/50 hover:bg-panelHi/80"
                  }`}
                >
                  <Icon
                    name={display?.iconName ?? "tag"}
                    size="xs"
                    aria-hidden
                  />
                  {display?.label ?? slug}
                </button>
              );
            })}
            {hasHiddenCategories && (
              <button
                type="button"
                onClick={() => setCategoriesExpanded((v) => !v)}
                aria-expanded={categoriesExpanded}
                className="px-3 py-1.5 rounded-full text-style-caption border border-line bg-panel text-muted hover:text-text hover:border-muted/50 hover:bg-panelHi transition-[background-color,border-color,color,opacity,transform] duration-150 ease-smooth active:scale-95"
              >
                {categoriesExpanded ? "Менше ▴" : "Більше ▾"}
              </button>
            )}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
