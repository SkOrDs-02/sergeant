import { memo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { cn } from "@shared/lib/ui/cn";
import { CategorySelector } from "../CategorySelector";

export type BudgetFormType = "limit" | "goal";

export type NewBudgetDraft = {
  type: BudgetFormType;
  categoryId?: string;
  limit?: string;
  emoji?: string;
  name?: string;
  targetAmount?: string;
  savedAmount?: string;
  targetDate?: string;
};

export interface ExpenseCategoryOption {
  id: string;
  label?: string;
}

interface AddBudgetFormProps {
  formType: BudgetFormType;
  newB: NewBudgetDraft;
  onChangeFormType: (type: BudgetFormType) => void;
  onChangeNewB: Dispatch<SetStateAction<NewBudgetDraft>>;
  expenseCategoryList: readonly ExpenseCategoryOption[];
  formError?: string | null;
  onSubmit: () => void;
  onCancel: () => void;
}

const GOAL_EMOJIS = [
  "🎯",
  "🏠",
  "🚗",
  "✈️",
  "💻",
  "📱",
  "💍",
  "🎓",
  "🏋️",
  "💰",
];

// Form for creating a new limit or goal budget. State is lifted to parent
// (Budgets.jsx) so that form submission can access the full `budgets` array
// for validation (e.g. dedupe by category).
function AddBudgetFormComponent({
  formType,
  newB,
  onChangeFormType,
  onChangeNewB,
  expenseCategoryList,
  formError,
  onSubmit,
  onCancel,
}: AddBudgetFormProps) {
  return (
    <Card radius="lg" padding="lg" className="space-y-3">
      <div className="flex gap-2">
        <button
          onClick={() => {
            onChangeFormType("limit");
            onChangeNewB((b) => ({ ...b, type: "limit" }));
          }}
          className={cn(
            "flex-1 py-2 text-style-label rounded-xl border transition-colors",
            formType === "limit"
              ? "bg-primary border-primary text-bg"
              : "border-line text-subtle",
          )}
        >
          🔴 Ліміт
        </button>
        <button
          onClick={() => {
            onChangeFormType("goal");
            onChangeNewB((b) => ({ ...b, type: "goal" }));
          }}
          className={cn(
            "flex-1 py-2 text-style-label rounded-xl border transition-colors",
            formType === "goal"
              ? "bg-success-strong border-success-strong text-white"
              : "border-line text-subtle",
          )}
        >
          🟢 Ціль
        </button>
      </div>
      {formType === "limit" ? (
        <>
          <CategorySelector
            value={newB.categoryId}
            onChange={(val) => onChangeNewB((b) => ({ ...b, categoryId: val }))}
            categories={expenseCategoryList.filter((c) => c.id !== "income")}
            placeholder="Вибери категорію"
          />
          <Input
            placeholder="Ліміт ₴"
            type="number"
            value={newB.limit}
            onChange={(e) =>
              onChangeNewB((b) => ({ ...b, limit: e.target.value }))
            }
          />
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {GOAL_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => onChangeNewB((b) => ({ ...b, emoji: e }))}
                className={cn(
                  "text-xl p-1.5 rounded-xl border transition-colors",
                  newB.emoji === e
                    ? "border-primary bg-primary/10"
                    : "border-transparent",
                )}
              >
                {e}
              </button>
            ))}
          </div>
          <Input
            placeholder="Назва цілі"
            value={newB.name}
            onChange={(e) =>
              onChangeNewB((b) => ({ ...b, name: e.target.value }))
            }
          />
          <Input
            placeholder="Сума цілі ₴"
            type="number"
            value={newB.targetAmount}
            onChange={(e) =>
              onChangeNewB((b) => ({ ...b, targetAmount: e.target.value }))
            }
          />
          <Input
            placeholder="Вже відкладено ₴"
            type="number"
            value={newB.savedAmount}
            onChange={(e) =>
              onChangeNewB((b) => ({ ...b, savedAmount: e.target.value }))
            }
          />
          <Input
            type="date"
            value={newB.targetDate}
            onChange={(e) =>
              onChangeNewB((b) => ({ ...b, targetDate: e.target.value }))
            }
          />
        </>
      )}
      {formError && (
        <p className="text-xs text-danger bg-danger-soft rounded-xl px-3 py-2">
          {formError}
        </p>
      )}
      <div className="flex gap-2">
        <Button className="flex-1" size="sm" onClick={onSubmit}>
          Додати
        </Button>
        <Button className="flex-1" size="sm" variant="ghost" onClick={onCancel}>
          Скасувати
        </Button>
      </div>
    </Card>
  );
}

export const AddBudgetForm = memo(AddBudgetFormComponent);
