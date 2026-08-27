import { memo, useCallback, useId, useMemo, useState } from "react";
import { z } from "zod";
import {
  amountStringSchema,
  amountStringToHryvnia,
} from "@shared/lib/format/amountSchema";
import { parseAmountToMinor } from "@shared/lib/format/amount";
import { groupIntegerDigits } from "@shared/lib/format/digitGrouping";
import { useGroupedAmountField } from "@shared/hooks/useGroupedAmountField";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { Label } from "@shared/components/ui/FormField";
import { DateField } from "@shared/components/ui/DateField";
import { cn } from "@shared/lib/ui/cn";
import { useApiForm } from "@shared/forms";
import { messages } from "@shared/i18n/uk";
import type { Budget } from "@sergeant/finyk-domain/domain/types";
import {
  findLimitCategoryOverlaps,
  formatLimitBudgetLabel,
  isSameLimitCategorySet,
  limitBudgetCategoryIds,
} from "@sergeant/finyk-domain/domain/budget";
import type { MonoJarDto } from "@shared/api";
import { CategorySelector } from "../CategorySelector";
import { CategoryIconChip } from "../CategoryIconChip";
import { JarSelector } from "../JarSelector";
import { stripLeadingEmoji } from "../txRowHelpers";
import { Icon, type IconName } from "@shared/components/ui/Icon";
import { NAME_MAX_LEN } from "@shared/lib/text/limits";

export type BudgetFormType = "limit" | "goal";

/**
 * Normalized output shape — те, що `Budgets.tsx` додає в стан
 * `setBudgets`. id призначається на call-site (через `crypto.randomUUID()`).
 */
export type NewBudgetDraft =
  | {
      type: "limit";
      /** Перша категорія набору — legacy-поле для старих читачів. */
      categoryId: string;
      /** Повний набір категорій ліміту (1+). */
      categoryIds: string[];
      /** Власна назва комбо-ліміту; порожньо — авто з категорій. */
      label?: string;
      limit: number;
      period: "month" | "week" | "one_time";
      createdAt: string;
    }
  | {
      type: "goal";
      name: string;
      emoji: string;
      targetAmount: number;
      targetDate: string;
      linkedJarId?: string | undefined;
    };

export interface ExpenseCategoryOption {
  id: string;
  label?: string;
}

interface AddBudgetFormProps {
  existingBudgets: readonly Budget[];
  expenseCategoryList: readonly ExpenseCategoryOption[];
  /** Банки Monobank юзера — для дропдауна привʼязки цілі (design decision #3). */
  jars?: readonly MonoJarDto[];
  onSubmit: (draft: NewBudgetDraft) => void;
  onCancel: () => void;
}

// Іконка цілі. Поле в даних історично зветься `emoji` (і так само зветься
// колонка), але з 2026-08-03 містить імʼя іконки дизайн-системи, а не
// emoji-гліф — той рендерився системним шрифтом і виглядав по-різному на
// кожній ОС. Перейменування колонки — окрема двофазна міграція.
const GOAL_ICON_OPTIONS: readonly { icon: IconName; label: string }[] = [
  { icon: "target", label: "Ціль" },
  { icon: "home", label: "Житло" },
  { icon: "truck", label: "Авто" },
  { icon: "compass", label: "Подорож" },
  { icon: "monitor", label: "Техніка" },
  { icon: "camera", label: "Гаджет" },
  { icon: "heart", label: "Подія" },
  { icon: "book-open", label: "Освіта" },
  { icon: "dumbbell", label: "Спорт" },
  { icon: "piggy-bank", label: "Заощадження" },
];

const DEFAULT_GOAL_ICON: IconName = "target";

/** Легасі-значення (emoji чи порожньо) деградує до дефолтної іконки. */
function goalIconOf(raw: string | undefined): IconName {
  const known = GOAL_ICON_OPTIONS.find((o) => o.icon === raw);
  return known ? known.icon : DEFAULT_GOAL_ICON;
}

