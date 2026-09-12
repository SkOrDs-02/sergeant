/**
 * Last validated: 2026-09-12
 * Status: Active
 *
 * Manual expense add/edit sheet. Orchestrates form state and delegates
 * the visible blocks to sibling sections so this file stays under Hard
 * Rule #18 (`max-lines: 600`): `ManualExpenseKindTabs`,
 * `ManualExpenseAmountSection`, `ManualExpenseDescriptionSection`,
 * `ManualExpenseDateSection`, `ManualExpenseCategorySection` and
 * `ManualExpenseFooter`. Category slug system lives in
 * `./manualExpenseCategories`; pure helpers in `./manualExpenseForm`.
 *
 * **Три блоки про ЗБЕРЕЖЕНИЙ запис, не про чернетку.** Позиції чека
 * (`ReceiptItemsSection`), місток до пасиву (`DebtTxLinkSection`) і чек
 * Сільпо (`SilpoReceiptSection`) читають те, що лежить у сховищі, і
 * рендеряться лише в режимі редагування. Показувати їх поруч із
 * недописаною правкою було б брехнею, а місток ще й записав би в пасив
 * суму, якої в сховищі ще немає. Рішення «чи показувати місток і в якій
 * ролі» — чиста `decideManualDebtLink` у `./manualDebtLink`.
 */
