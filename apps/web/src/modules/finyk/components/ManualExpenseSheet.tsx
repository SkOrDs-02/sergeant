import { useState, useEffect, useId, useMemo } from "react";
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
import { formatMoney } from "@sergeant/shared";
import {
  CANONICAL_TO_MANUAL_LABEL,
  type FrequentCategory,
  type FrequentMerchant,
} from "@sergeant/finyk-domain/domain/personalization";

// Manual-expense categories. Labels map to the MCC canonical ids used
// across the rest of Finyk (see `MANUAL_CATEGORY_ID_MAP`), so manual
// entries and bank transactions share one taxonomy for analytics and
// budgets. Emojis mirror the MCC labels for visual consistency.
const CATEGORIES = [
  "🍴 їжа",
  "🛍 продукти",
  "🍔 кафе та ресторани",
  "🚗 транспорт",
  "🎮 розваги",
  "💊 здоров'я",
  "🛍️ покупки",
  "🏠 комунальні",
  "📱 техніка",
  "🎵 підписки",
  "📚 навчання",
  "✈️ подорожі",
  "🏷 інше",
];
const DEFAULT_CATEGORY = "🏷 інше";

// Legacy labels (pre-emoji). Old manual expenses stored category as e.g.
// "їжа". When loaded for edit, we upgrade the string to its emoji
// counterpart so the picker highlights it; saved value still round-trips
// through `MANUAL_CATEGORY_ID_MAP` for personalization/analytics.
const LEGACY_CATEGORY_UPGRADE: Record<string, string> = {
  їжа: "🍴 їжа",
  транспорт: "🚗 транспорт",
  розваги: "🎮 розваги",
  "здоров'я": "💊 здоров'я",
  одяг: "🛍️ покупки",
  комунальні: "🏠 комунальні",
  техніка: "📱 техніка",
  інше: "🏷 інше",
};

function upgradeCategory(raw: string | null | undefined) {
  if (!raw) return DEFAULT_CATEGORY;
  if (CATEGORIES.includes(raw)) return raw;
  const up = LEGACY_CATEGORY_UPGRADE[raw];
  return up || raw;
}

// Strips leading emoji + space so "🍴 їжа" → "їжа", used as a human-readable
// fallback description when the user leaves the name empty. We accept any
// run of non-letter / non-digit grapheme chunks so compound emoji (zwj
// sequences, variation selectors) all get peeled off.
function stripEmoji(label: string) {
  const str = String(label || "");
  let i = 0;
  while (i < str.length && !/[\p{L}\p{N}]/u.test(str[i]!)) i++;
  return str.slice(i).trim();
}