// Item #8 round-13: form-engine — `useApiForm` + zod для inline-create
// limit/goal-бюджету. Раніше state жив у `Budgets.tsx` (`newB`, `formError`),
// валідація крутилась у legacy-функціях `validateLimitBudgetForm` /
// `validateGoalBudgetForm` із `@sergeant/finyk-domain`. Тепер схема
// дублює ті ж правила як zod-резолвер: помилки кріпляться до конкретних
// полів, `categoryId`-dedup → `superRefine` із closure на
// `existingBudgets`, без top-level error-banner.
//
// Goal/limit мають різні набори полів, тож тримаємо два окремі
// `useApiForm`-інстанси замість discriminated union на одній схемі —
// uniform pattern, ще й RHF-state не зміщується між type-toggle-ами.
// Межі й нормалізація сум — спільні (спека beta-input-boundaries), тож
// «1e9» і 20-значний ліміт відсікаються так само, як у формі витрати.
// `integerOnly` зберігає наявну продуктову вимогу бюджетів: дробовий
// ліміт читається як помилка вводу, а не як намір.
const positiveNumberString = (message: string) =>
  amountStringSchema(message, { integerOnly: true });

/** Той самий парсер, що й у схемі — для enable/disable кнопки. */
const isValidAmountString = (value: string) => {
  const parsed = parseAmountToMinor(value);
  return parsed.ok && parsed.minor % 100 === 0;
};

type LimitFormValues = {
  type: "limit";
  /** Набір категорій ліміту; порядок = порядок додавання у формі. */
  categoryIds: string[];
  /** Власна назва комбо-ліміту (показується лише при 2+ категоріях). */
  label: string;
  limit: string;
  period: "month" | "week" | "one_time";
};

type GoalFormValues = {
  type: "goal";
  name: string;
  emoji: string;
  targetAmount: string;
  targetDate: string;
  /** ID банки Monobank (`MonoJarDto.monoJarId`) або "" — без банки. */
  linkedJarId: string;
};

const goalFormSchema = z.object({
  type: z.literal("goal"),
  name: z
    .string()
    .trim()
    .min(1, messages.validation.goalNameRequired)
    .max(NAME_MAX_LEN),
  emoji: z.string(),
  targetAmount: positiveNumberString(messages.validation.goalAmountRequired),
  targetDate: z.string(),
  linkedJarId: z.string(),
});

const LIMIT_DEFAULTS: LimitFormValues = {
  type: "limit",
  categoryIds: [],
  label: "",
  limit: "",
  period: "month",
};

const GOAL_DEFAULTS: GoalFormValues = {
  type: "goal",
  name: "",
  emoji: DEFAULT_GOAL_ICON,
  targetAmount: "",
  targetDate: "",
  linkedJarId: "",
};

