/**
 * Last validated: 2026-07-29
 * Status: Active
 *
 * Manual expense add/edit sheet. Orchestrates form state and delegates
 * amount / description / category UI to sibling sections so this file
 * stays under Hard Rule #18 (`max-lines: 600`). Category slug system
 * lives in `./manualExpenseCategories`; pure helpers in
 * `./manualExpenseForm`.
 */
import { useState, useId, useMemo, useEffect, useRef } from "react";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { DateScrubber } from "@shared/components/ui/DateScrubber";
import { useApiForm } from "@shared/forms";
import { Label } from "@shared/components/ui/FormField";
import { Sheet } from "@shared/components/ui/Sheet";
import { toLocalISODate } from "@sergeant/shared";
import { hapticSuccess } from "@shared/lib/adapters/haptic";
import {
  classifyDateBound,
  DATE_WARN_MESSAGE,
  HARD_MAX_DAY_KEY,
  HARD_MIN_DAY_KEY,
} from "@shared/lib/time/dateBounds";
import { cn } from "@shared/lib/ui/cn";
import {
  CANONICAL_TO_MANUAL_LABEL,
  type FrequentCategory,
  type FrequentMerchant,
} from "@sergeant/finyk-domain/domain/personalization";
import {
  resolveManualExpenseKind,
  type ManualExpenseKind,
} from "@sergeant/finyk-domain/domain/transactions";
import type { CustomCategoryInput } from "@sergeant/finyk-domain";
import type { TxSplit, TxSplitsMap } from "@sergeant/finyk-domain/domain/types";
import {
  CATEGORY_DISPLAY,
  CATEGORY_SLUGS,
  DEFAULT_CATEGORY,
  upgradeCategory,
  upgradeCategoryAllowingCustom,
  type CategoryDisplay,
} from "./manualExpenseCategories";
import {
  INCOME_CATEGORY_DISPLAY,
  INCOME_CATEGORY_SLUGS,
  upgradeIncomeCategory,
} from "./manualIncomeCategories";
import {
  buildAmountSuggestions,
  expenseAmountHryvnia,
  expenseFormSchema,
  sortCategoriesByFrequency,
  toExpenseInstant,
  type ExpenseFormValues,
} from "./manualExpenseForm";
import { SilpoReceiptSection } from "./SilpoReceiptSection";
import { ManualExpenseAmountSection } from "./ManualExpenseAmountSection";
import { ManualExpenseDescriptionSection } from "./ManualExpenseDescriptionSection";
import { ManualExpenseCategorySection } from "./ManualExpenseCategorySection";
import { ReceiptItemsSection } from "./ReceiptItemsSection";

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
    kind: ManualExpenseKind;
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
    kind?: string;
    /** Legacy alias — see `resolveManualExpenseKind` in finyk-domain. */
    type?: string;
  } | null;
  frequentCategories?: FrequentCategory[];
  frequentMerchants?: FrequentMerchant[];
  initialCategory?: string | null;
  initialDescription?: string | null;
  /**
   * Привʼязана сума в гривнях для нового (не edit-mode) запису — напр.
   * «Створити витрату» з чека Сільпо без транзакції. Ігнорується в
   * edit-mode (`initialExpense.amount` лишається джерелом правди для
   * редагування). Число, не рядок: викликач знає суму з БД/API, а не з
   * форми.
   */
  initialAmount?: number | null;
  /** Дата ("YYYY-MM-DD") для того самого prefill-сценарію, що й
   * `initialAmount`. */
  initialDate?: string | null;
  /**
   * Категорії, які користувач завів сам. Вбудований набір
   * (`CATEGORY_SLUGS`) про них не знає, тож без цього пропа щойно
   * створена категорія просто не зʼявлялась у пікері — спіймано
   * бета-тестером 2026-08-10.
   *
   * Лише для витрат: надходження мають фіксовану таксономію з пʼяти
   * слагів (`INCOME_CATEGORY_SLUGS`, спека fab-and-manual-income §3), і
   * `mergeExpenseCategoryDefinitions` у домені так само зшиває власні
   * категорії тільки з витратними.
   */
  customCategories?: readonly CustomCategoryInput[];
  /** Device-local чек, привʼязаний до цієї ручної витрати (спека §
   * Розгортка) — `null`/`undefined`, коли пристрій про чек не знає, або
   * коли аркуш відкрито для НОВОГО запису (нова витрата не може мати
   * чек). Джерело: `useFinykReceiptLinks`. */
  receiptId?: number | null | undefined;
  /**
   * Спліти всіх операцій — потрібні лише секції чека Сільпо: вона
   * пропонує розбивку і має попередити, що підтвердження замінить уже
   * наявну ручну.
   */
  txSplits?: TxSplitsMap | undefined;
  /** Той самий сетер, що й у деталях банківської операції. Без нього
   * секція чека не рендериться. */
  onSplitChange?: ((id: string, splits: TxSplit[] | null) => void) | undefined;
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
  initialAmount,
  initialDate,
  customCategories = [],
  receiptId = null,
  txSplits,
  onSplitChange,
}: ManualExpenseSheetProps) {
  const formId = useId();
  const descId = `${formId}-desc`;
  const amountId = `${formId}-amount`;
  const dateId = `${formId}-date`;
  const catLabelId = `${formId}-cat-label`;
  const isEditing = !!initialExpense?.id;
  /** Id збереженого запису — він же transactionId для звʼязки з чеком. */
  const expenseId = initialExpense?.id ? String(initialExpense.id) : null;
  const [kind, setKind] = useState<ManualExpenseKind>("expense");

  // Власні категорії — лише витратні (див. проп). Тримаємо їх окремим
  // мемо, щоб `customIds` був стабільним для нормалізації нижче.
  const customExpenseCategories = useMemo(
    () =>
      customCategories.filter(
        (c): c is CustomCategoryInput =>
          typeof c?.id === "string" && c.id.trim() !== "",
      ),
    [customCategories],
  );
  const customIds = useMemo(
    () => new Set(customExpenseCategories.map((c) => c.id)),
    [customExpenseCategories],
  );

  // UX-15 batch entry. `keepOpenRef` is read inside `onSubmit` to decide
  // whether to close or reset-and-stay. `batchFocusRef` lets the amount
  // field register a focus callback so the next item starts amount-first.
  const keepOpenRef = useRef(false);
  const batchFocusRef = useRef<(() => void) | null>(null);

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
        // Branch fully per-kind (rather than indexing a union display map
        // with a union slug) so each `display[slug]` lookup stays narrowly
        // typed against its own taxonomy.
        const slug: string =
          kind === "income"
            ? (() => {
                const s = upgradeIncomeCategory(values.category);
                return s;
              })()
            : (() => {
                // `upgradeCategory` звів би id власної категорії до
                // `DEFAULT_CATEGORY` — саме тут обрана людиною категорія
                // тихо ставала «Інше».
                const s = upgradeCategoryAllowingCustom(
                  values.category,
                  customIds,
                );
                return s;
              })();
        hapticSuccess();
        onSave?.({
          ...(initialExpense?.id ? { id: String(initialExpense.id) } : {}),
          description: trimmedDesc,
          // Локальний blob Фініка досі зберігає гривні (див.
          // domain-invariants.md § Money) — парсер лише гарантує, що сюди
          // не доїде `1e9`, `12.345` чи відʼємне.
          amount: expenseAmountHryvnia(values.amount),
          // Write path: always emit slug (Era 3).
          category: slug,
          // "YYYY-MM-DD" як local date може зʼїхати при toISOString() в UTC.
          // Ставимо полудень, щоб стабільно зберігати правильний день.
          date: toExpenseInstant(values.date || toLocalISODate()),
          kind,
        });

        // UX-15: "Додати ще" keeps the sheet open for rapid batch entry.
        // We reset only the per-item fields (description + amount) and keep
        // category, date and kind so logging a run of same-category expenses
        // (e.g. a grocery haul split by item) is amount-only. `keepOpenRef`
        // is a ref, not state, so it never triggers a re-render mid-submit;
        // it's consumed then immediately cleared for the next submit.
        if (keepOpenRef.current) {
          keepOpenRef.current = false;
          reset({
            description: "",
            amount: "",
            category: values.category,
            date: values.date,
          });
          setDescFocused(false);
          setAiAppliedCategory(null);
          batchFocusRef.current?.();
          return;
        }
        onClose();
      },
    });

  const description = watch("description");
  const category = watch("category");
  const date = watch("date");
  const amount = watch("amount");
  const amountError = formState.errors.amount?.message;
  const categoryError = formState.errors.category?.message;
  const dateError = formState.errors.date?.message;
  const dateWarning = useMemo(
    () =>
      date && classifyDateBound(date) === "warn" ? DATE_WARN_MESSAGE : null,
    [date],
  );

  // 6.2 hero preview — show big display-hero typography above the input
  // once a value is set. Input stays editable below. Parsed defensively
  // because react-hook-form stores `amount` as string while the schema
  // validates it as a non-empty numeric string.
  const amountNumeric = useMemo(
    () => (amount ? expenseAmountHryvnia(amount) : 0),
    [amount],
  );
  const amountHeroVisible = amountNumeric > 0;

  // 6.3 inline AI suggestion — surfaces the silent merchant-driven
  // category auto-application as a dismissible badge. Set when a
  // merchant chip with `suggestedManualCategory` is clicked; cleared on
  // dismiss OR when the user picks a different category manually OR on
  // form reset.
  const [aiAppliedCategory, setAiAppliedCategory] = useState<string | null>(
    null,
  );

  // showDateField — UI-only, не частина zod-схеми. Раніше жило в
  // form-state, але то був лиш toggle для видимості поля — без валідації
  // чи подачі на сервер. Тримаємо окремо, щоб схема лишалася
  // чистою (description/amount/category/date).
  const [showDateField, setShowDateField] = useState(false);

  // UI-only toggle, який скидається в reset-ефекті нижче. Оголошений тут
  // (перед ефектом), щоб його сеттер був доступний у момент виклику.
  const [descFocused, setDescFocused] = useState(false);

  const openInitKey = useMemo(
    () =>
      open
        ? [
            initialExpense?.id ?? "new",
            initialCategory ?? "",
            initialDescription ?? "",
            initialAmount ?? "",
            initialDate ?? "",
            frequentCategories.map((c) => c.id).join(","),
          ].join("|")
        : "",
    [
      open,
      initialExpense,
      initialCategory,
      initialDescription,
      initialAmount,
      initialDate,
      frequentCategories,
    ],
  );
  const [prevOpenInitKey, setPrevOpenInitKey] = useState("");

  useEffect(() => {
    if (!open) {
      // Чистимо форму синхронно, ще до відкладеного скиду ключа нижче.
      //
      // Скид `prevOpenInitKey` навмисно лишається в мікротаску (синхронний
      // `setState` тут ловить `react-hooks/set-state-in-effect`), але саме
      // через цю відкладеність він міг не встигнути до наступного відкриття:
      // тоді `openInitKey === prevOpenInitKey`, ранній `return` нижче зʼїдав
      // `reset()`, і аркуш відкривався з недобитою чернеткою — поле суми
      // лишалося заповненим, а новий ввід дописувався в кінець («50000» +
      // «50000» = «5000050000», browser QA 2026-08-04, F-009). `reset()` —
      // метод react-hook-form, не React-стан, тож він тут дозволений і
      // прибирає чернетку незалежно від того, чи виграв мікротаск гонку.
      reset({
        description: "",
        amount: "",
        category: DEFAULT_CATEGORY,
        date: toLocalISODate(),
      });
      void Promise.resolve().then(() => {
        setPrevOpenInitKey("");
      });
      return;
    }
    if (openInitKey === prevOpenInitKey) return;

    void Promise.resolve().then(() => {
      setPrevOpenInitKey(openInitKey);

      if (initialExpense?.id) {
        const initialKind = resolveManualExpenseKind(initialExpense);
        setKind(initialKind);
        reset({
          description: String(initialExpense.description || ""),
          amount:
            initialExpense.amount != null ? String(initialExpense.amount) : "",
          category:
            initialKind === "income"
              ? upgradeIncomeCategory(initialExpense.category)
              : upgradeCategoryAllowingCustom(
                  initialExpense.category,
                  customIds,
                ),
          date: initialExpense.date
            ? toLocalISODate(initialExpense.date)
            : toLocalISODate(),
        });
      } else {
        setKind("expense");
        // Не `CategorySlug`: власна категорія за визначенням поза union-ом.
        let startCategory: string = DEFAULT_CATEGORY;
        if (initialCategory) {
          startCategory = upgradeCategoryAllowingCustom(
            initialCategory,
            customIds,
          );
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
          amount: initialAmount != null ? String(initialAmount) : "",
          category: startCategory,
          date: initialDate || toLocalISODate(),
        });
      }
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
    initialAmount,
    initialDate,
    frequentCategories,
    // Гвардія `openInitKey === prevOpenInitKey` вище робить цю залежність
    // безкоштовною: зміна набору власних категорій перезапустить ефект,
    // він побачить незмінений ключ і вийде, не чіпаючи чернетку форми.
    customIds,
    reset,
  ]);

  const sortedCategories = useMemo(
    () => sortCategoriesByFrequency(frequentCategories),
    [frequentCategories],
  );

  // Довантаження власних категорій ПІСЛЯ відкриття аркуша.
  //
  // Слоти сховища віддають синхронний LS як фолбек першого пейнту, а
  // значення з SQLite приходить, «once it warms» (`useStorage.ts`). Аркуш,
  // відкритий у цьому вікні, бачить порожній `customIds`, і категорія
  // редагованої витрати вже нормалізувалась у `DEFAULT_CATEGORY`. Гвардія
  // `openInitKey` ефекту ініціалізації правильно не дає йому
  // перезапуститись — він скинув би чернетку, — тож без окремої звірки
  // збереження записало б «Інше» замість власної категорії. Рівно та
  // мовчазна підміна, проти якої цей аркуш і правили. Знайдено ревʼю #781.
  //
  // Звірка спрацьовує РІВНО ОДИН РАЗ на відкриття. Це не оптимізація, а
  // єдина працездатна семантика: `dirtyFields` тут не помічник, бо RHF
  // рахує dirty відносно `defaultValues`, а там уже лежить `other` —
  // вибір «Інше» руками не відрізняється від нашої ж нормалізації. Ефект
  // без лічильника через це бився б із користувачем: кожен вибір «Інше»
  // після гідратації одразу перекидало б назад на власну категорію.
  //
  // Лишається один неоднозначний випадок: людина свідомо обрала «Інше» до
  // того, як категорії доїхали. Її вибір один раз перекине на збережену
  // категорію. Це видима зміна, яку видно й можна повторити, — на відміну
  // від альтернативи, де ми тихо перезаписуємо реальні дані на «Інше».
  const rawInitialCategory = initialExpense?.category ?? initialCategory;
  const reconciledKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      reconciledKeyRef.current = null;
      return;
    }
    const trimmed = rawInitialCategory?.trim();
    if (!trimmed || !customIds.has(trimmed)) return;
    if (reconciledKeyRef.current === openInitKey) return;
    reconciledKeyRef.current = openInitKey;
    if (category !== DEFAULT_CATEGORY) return;
    setValue("category", trimmed, { shouldDirty: false });
  }, [open, openInitKey, rawInitialCategory, customIds, category, setValue]);

  const isIncome = kind === "income";

  // Підписи власних категорій. `tag` — та сама іконка, що й у вбудованого
  // «Інше»: власної категорія не має, а заводити тут другий словник іконок
  // поруч із канонічним не варто. Порожній `label` навмисно пропускаємо —
  // фолбек `display[slug]?.label ?? slug` на місці рендера чесніший за
  // порожній рядок у списку.
  const customCategoryDisplay: Readonly<Record<string, CategoryDisplay>> =
    Object.fromEntries(
      customExpenseCategories
        .filter((c) => c.label)
        .map((c) => [c.id, { iconName: "tag" as const, label: c.label ?? "" }]),
    );

  // Без `useMemo`: React Compiler не зміг зберегти ручну мемоізацію на
  // гілці з достроковими return-ами (`react-hooks/preserve-manual-memoization`),
  // а сам він це кешує краще. Обчислення — спред двох невеликих обʼєктів.
  const categoryDisplay: Readonly<Record<string, CategoryDisplay>> = isIncome
    ? INCOME_CATEGORY_DISPLAY
    : { ...CATEGORY_DISPLAY, ...customCategoryDisplay };

  // Normalise the watched category value so comparison against slug list is
  // stable even if a legacy value slips through. Income has a fixed 5-slug
  // taxonomy (§3, fab-and-manual-income spec) — no frequency sort.
  const categorySlug = category
    ? isIncome
      ? upgradeIncomeCategory(category)
      : upgradeCategoryAllowingCustom(category, customIds)
    : "";

  // Dropdown shows every category at once (D3 decision) — no collapsed
  // top-N row, so frequency ordering just becomes the <option> order.
  // Власні йдуть у хвіст: частотне сортування рахується лише по вбудованих
  // (`sortCategoriesByFrequency` — перестановка `CATEGORY_SLUGS`), тож
  // вмішувати їх у той порядок означало б вигадати їм ранг.
  const categorySlugs: string[] = isIncome
    ? [...INCOME_CATEGORY_SLUGS]
    : [...sortedCategories, ...customExpenseCategories.map((c) => c.id)];

  // Merchant-driven quick amounts / description hints are expense-only —
  // they come from banking-merchant history and have no income analogue.
  const amountSuggestions = useMemo(
    () => (isIncome ? [] : buildAmountSuggestions(frequentMerchants)),
    [isIncome, frequentMerchants],
  );

  // Список мерчант-пропозицій, що рендериться інлайн під полем «Назва»
  // замість окремої секції «Нещодавнє». Ховаємо мерчанта, якого вже
  // введено як опис. Видимість регулюється через `showMerchantHints`
  // нижче — показуємо лише поки поле порожнє або у фокусі, щоб не
  // перевантажувати аркуш, коли користувач уже обрав назву.
  const merchantSuggestions = useMemo(() => {
    if (isIncome || !frequentMerchants.length) return [];
    const currentKey = (description || "").trim().toLocaleLowerCase("uk-UA");
    return frequentMerchants
      .filter((m) => m.name && m.name.toLocaleLowerCase("uk-UA") !== currentKey)
      .slice(0, 5);
  }, [isIncome, frequentMerchants, description]);
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

  // UX-15: submit but keep the sheet open for the next item. Sets the ref
  // that `onSubmit` reads AFTER zod validation passes — so an invalid form
  // still surfaces errors and does NOT reset/stay in a misleading state.
  const handleSubmitKeepOpen = () => {
    keepOpenRef.current = true;
    void submit().then(() => {
      // If validation failed, `onSubmit` never ran, so the ref would leak
      // into the next (normal) submit. Clear it defensively here.
      if (Object.keys(formState.errors).length > 0) {
        keepOpenRef.current = false;
      }
    });
  };

  // A kind change invalidates the old taxonomy category. The required empty
  // value makes the user explicitly choose from the new taxonomy before save.
  const handleKindChange = (nextKind: ManualExpenseKind) => {
    if (nextKind === kind) return;
    setKind(nextKind);
    setValue("category", "", { shouldDirty: true, shouldValidate: true });
    setAiAppliedCategory(null);
  };

  const sheetTitle = isEditing
    ? isIncome
      ? "Редагувати надходження"
      : "Редагувати витрату"
    : isIncome
      ? "Додати надходження"
      : "Додати витрату";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={sheetTitle}
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
              {isEditing ? "Зберегти" : sheetTitle}
            </Button>
          </div>
          {!isEditing ? (
            <Button
              variant="ghost"
              className="w-full"
              onClick={handleSubmitKeepOpen}
              disabled={isSubmitting}
            >
              Зберегти й додати ще
            </Button>
          ) : null}
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
        {/* §1 fab-and-manual-income spec: segment switch lives at the top
            of the form itself (no fan-menu, no long-press) — defaults to
            Витрата. Switching resets the category to the new kind's
            default via handleKindChange. */}
        <div
          role="tablist"
          aria-label="Тип запису"
          className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-panelHi"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!isIncome}
            disabled={isSubmitting}
            onClick={() => handleKindChange("expense")}
            className={cn(
              "touch-target rounded-md text-style-body font-medium transition-colors duration-fast",
              !isIncome
                ? "bg-finyk-strong text-white shadow-sm"
                : "text-muted hover:text-text",
            )}
          >
            Витрата
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isIncome}
            disabled={isSubmitting}
            onClick={() => handleKindChange("income")}
            className={cn(
              "touch-target rounded-md text-style-body font-medium transition-colors duration-fast",
              isIncome
                ? "bg-finyk-strong text-white shadow-sm"
                : "text-muted hover:text-text",
            )}
          >
            Надходження
          </button>
        </div>

        {isEditing && receiptId != null && (
          <ReceiptItemsSection receiptId={receiptId} />
        )}

        {/* Чек Сільпо для РУЧНОЇ витрати. Та сама секція, що в деталях
            банківської операції: витрати, залиті скріном банкінгу, живуть
            у `finyk_manual_expenses`, і для людини вони така сама покупка
            в Сільпо — без цього блоку чек привʼязувався б, але ніде не
            показувався (репорт founder-а 2026-08-25).

            Сума й опис беруться з ЗБЕРЕЖЕНОГО запису, не з полів форми:
            чек звірявся саме з тим, що лежить у сховищі, і показувати
            його поруч із недописаною правкою було б брехнею. */}
        {isEditing && expenseId && onSplitChange && (
          <SilpoReceiptSection
            transactionId={expenseId}
            transactionDescription={initialExpense?.description}
            transactionAmountKop={Math.round(
              Math.abs(initialExpense?.amount ?? 0) * 100,
            )}
            transactionDateIso={initialExpense?.date ?? ""}
            onSplitChange={onSplitChange}
            customCategories={customCategories}
            existingSplitsCount={(txSplits?.[expenseId] ?? []).length}
          />
        )}

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
          focusRef={batchFocusRef}
        />

        <ManualExpenseDescriptionSection
          formId={formId}
          descId={descId}
          isSubmitting={isSubmitting}
          isIncome={isIncome}
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
            {/* UI-12: swap the OS date sheet for a horizontal day-scrubber
                for the common recent-date case. A hidden native input still
                backs react-hook-form registration (and covers picking a date
                older than the strip window via the "Інша дата" fallback). */}
            <DateScrubber
              aria-label="Дата витрати"
              value={date || toLocalISODate()}
              onChange={(iso) =>
                setValue("date", iso, {
                  shouldDirty: true,
                  shouldValidate: false,
                })
              }
            />
            <details className="mt-2">
              <summary className="text-style-caption text-muted hover:text-text cursor-pointer list-none underline decoration-dotted underline-offset-2">
                Інша дата
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
            {/* Мʼяке вікно: зберігати дозволено, але рік варто перечитати. */}
            {dateWarning ? (
              <p className="mt-2 text-style-caption text-warning-strong dark:text-warning">
                {dateWarning}
              </p>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowDateField(true)}
            className="text-style-caption text-muted hover:text-text underline decoration-dotted underline-offset-2 transition-colors"
          >
            Не сьогодні? Змінити дату
          </button>
        )}

        <ManualExpenseCategorySection
          catLabelId={catLabelId}
          categoryDisplay={categoryDisplay}
          aiAppliedCategory={aiAppliedCategory}
          categoryError={categoryError}
          categorySlug={categorySlug}
          categorySlugs={categorySlugs}
          register={register}
          setValue={setValue}
          setAiAppliedCategory={setAiAppliedCategory}
        />
      </div>
    </Sheet>
  );
}
