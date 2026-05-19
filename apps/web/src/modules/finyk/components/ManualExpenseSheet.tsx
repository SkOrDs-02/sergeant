/**
 * Last validated: 2026-05-19
 * Status: Active
 */
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
import { Icon } from "@shared/components/ui/Icon";
import type { IconName } from "@shared/components/ui/Icon";
import {
  CANONICAL_TO_MANUAL_LABEL,
  type FrequentCategory,
  type FrequentMerchant,
} from "@sergeant/finyk-domain/domain/personalization";

// ─── Category slug system (F5b, 2026-05) ────────────────────────────────────
//
// Era 1 — pre-emoji (legacy): category stored as bare UA label, e.g. "їжа",
//   "транспорт". Upgraded at read-time via LEGACY_RAW_TO_SLUG.
//
// Era 2 — emoji-prefixed (legacy): "🍴 їжа", "🚗 транспорт". Upgraded at
//   read-time by stripping leading emoji, then mapping the UA label to slug
//   via UA_LABEL_TO_SLUG.
//
// Era 3 — slug (current): "food", "transport", "groceries", etc. Used
//   directly. Write path always emits a slug.
//
// Historical records in localStorage are NOT batch-migrated. upgradeCategory()
// normalises them on every read, then the result (always a slug) is stored
// on submit.

/** Typed category slugs. */
export type CategorySlug =
  | "food"
  | "groceries"
  | "cafe"
  | "transport"
  | "entertainment"
  | "health"
  | "shopping"
  | "utilities"
  | "tech"
  | "subscriptions"
  | "education"
  | "travel"
  | "other";

interface CategoryDisplay {
  iconName: IconName;
  /** Human-readable Ukrainian label shown in the chip. */
  label: string;
}

/**
 * Canonical display map: slug → { iconName, label }.
 * Single source of truth for rendering. No emoji — icons only.
 */
export const CATEGORY_DISPLAY: Record<CategorySlug, CategoryDisplay> = {
  food: { iconName: "utensils", label: "Їжа" },
  groceries: { iconName: "shopping-cart", label: "Продукти" },
  cafe: { iconName: "coffee", label: "Кафе та ресторани" },
  transport: { iconName: "truck", label: "Транспорт" },
  entertainment: { iconName: "sparkles", label: "Розваги" },
  health: { iconName: "heart", label: "Здоров'я" },
  shopping: { iconName: "tag", label: "Покупки" },
  utilities: { iconName: "home", label: "Комунальні" },
  tech: { iconName: "monitor", label: "Техніка" },
  subscriptions: { iconName: "repeat", label: "Підписки" },
  education: { iconName: "book", label: "Навчання" },
  travel: { iconName: "compass", label: "Подорожі" },
  other: { iconName: "tag", label: "Інше" },
};

/**
 * The ordered list of slugs used for the category picker.
 * Matches the former CATEGORIES array in display order.
 */
const CATEGORY_SLUGS: CategorySlug[] = [
  "food",
  "groceries",
  "cafe",
  "transport",
  "entertainment",
  "health",
  "shopping",
  "utilities",
  "tech",
  "subscriptions",
  "education",
  "travel",
  "other",
];

const DEFAULT_CATEGORY: CategorySlug = "other";

// Era 1 upgrade map: bare UA label (lower-case) → slug.
// Covers all the pre-emoji strings that were stored before the emoji era.
const LEGACY_RAW_TO_SLUG: Record<string, CategorySlug> = {
  їжа: "food",
  продукти: "groceries",
  "кафе та ресторани": "cafe",
  кафе: "cafe",
  транспорт: "transport",
  розваги: "entertainment",
  "здоров'я": "health",
  здоров: "health",
  одяг: "shopping",
  покупки: "shopping",
  комунальні: "utilities",
  техніка: "tech",
  підписки: "subscriptions",
  навчання: "education",
  подорожі: "travel",
  інше: "other",
};

// Era 2 upgrade map: stripped UA label from emoji string → slug.
// Keys are the labels that appear AFTER the emoji prefix (lower-case).
// Identical to LEGACY_RAW_TO_SLUG — the strip makes them equivalent,
// so we reuse the same map for both eras.
const UA_LABEL_TO_SLUG = LEGACY_RAW_TO_SLUG;

/** Returns true if the value is a known slug. */
function isCategorySlug(value: string): value is CategorySlug {
  return Object.prototype.hasOwnProperty.call(CATEGORY_DISPLAY, value);
}

/**
 * Strips leading emoji + space so "🍴 їжа" → "їжа".
 * Accepts any run of non-letter / non-digit grapheme chunks so compound
 * emoji (ZWJ sequences, variation selectors) are all peeled off.
 */
function stripLeadingEmoji(str: string): string {
  const s = String(str || "");
  let i = 0;
  while (i < s.length && !/[\p{L}\p{N}]/u.test(s[i]!)) i++;
  return s.slice(i).trim();
}

/**
 * Normalises any stored category value to a CategorySlug.
 *
 * Era 3 (slug): returned directly if recognised.
 * Era 2 (emoji-prefixed): emoji stripped, UA label looked up in UA_LABEL_TO_SLUG.
 * Era 1 (bare UA label): looked up directly in LEGACY_RAW_TO_SLUG.
 * Unknown: falls back to "other".
 *
 * @example
 * upgradeCategory("food")      // Era 3 → "food"
 * upgradeCategory("🍴 їжа")   // Era 2 → "food"
 * upgradeCategory("їжа")       // Era 1 → "food"
 * upgradeCategory(null)         // → "other"
 */
export function upgradeCategory(raw: string | null | undefined): CategorySlug {
  if (!raw) return DEFAULT_CATEGORY;

  const trimmed = raw.trim();

  // Era 3: known slug — use directly.
  if (isCategorySlug(trimmed)) return trimmed;

  // Era 2: emoji-prefixed string — strip emoji then map the UA label.
  // Era 1: bare UA label — also matched by the stripped path (no-op strip).
  const stripped = stripLeadingEmoji(trimmed).toLocaleLowerCase("uk-UA");
  const fromLabel = UA_LABEL_TO_SLUG[stripped];
  if (fromLabel) return fromLabel;

  // Unknown legacy value — graceful fallback.
  return DEFAULT_CATEGORY;
}

// Amount suggestion pills. Defaults give a first-run user sane round
// values; personalised «часті» amounts (from top merchants' average
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
          // upgradeCategory handles Era 1/2/3 stored values.
          category: upgradeCategory(initialExpense.category),
          date: toLocalISODate(d),
        });
      } else {
        // Пріоритет: явна initialCategory (клік з дашборду) > найчастіша
        // категорія з статистики > дефолт ("other"). Будь-яка legacy
        // мітка (Era 1/2) оновлюється до slug (Era 3).
        let startCategory: CategorySlug = DEFAULT_CATEGORY;
        if (initialCategory) {
          startCategory = upgradeCategory(initialCategory);
        } else if (frequentCategories.length > 0) {
          const top = frequentCategories[0];
          const topSlug =
            top!.manualLabel && typeof top!.manualLabel === "string"
              ? upgradeCategory(top!.manualLabel)
              : CANONICAL_TO_MANUAL_LABEL[top!.id!]
                ? upgradeCategory(CANONICAL_TO_MANUAL_LABEL[top!.id!])
                : null;
          if (topSlug && CATEGORY_SLUGS.includes(topSlug)) {
            startCategory = topSlug;
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
            {visibleCategories.map((slug) => {
              const display = CATEGORY_DISPLAY[slug];
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() =>
                    setValue("category", slug, { shouldDirty: true })
                  }
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