function AddBudgetFormComponent({
  existingBudgets,
  expenseCategoryList,
  jars = [],
  onSubmit,
  onCancel,
}: AddBudgetFormProps) {
  const [formType, setFormType] = useState<BudgetFormType>("limit");
  const fieldId = useId();
  const limitAmountId = `${fieldId}-limit-amount`;
  const limitNameId = `${fieldId}-limit-name`;
  const goalNameId = `${fieldId}-goal-name`;
  const goalAmountId = `${fieldId}-goal-amount`;

  // Schema із dedup-check бере замикання на `existingBudgets`. Memoize,
  // щоб resolver-reference не змінювався на кожен parent-render
  // (інакше RHF буде reinit-ити internal-state).
  const limitFormSchema = useMemo(
    () =>
      z
        .object({
          type: z.literal("limit"),
          categoryIds: z
            .array(z.string().min(1))
            .min(1, messages.validation.categoryRequired),
          label: z.string().trim().max(NAME_MAX_LEN),
          limit: positiveNumberString(messages.validation.limitAmountRequired),
          period: z.enum(["month", "week", "one_time"]),
        })
        .superRefine((data, ctx) => {
          // Дублікат — лише ТОЧНО такий самий набір категорій; частковий
          // перетин дозволений і супроводжується попередженням нижче
          // (рішення founder-а 2026-08-25, multi-category limits).
          const dup = existingBudgets.some(
            (b) =>
              b?.type === "limit" &&
              isSameLimitCategorySet(
                limitBudgetCategoryIds(b),
                data.categoryIds,
              ),
          );
          if (dup) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["categoryIds"],
              message:
                data.categoryIds.length > 1
                  ? "Ліміт для цього набору категорій вже існує"
                  : "Ліміт для цієї категорії вже існує",
            });
          }
        }),
    [existingBudgets],
  );

  const limitForm = useApiForm<LimitFormValues, void>({
    schema: limitFormSchema,
    defaultValues: LIMIT_DEFAULTS,
    onSubmit: async (values) => {
      const label = values.label.trim();
      onSubmit({
        type: "limit",
        categoryId: values.categoryIds[0] ?? "",
        categoryIds: values.categoryIds,
        ...(label ? { label } : {}),
        limit: amountStringToHryvnia(values.limit),
        period: values.period,
        // eslint-disable-next-line no-restricted-syntax -- UTC creation instant for one-time limit anchoring, not a Kyiv day key
        createdAt: new Date().toISOString(),
      });
    },
  });

  const goalForm = useApiForm<GoalFormValues, void>({
    schema: goalFormSchema,
    defaultValues: GOAL_DEFAULTS,
    onSubmit: async (values) => {
      onSubmit({
        type: "goal",
        name: values.name.trim(),
        emoji: values.emoji,
        targetAmount: amountStringToHryvnia(values.targetAmount),
        targetDate: values.targetDate,
        linkedJarId: values.linkedJarId || undefined,
      });
    },
  });

  const limitCategoriesError = limitForm.formState.errors.categoryIds?.message;
  const limitAmountError = limitForm.formState.errors.limit?.message;
  const goalNameError = goalForm.formState.errors.name?.message;
  const goalAmountError = goalForm.formState.errors.targetAmount?.message;

  // Грошові поля лишаються `register`-полями (значення живе в DOM), тож
  // групування розрядів вішається декоратором на `onChange`.
  const limitAmountField = useGroupedAmountField(limitForm.register("limit"));
  const goalAmountField = useGroupedAmountField(
    goalForm.register("targetAmount"),
  );

  const goalEmoji = goalForm.watch("emoji");
  const goalTargetDate = goalForm.watch("targetDate");
  const limitCategoryIds = limitForm.watch("categoryIds");
  const limitAmount = limitForm.watch("limit");
  const limitPeriod = limitForm.watch("period");
  const goalName = goalForm.watch("name");
  const goalTargetAmount = goalForm.watch("targetAmount");
  const goalLinkedJarId = goalForm.watch("linkedJarId");

  const jarOptions = useMemo(
    () =>
      jars.map((j) => ({
        id: j.monoJarId,
        label: j.title?.trim() || j.monoJarId,
      })),
    [jars],
  );

  const categoryLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of expenseCategoryList) {
      m.set(c.id, c.label ? stripLeadingEmoji(c.label) : c.id);
    }
    return m;
  }, [expenseCategoryList]);
  const resolveCategoryLabel = useCallback(
    (id: string) => categoryLabelById.get(id) ?? id,
    [categoryLabelById],
  );

  const addLimitCategory = (id: string) => {
    if (!id) return;
    const current = limitForm.getValues("categoryIds");
    if (current.includes(id)) return;
    limitForm.setValue("categoryIds", [...current, id], {
      shouldDirty: true,
      shouldValidate: Boolean(limitCategoriesError),
    });
  };
  const removeLimitCategory = (id: string) => {
    limitForm.setValue(
      "categoryIds",
      limitForm.getValues("categoryIds").filter((x) => x !== id),
      { shouldDirty: true, shouldValidate: Boolean(limitCategoriesError) },
    );
  };

  // Перетин з наявними лімітами НЕ блокує (кожен ліміт — незалежний трекер),
  // але людина має побачити, що витрата рахуватиметься в обох.
  const limitOverlaps = useMemo(
    () => findLimitCategoryOverlaps(limitCategoryIds, existingBudgets),
    [limitCategoryIds, existingBudgets],
  );

  /** Превʼю авто-назви для підказки під опціональним полем «Назва». */
  const limitAutoLabel = useMemo(
    () =>
      formatLimitBudgetLabel(
        {
          categoryId: limitCategoryIds[0] ?? "",
          categoryIds: limitCategoryIds,
        },
        resolveCategoryLabel,
      ),
    [limitCategoryIds, resolveCategoryLabel],
  );

  // Design decision #3: обираючи банку з власною ціллю (`jar.goal`),
  // підставляємо її як дефолт суми цілі — лише якщо поле ще порожнє, щоб
  // не перезаписувати те, що юзер уже встиг ввести.
  const handleJarChange = (jarId: string) => {
    goalForm.setValue("linkedJarId", jarId, { shouldDirty: true });
    const jar = jars.find((j) => j.monoJarId === jarId);
    if (jar?.goal != null && !goalForm.getValues("targetAmount").trim()) {
      goalForm.setValue(
        "targetAmount",
        groupIntegerDigits(String(Math.round(jar.goal / 100))),
        { shouldDirty: true },
      );
    }
  };

  const limitDraftValid =
    limitCategoryIds.length > 0 && isValidAmountString(limitAmount);
  const goalDraftValid =
    goalName.trim() !== "" && isValidAmountString(goalTargetAmount);

  const isSubmitting =
    formType === "limit" ? limitForm.isSubmitting : goalForm.isSubmitting;

  return (
    <Card radius="lg" padding="lg" className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setFormType("limit")}
          className={cn(
            "flex-1 py-2 flex items-center justify-center gap-1.5 text-style-label rounded-xl border transition-colors",
            formType === "limit"
              ? "bg-primary border-primary text-bg"
              : "border-line text-subtle",
          )}
        >
          <Icon name="flag" size="sm" />
          Ліміт
        </button>
        <button
          type="button"
          onClick={() => setFormType("goal")}
          className={cn(
            "flex-1 py-2 flex items-center justify-center gap-1.5 text-style-label rounded-xl border transition-colors",
            formType === "goal"
              ? "bg-success-strong border-success-strong text-white"
              : "border-line text-subtle",
          )}
        >
          <Icon name="target" size="sm" />
          Ціль
        </button>
      </div>
      {formType === "limit" ? (
        <form
          onSubmit={limitForm.submit}
          noValidate
          className="space-y-3"
          aria-label="Новий ліміт бюджету"
        >
          <div>
            <Label htmlFor={`${fieldId}-period`}>Період</Label>
            <select
              id={`${fieldId}-period`}
              className="input-focus-finyk w-full h-10 min-w-0 rounded-xl border border-line bg-bg px-3 text-sm text-text"
              disabled={isSubmitting}
              {...limitForm.register("period")}
            >
              <option value="month">Щомісяця</option>
              <option value="week">Щотижня</option>
              <option value="one_time">Одноразово</option>
            </select>
          </div>
          <div>
            {limitCategoryIds.length > 0 && (
              <ul className="mb-2 space-y-1.5" aria-label="Обрані категорії">
                {limitCategoryIds.map((id) => (
                  <li
                    key={id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-line bg-bg px-3 py-1.5"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <CategoryIconChip categoryId={id} size={24} />
                      <span className="text-sm text-text truncate">
                        {resolveCategoryLabel(id)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLimitCategory(id)}
                      disabled={isSubmitting}
                      aria-label={`Прибрати категорію ${resolveCategoryLabel(id)}`}
                      className="touch-target flex items-center justify-center rounded-xl text-muted hover:text-text transition-colors"
                    >
                      <Icon name="x" size={16} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <CategorySelector
              value=""
              onChange={addLimitCategory}
              placeholder={
                limitCategoryIds.length === 0
                  ? "Обери категорію"
                  : "Додай ще категорію"
              }
              categories={expenseCategoryList.filter(
                (c) => c.id !== "income" && !limitCategoryIds.includes(c.id),
              )}
            />
            {limitCategoriesError && (
              <p
                className="mt-1 text-style-caption text-danger-strong dark:text-danger bg-danger-soft rounded-xl px-3 py-2"
                role="alert"
              >
                {limitCategoriesError}
              </p>
            )}
            {limitOverlaps.length > 0 && (
              <p
                className="mt-1 text-style-caption text-subtle bg-bg rounded-xl px-3 py-2"
                role="status"
              >
                {limitOverlaps
                  .map(
                    (o) =>
                      `${o.categoryIds
                        .map((id) => `«${resolveCategoryLabel(id)}»`)
                        .join(", ")} вже є в ліміті «${formatLimitBudgetLabel(
                        o.budget,
                        resolveCategoryLabel,
                      )}»`,
                  )
                  .join("; ")}
                {" — витрати рахуватимуться в обох лімітах."}
              </p>
            )}
          </div>
          {limitCategoryIds.length > 1 && (
            <div>
              <Label htmlFor={limitNameId}>{"Назва (необовʼязково)"}</Label>
              <Input
                id={limitNameId}
                placeholder="Напр. Їжа"
                maxLength={NAME_MAX_LEN}
                disabled={isSubmitting}
                {...limitForm.register("label")}
              />
              <p className="mt-1 text-style-caption text-subtle">
                Якщо лишити порожнім, назва буде «{limitAutoLabel}».
              </p>
            </div>
          )}
          <div>
            <Label htmlFor={limitAmountId}>Ліміт</Label>
            <Input
              id={limitAmountId}
              placeholder="Напр. 5 000 ₴"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={limitAmountError ? true : undefined}
              disabled={isSubmitting}
              {...limitAmountField}
            />
            {limitAmountError && (
              <p
                className="mt-1 text-style-caption text-danger-strong dark:text-danger bg-danger-soft rounded-xl px-3 py-2"
                role="alert"
              >
                {limitAmountError}
              </p>
            )}
            <p className="mt-1 text-style-caption text-subtle">
              {limitPeriod === "week"
                ? "Новий період починається щопонеділка за київським часом."
                : limitPeriod === "one_time"
                  ? "Витрати рахуються від моменту створення без автоматичного скидання."
                  : "Новий період починається першого числа за київським часом."}
            </p>
          </div>
          {!limitDraftValid ? (
            <p className="text-style-caption text-subtle" role="status">
              Обери категорію та вкажи позитивну суму ліміту.
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="submit"
              className="flex-1"
              size="sm"
              disabled={isSubmitting || !limitDraftValid}
            >
              Додати
            </Button>
            <Button
              type="button"
              className="flex-1"
              size="sm"
              variant="secondary"
              onClick={onCancel}
            >
              Скасувати
            </Button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={goalForm.submit}
          noValidate
          className="space-y-3"
          aria-label="Нова ціль бюджету"
        >
          <div className="flex items-center gap-2">
            {/* Превʼю обраної іконки — нативний `<option>` малює лише
                текст, тож без нього вибір лишався б невидимим. */}
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-panelHi text-finyk">
              <Icon name={goalIconOf(goalEmoji)} size={18} aria-hidden />
            </span>
            <select
              className="input-focus-finyk h-10 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-sm text-text"
              value={goalIconOf(goalEmoji)}
              aria-label="Іконка цілі"
              onChange={(e) =>
                goalForm.setValue("emoji", e.target.value, {
                  shouldDirty: true,
                })
              }
            >
              {GOAL_ICON_OPTIONS.map((opt) => (
                <option key={opt.icon} value={opt.icon}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor={goalNameId}>Назва цілі</Label>
            <Input
              id={goalNameId}
              placeholder="Напр. На відпустку"
              maxLength={NAME_MAX_LEN}
              aria-invalid={goalNameError ? true : undefined}
              disabled={isSubmitting}
              {...goalForm.register("name")}
            />
            {goalNameError && (
              <p
                className="mt-1 text-style-caption text-danger-strong dark:text-danger bg-danger-soft rounded-xl px-3 py-2"
                role="alert"
              >
                {goalNameError}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor={goalAmountId}>Сума цілі</Label>
            <Input
              id={goalAmountId}
              placeholder="Напр. 20 000 ₴"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={goalAmountError ? true : undefined}
              disabled={isSubmitting}
              {...goalAmountField}
            />
            {goalAmountError && (
              <p
                className="mt-1 text-style-caption text-danger-strong dark:text-danger bg-danger-soft rounded-xl px-3 py-2"
                role="alert"
              >
                {goalAmountError}
              </p>
            )}
          </div>
          {jarOptions.length > 0 && (
            <div>
              <JarSelector
                value={goalLinkedJarId}
                onChange={handleJarChange}
                jars={jarOptions}
              />
            </div>
          )}
          <div>
            <DateField
              id="budget-goal-target-date"
              label="Дата завершення"
              // iOS Safari's native `type="date"` never renders a
              // `placeholder`, so `emptyLabel` supplies the in-field
              // example overlay shown while unfocused and empty (see
              // `DateField`'s own empty-state handling). Founder decision
              // 2026-07-24 supersedes the earlier round-2 M1 call to skip
              // an external label — every form field now gets a visible
              // label + example placeholder.
              emptyLabel="Напр. 31.12.2026"
              value={goalTargetDate}
              className="w-full"
              disabled={isSubmitting}
              {...goalForm.register("targetDate")}
            />
          </div>
          {!goalDraftValid ? (
            <p className="text-style-caption text-subtle" role="status">
              Заповни назву та вкажи позитивну суму цілі.
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="submit"
              className="flex-1"
              size="sm"
              disabled={isSubmitting || !goalDraftValid}
            >
              Додати
            </Button>
            <Button
              type="button"
              className="flex-1"
              size="sm"
              variant="secondary"
              onClick={onCancel}
            >
              Скасувати
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

export const AddBudgetForm = memo(AddBudgetFormComponent);
