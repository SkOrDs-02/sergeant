import { memo, useId, useMemo, useState } from "react";
import { z } from "zod";
import {
  amountStringSchema,
  amountStringToHryvnia,
} from "@shared/lib/format/amountSchema";
import { parseAmountToMinor } from "@shared/lib/format/amount";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { Label } from "@shared/components/ui/FormField";
import { DateField } from "@shared/components/ui/DateField";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { useApiForm } from "@shared/forms";
import { messages } from "@shared/i18n/uk";
import type { Budget } from "@sergeant/finyk-domain/domain/types";
import type { MonoJarDto } from "@shared/api";
import { CategorySelector } from "../CategorySelector";
import { JarSelector } from "../JarSelector";

export type BudgetFormType = "limit" | "goal";

/**
 * Normalized output shape — те, що `Budgets.tsx` додає в стан
 * `setBudgets`. id призначається на call-site (через `crypto.randomUUID()`).
 */
export type NewBudgetDraft =
  | {
      type: "limit";
      categoryId: string;
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

const GOAL_EMOJI_OPTIONS: readonly { emoji: string; label: string }[] = [
  { emoji: "🎯", label: "Ціль" },
  { emoji: "🏠", label: "Житло" },
  { emoji: "🚗", label: "Авто" },
  { emoji: "✈️", label: "Подорож" },
  { emoji: "💻", label: "Техніка" },
  { emoji: "📱", label: "Гаджет" },
  { emoji: "💍", label: "Подія" },
  { emoji: "🎓", label: "Освіта" },
  { emoji: "🏋️", label: "Спорт" },
  { emoji: "💰", label: "Заощадження" },
];

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
  categoryId: string;
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
  name: z.string().trim().min(1, messages.validation.goalNameRequired),
  emoji: z.string(),
  targetAmount: positiveNumberString(messages.validation.goalAmountRequired),
  targetDate: z.string(),
  linkedJarId: z.string(),
});

const LIMIT_DEFAULTS: LimitFormValues = {
  type: "limit",
  categoryId: "",
  limit: "",
  period: "month",
};

const GOAL_DEFAULTS: GoalFormValues = {
  type: "goal",
  name: "",
  emoji: "🎯",
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
          categoryId: z.string().min(1, messages.validation.categoryRequired),
          limit: positiveNumberString(messages.validation.limitAmountRequired),
          period: z.enum(["month", "week", "one_time"]),
        })
        .superRefine((data, ctx) => {
          const dup = existingBudgets.some(
            (b) => b?.type === "limit" && b.categoryId === data.categoryId,
          );
          if (dup) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["categoryId"],
              message: "Ліміт для цієї категорії вже існує",
            });
          }
        }),
    [existingBudgets],
  );

  const limitForm = useApiForm<LimitFormValues, void>({
    schema: limitFormSchema,
    defaultValues: LIMIT_DEFAULTS,
    onSubmit: async (values) => {
      onSubmit({
        type: "limit",
        categoryId: values.categoryId,
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

  const limitCategoryError = limitForm.formState.errors.categoryId?.message;
  const limitAmountError = limitForm.formState.errors.limit?.message;
  const goalNameError = goalForm.formState.errors.name?.message;
  const goalAmountError = goalForm.formState.errors.targetAmount?.message;

  const goalEmoji = goalForm.watch("emoji");
  const goalTargetDate = goalForm.watch("targetDate");
  const limitCategoryId = limitForm.watch("categoryId");
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

  // Design decision #3: обираючи банку з власною ціллю (`jar.goal`),
  // підставляємо її як дефолт суми цілі — лише якщо поле ще порожнє, щоб
  // не перезаписувати те, що юзер уже встиг ввести.
  const handleJarChange = (jarId: string) => {
    goalForm.setValue("linkedJarId", jarId, { shouldDirty: true });
    const jar = jars.find((j) => j.monoJarId === jarId);
    if (jar?.goal != null && !goalForm.getValues("targetAmount").trim()) {
      goalForm.setValue("targetAmount", String(Math.round(jar.goal / 100)), {
        shouldDirty: true,
      });
    }
  };

  const limitDraftValid =
    Boolean(limitCategoryId) && isValidAmountString(limitAmount);
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
            <CategorySelector
              value={limitCategoryId}
              onChange={(val) =>
                limitForm.setValue("categoryId", val, {
                  shouldDirty: true,
                  shouldValidate: Boolean(limitCategoryError),
                })
              }
              categories={expenseCategoryList.filter((c) => c.id !== "income")}
            />
            {limitCategoryError && (
              <p
                className="mt-1 text-xs text-danger-strong dark:text-danger bg-danger-soft rounded-xl px-3 py-2"
                role="alert"
              >
                {limitCategoryError}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor={limitAmountId}>Ліміт</Label>
            <Input
              id={limitAmountId}
              placeholder="Напр. 5000 ₴"
              type="number"
              aria-invalid={limitAmountError ? true : undefined}
              disabled={isSubmitting}
              {...limitForm.register("limit")}
            />
            {limitAmountError && (
              <p
                className="mt-1 text-xs text-danger-strong dark:text-danger bg-danger-soft rounded-xl px-3 py-2"
                role="alert"
              >
                {limitAmountError}
              </p>
            )}
            <p className="mt-1 text-xs text-subtle">
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
          <select
            className="input-focus-finyk w-full h-10 min-w-0 rounded-xl border border-line bg-bg px-3 text-sm text-text"
            value={goalEmoji}
            aria-label="Іконка цілі"
            onChange={(e) =>
              goalForm.setValue("emoji", e.target.value, {
                shouldDirty: true,
              })
            }
          >
            {GOAL_EMOJI_OPTIONS.map((opt) => (
              <option key={opt.emoji} value={opt.emoji}>
                {opt.label}
              </option>
            ))}
          </select>
          <div>
            <Label htmlFor={goalNameId}>Назва цілі</Label>
            <Input
              id={goalNameId}
              placeholder="Напр. На відпустку"
              aria-invalid={goalNameError ? true : undefined}
              disabled={isSubmitting}
              {...goalForm.register("name")}
            />
            {goalNameError && (
              <p
                className="mt-1 text-xs text-danger-strong dark:text-danger bg-danger-soft rounded-xl px-3 py-2"
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
              placeholder="Напр. 20000 ₴"
              type="number"
              aria-invalid={goalAmountError ? true : undefined}
              disabled={isSubmitting}
              {...goalForm.register("targetAmount")}
            />
            {goalAmountError && (
              <p
                className="mt-1 text-xs text-danger-strong dark:text-danger bg-danger-soft rounded-xl px-3 py-2"
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