// Amount suggestion pills. Defaults give a first-run user sane round
// values; personalised «часті» amounts (from top merchants’ average
// spend) are merged into the same row and rendered first, marked with
// a small dot so the user can still tell which suggestion is based on
// their own history. One row instead of two separately-labelled rows
// cuts visual chrome without hiding the personalised shortcuts.
const DEFAULT_AMOUNTS = [50, 100, 200, 500];
const MAX_AMOUNT_CHIPS = 6;

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
) {
  if (!frequentCategories.length) return CATEGORIES;
  // Перетворюємо частотну статистику на індекс manual-label → rank.
  // Для canonical id беремо відповідний manual-label; для custom / невідомих —
  // використовуємо original manualLabel, якщо він є у списку кнопок.
  const rank = new Map<string, number>();
  frequentCategories.forEach((cat, idx) => {
    const label =
      cat.manualLabel && CATEGORIES.includes(cat.manualLabel)
        ? cat.manualLabel
        : CANONICAL_TO_MANUAL_LABEL[cat.id];
    if (label && CATEGORIES.includes(label) && !rank.has(label)) {
      rank.set(label, idx);
    }
  });
  const withRank = CATEGORIES.map((c, originalIdx) => ({
    label: c,
    rank: rank.has(c) ? (rank.get(c) ?? Infinity) : Infinity,
    originalIdx,
  }));
  withRank.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.originalIdx - b.originalIdx;
  });
  return withRank.map((x) => x.label);
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
        const trimmedDesc = values.description.trim();
        const description = trimmedDesc || stripEmoji(values.category);
        hapticSuccess();
        onSave?.({
          ...(initialExpense?.id ? { id: String(initialExpense.id) } : {}),
          description,
          amount: parseFloat(values.amount),
          category: values.category,
          // "YYYY-MM-DD" як local date може з'їхати при toISOString() в UTC.
          // Ставимо полудень, щоб стабільно зберігати правильний день.
          date: values.date
            ? new Date(`${values.date}T12:00:00`).toISOString()
            : new Date().toISOString(),
        });
        onClose();
      },
    });

  const description = watch("description");
  const category = watch("category");
  const date = watch("date");
  const amountError = formState.errors.amount?.message;

  // showDateField — UI-only, не частина zod-схеми. Раніше жило в
  // form-state, але то був лиш toggle для видимості поля — без валідації
  // чи подачі на сервер. Тримаємо окремо, щоб схема лишалася
  // чистою (description/amount/category/date).
  const [showDateField, setShowDateField] = useState(false);

  useEffect(() => {
    if (open) {
      if (initialExpense?.id) {
        const d = initialExpense.date
          ? new Date(initialExpense.date)
          : new Date();
        reset({
          description: String(initialExpense.description || ""),
          amount:
            initialExpense.amount != null ? String(initialExpense.amount) : "",
          category: upgradeCategory(initialExpense.category),
          date: toLocalISODate(d),
        });
      } else {
        // Пріоритет: явна initialCategory (клік з дашборду) > найчастіша
        // категорія з статистики > дефолт ("інше"). Будь-яка legacy
        // мітка ("їжа", "транспорт") оновлюється до emoji-версії.
        let startCategory = DEFAULT_CATEGORY;
        if (initialCategory) {
          startCategory = upgradeCategory(initialCategory);
        } else if (frequentCategories.length > 0) {
          const top = frequentCategories[0];
          const topLabel =
            top!.manualLabel! && typeof top!.manualLabel! === "string"
              ? upgradeCategory(top!.manualLabel!)
              : CANONICAL_TO_MANUAL_LABEL[top!.id!]
                ? upgradeCategory(CANONICAL_TO_MANUAL_LABEL[top!.id!])
                : null;
          if (topLabel && CATEGORIES.includes(topLabel)) {
            startCategory = topLabel;
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
      // UI-only state (категорії розгорнуті / фокус у полі Назва) зберігається
      // між відкриттями, бо компонент змонтований постійно (FinykApp тримає
      // його як always-rendered). Скидаємо до дефолтів, щоб новий «Додати
      // витрату» не успадковував стан попереднього відкриття.
      setCategoriesExpanded(false);
      setDescFocused(false);
      setShowDateField(false);
    }
    // frequentCategories/initialCategory/initialDescription лише задають
    // стартовий стан при відкритті — навмисно не реагуємо на їхні
    // оновлення у відкритому sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialExpense]);

  const sortedCategories = useMemo(
    () => sortCategoriesByFrequency(frequentCategories),
    [frequentCategories],
  );

  // Top-N категорії для згорнутого стану. Якщо обрана категорія випадає
  // за межі top-N — підтягуємо її у видимий ряд, щоб активний чип завжди
  // залишався видимим і не плутав користувача при відкритті аркуша.
  const CATEGORY_COLLAPSED_COUNT = 6;
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const visibleCategories = useMemo(() => {
    if (categoriesExpanded) return sortedCategories;
    const base = sortedCategories.slice(0, CATEGORY_COLLAPSED_COUNT);
    if (category && !base.includes(category)) {
      return [category, ...base].slice(0, CATEGORY_COLLAPSED_COUNT);
    }
    return base;
  }, [sortedCategories, categoriesExpanded, category]);
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
  const [descFocused, setDescFocused] = useState(false);
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
        <div className="flex gap-3">
          <Button
            variant="ghost"
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
                        className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                      />
                    ) : null}
                    {formatMoney(value)}
                  </button>
                ))}
              </div>
            )}
            <Input
              id={amountId}
              type="number"
              inputMode="decimal"
              placeholder="0"
              min="0"
              step="0.01"
              aria-invalid={amountError ? true : undefined}
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
            <span className="text-2xs text-subtle select-none" aria-hidden>
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
                    const suggested =
                      m.suggestedManualCategory &&
                      CATEGORIES.includes(m.suggestedManualCategory)
                        ? m.suggestedManualCategory
                        : null;
                    if (suggested) {
                      setValue("category", suggested, { shouldDirty: true });
                    }
                  }}
                  className="px-2.5 py-1 rounded-full text-style-caption bg-panelHi text-muted border border-line hover:border-muted/50 transition-colors"
                  title={`${m.count} разів · ${formatMoney(m.total)}`}
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
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-labelledby={catLabelId}
          >
            {visibleCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setValue("category", cat, { shouldDirty: true })}
                className={`px-3 py-1.5 rounded-full text-style-caption border transition-[background-color,border-color,color,opacity,transform] duration-150 ease-smooth active:scale-95 ${
                  category === cat
                    ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                    : "bg-panelHi text-muted border-line hover:border-muted/50 hover:bg-panelHi/80"
                }`}
              >
                {cat}
              </button>
            ))}
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