import { useState, useId, useMemo, useEffect, useRef } from "react";
import { useApiForm } from "@shared/forms";
import { Sheet } from "@shared/components/ui/Sheet";
import { toLocalISODate } from "@sergeant/shared";
import { hapticSuccess } from "@shared/lib/adapters/haptic";
import {
  classifyDateBound,
  DATE_WARN_MESSAGE,
} from "@shared/lib/time/dateBounds";
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
import type {
  Debt,
  SetLinkedTxRole,
} from "@sergeant/finyk-domain/domain/debtEngine";
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
  INCOME_CATEGORY_SLUGS,
  incomeCustomCategories,
  incomeCategoryDisplay,
  expenseCustomCategories,
  upgradeIncomeCategory,
} from "./manualIncomeCategories";
import {
  buildAmountSuggestions,
  expenseAmountHryvnia,
  expenseFormSchema,
  getFrequentCategorySlugs,
  sortCategoriesByFrequency,
  toExpenseInstant,
  type ExpenseFormValues,
} from "./manualExpenseForm";
import { SilpoReceiptSection } from "./SilpoReceiptSection";
import { ManualExpenseAmountSection } from "./ManualExpenseAmountSection";
import { ManualExpenseDescriptionSection } from "./ManualExpenseDescriptionSection";
import { ManualExpenseCategorySection } from "./ManualExpenseCategorySection";
import { ReceiptItemsSection } from "./ReceiptItemsSection";
import { useManualCategoryHydration } from "./useManualCategoryHydration";
import { ManualExpenseKindTabs } from "./ManualExpenseKindTabs";
import { ManualExpenseDateSection } from "./ManualExpenseDateSection";
import { ManualExpenseFooter } from "./ManualExpenseFooter";
import { DebtTxLinkSection } from "./DebtTxLinkSection";
import { decideManualDebtLink } from "./manualDebtLink";

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
   * Витрати й надходження мають окремі каталоги: `kind: "income"`
   * потрапляє лише до надходжень, а відсутній `kind` лишається legacy-
   * сумісною витратною категорією.
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
  /**
   * Пасиви й сетер ролі привʼязки — для містка «запис із категорією Борг →
   * пасив» (див. {@link DebtTxLinkSection}). Опційні: поверхня, яка лише
   * СТВОРЮЄ запис (`SilpoUnmatchedReceipts`), місток показати не може —
   * привʼязувати ще нема чого, — тож і пропи їй не потрібні.
   */
  manualDebts?: readonly Debt[] | undefined;
  setManualDebts?: ((updater: (debts: Debt[]) => Debt[]) => void) | undefined;
  setLinkedTxRole?: SetLinkedTxRole | undefined;
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
  manualDebts,
  setManualDebts,
  setLinkedTxRole,
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
    () => expenseCustomCategories(customCategories),
    [customCategories],
  );
  const customIds = useMemo(
    () => new Set(customExpenseCategories.map((c) => c.id)),
    [customExpenseCategories],
  );
  const customIncomeCategories = useMemo(
    () => incomeCustomCategories(customCategories),
    [customCategories],
  );
  const customIncomeIds = useMemo(
    () => new Set(customIncomeCategories.map((c) => c.id)),
    [customIncomeCategories],
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
                const s = customIncomeIds.has(values.category)
                  ? values.category
                  : upgradeIncomeCategory(values.category);
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
              ? customIncomeIds.has(String(initialExpense.category ?? ""))
                ? String(initialExpense.category)
                : upgradeIncomeCategory(initialExpense.category)
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
    customIncomeIds,
    reset,
  ]);

  const sortedCategories = useMemo(
    () => sortCategoriesByFrequency(frequentCategories),
    [frequentCategories],
  );
  const frequentCategoryIds = useMemo(
    () => getFrequentCategorySlugs(frequentCategories).slice(0, 5),
    [frequentCategories],
  );

  // Довантаження власних категорій ПІСЛЯ відкриття аркуша.
  //
  // Слоти сховища віддають синхронний LS як фолбек першого пейнту, а
  // значення з SQLite приходить, «once it warms» (`useStorage.ts`). Аркуш,
  // відкритий у цьому вікні, бачить порожні custom-id набори, і категорія
  // редагованого запису вже нормалізувалась у дефолт свого типу. Гвардія
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
  const initialRecordIsIncome = initialExpense
    ? resolveManualExpenseKind(initialExpense) === "income"
    : false;
  useManualCategoryHydration({
    open,
    openInitKey,
    rawInitialCategory,
    initialRecordIsIncome,
    customExpenseIds: customIds,
    customIncomeIds,
    category,
    restoreCategory: (categoryId) =>
      setValue("category", categoryId, { shouldDirty: false }),
  });

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
    ? incomeCategoryDisplay(customIncomeCategories)
    : { ...CATEGORY_DISPLAY, ...customCategoryDisplay };

  // Normalise the watched category value so comparison against slug list is
  // stable even if a legacy value slips through. Income has a fixed 5-slug
  // taxonomy (§3, fab-and-manual-income spec) — no frequency sort.
  const categorySlug = category
    ? isIncome
      ? customIncomeIds.has(category)
        ? category
        : upgradeIncomeCategory(category)
      : upgradeCategoryAllowingCustom(category, customIds)
    : "";

  // Спільна пошукова шторка показує весь активний набір категорій.
  // Власні йдуть у хвіст: частотне сортування рахується лише по вбудованих
  // (`sortCategoriesByFrequency` — перестановка `CATEGORY_SLUGS`), тож
  // вмішувати їх у той порядок означало б вигадати їм ранг.
  const categorySlugs: string[] = isIncome
    ? [...INCOME_CATEGORY_SLUGS, ...customIncomeCategories.map((c) => c.id)]
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

  // Місток «запис із категорією Борг → пасив» (§ 4a канону Фініка).
  // Рішення чисте й живе в `./manualDebtLink` — там же пояснено, чому
  // воно читає ЗБЕРЕЖЕНИЙ запис, а не поля форми.
  const savedDebtLink = decideManualDebtLink(
    initialExpense,
    expenseId ? txSplits?.[expenseId] : null,
  );

  // Видалення звʼязуємо з id ТУТ, а не у футері: рішення «що саме
  // видаляти» і «чи закривати аркуш» належить аркушу. `null` — коли
  // видаляти нічого (створення) або викликач не дав обробника.
  const handleDelete =
    isEditing && onDelete && initialExpense?.id
      ? () => {
          onDelete(String(initialExpense.id));
          onClose();
        }
      : null;

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
        <ManualExpenseFooter
          isEditing={isEditing}
          isSubmitting={isSubmitting}
          createLabel={sheetTitle}
          onCancel={onClose}
          onSubmit={handleSubmit}
          onSubmitKeepOpen={handleSubmitKeepOpen}
          onDelete={handleDelete}
        />
      }
    >
      <div className="space-y-3">
        <ManualExpenseKindTabs
          isIncome={isIncome}
          isSubmitting={isSubmitting}
          onKindChange={handleKindChange}
        />

        {isEditing && receiptId != null && (
          <ReceiptItemsSection receiptId={receiptId} />
        )}

        {expenseId &&
          savedDebtLink &&
          manualDebts &&
          setManualDebts &&
          setLinkedTxRole && (
            <DebtTxLinkSection
              txId={expenseId}
              txAmountKop={Math.round(
                Math.abs(initialExpense?.amount ?? 0) * 100,
              )}
              txDateIso={initialExpense?.date ?? ""}
              manualDebts={manualDebts}
              setManualDebts={setManualDebts}
              setLinkedTxRole={setLinkedTxRole}
              txRole={savedDebtLink.txRole}
              splitAmountUAH={savedDebtLink.splitAmountUAH}
            />
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

        <ManualExpenseDateSection
          dateId={dateId}
          date={date}
          dateError={dateError}
          dateWarning={dateWarning}
          showDateField={showDateField}
          isSubmitting={isSubmitting}
          onReveal={() => setShowDateField(true)}
          onDateChange={(iso) =>
            setValue("date", iso, { shouldDirty: true, shouldValidate: false })
          }
          register={register}
        />

        <ManualExpenseCategorySection
          catLabelId={catLabelId}
          categoryDisplay={categoryDisplay}
          aiAppliedCategory={aiAppliedCategory}
          categoryError={categoryError}
          categorySlug={categorySlug}
          categorySlugs={categorySlugs}
          frequentCategoryIds={isIncome ? [] : frequentCategoryIds}
          register={register}
          setValue={setValue}
          setAiAppliedCategory={setAiAppliedCategory}
        />
      </div>
    </Sheet>
  );
}
