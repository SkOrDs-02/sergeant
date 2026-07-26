/**
 * Last validated: 2026-05-19
 * Status: Active
 */
import { memo, useEffect, useId, useRef } from "react";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { Label } from "@shared/components/ui/FormField";
import { DateField } from "@shared/components/ui/DateField";
import { Icon } from "@shared/components/ui/Icon";
import { formatMoney, pluralDays } from "@sergeant/shared";
import { useCelebration } from "@shared/components/ui/CelebrationModal";

interface GoalBudgetInput {
  id: string;
  type?: "goal" | "limit" | undefined;
  emoji?: string | undefined;
  name?: string | undefined;
  targetAmount: number;
  savedAmount?: number | undefined;
  targetDate?: string | undefined;
  [extra: string]: unknown;
}

interface GoalBudgetCardProps {
  budget: GoalBudgetInput;
  saved: number;
  pct: number;
  daysLeft: number | null;
  monthlyLabel?: string | null;
  isEditing: boolean;
  onBeginEdit: () => void;
  onChangeSaved?: (next: number) => void;
  onChangeName?: (next: string) => void;
  onChangeTarget?: (next: number) => void;
  onChangeDate?: (next: string) => void;
  onSave: () => void;
  onDelete: () => void;
}

// Картка цілі накопичення — детерміновані пропси, memo дозволяє не
// перераховувати розмітку при перерендерах сторінки Budgets.
function GoalBudgetCardComponent({
  budget,
  saved,
  pct,
  daysLeft,
  monthlyLabel,
  isEditing,
  onBeginEdit,
  onChangeSaved,
  onChangeName,
  onChangeTarget,
  onChangeDate,
  onSave,
  onDelete,
}: GoalBudgetCardProps) {
  // W3 — fire goal-completed celebration exactly once per goal id when
  // progress reaches 100%. celebratedRef persists across re-renders so we
  // never double-fire even if the component remounts with the same goal.
  const { goalCompleted, CelebrationComponent } = useCelebration();
  const celebratedRef = useRef<string | null>(null);
  const fieldId = useId();
  const nameId = `${fieldId}-name`;
  const targetId = `${fieldId}-target`;
  const savedId = `${fieldId}-saved`;
  const dateId = `${fieldId}-date`;

  useEffect(() => {
    if (pct < 100) return;
    if (celebratedRef.current === budget.id) return;
    celebratedRef.current = budget.id;
    goalCompleted(budget.name ?? "Ціль досягнута!", saved, "₴", "finyk");
  }, [pct, budget.id, budget.name, saved, goalCompleted]);

  return (
    <>
      {CelebrationComponent}
      <Card radius="lg" padding="lg">
        {isEditing ? (
          <div className="space-y-2">
            <div>
              <Label htmlFor={nameId}>Назва цілі</Label>
              <Input
                id={nameId}
                size="sm"
                placeholder="Напр. На відпустку"
                value={budget.name || ""}
                onChange={(e) => onChangeName?.(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor={targetId}>Сума цілі</Label>
              <Input
                id={targetId}
                size="sm"
                type="number"
                placeholder="Напр. 20000 ₴"
                value={budget.targetAmount || ""}
                onChange={(e) => onChangeTarget?.(Number(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor={savedId}>Відкладено</Label>
              <Input
                id={savedId}
                size="sm"
                type="number"
                placeholder="Напр. 5000 ₴"
                value={budget.savedAmount || ""}
                onChange={(e) => onChangeSaved?.(Number(e.target.value))}
              />
            </div>
            <DateField
              id={dateId}
              size="sm"
              label="Дата завершення"
              emptyLabel="Напр. 31.12.2026"
              value={budget.targetDate || ""}
              onChange={(e) => onChangeDate?.(e.target.value)}
            />
            <div className="flex gap-2">
              <Button className="flex-1" size="sm" onClick={onSave}>
                Зберегти
              </Button>
              <Button
                className="flex-1"
                size="sm"
                variant="danger"
                onClick={onDelete}
              >
                Видалити
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-2">
              <span className="text-style-label">
                <Icon name="target" size={16} aria-hidden /> {budget.name}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">
                  {formatMoney(saved)} / {formatMoney(budget.targetAmount)}
                </span>
                <button
                  type="button"
                  onClick={onBeginEdit}
                  className="text-subtle hover:text-text text-sm transition-colors"
                  aria-label="Редагувати ціль"
                >
                  <Icon name="edit" size={16} aria-hidden />
                </button>
              </div>
            </div>
            <div className="h-2 bg-bg rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-success transition-[width,background-color] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            {monthlyLabel && (
              <div className="text-xs text-subtle mt-1.5">{monthlyLabel}</div>
            )}
            <div className="text-xs text-subtle mt-0.5">
              {pct}% ·{" "}
              {daysLeft !== null
                ? daysLeft > 0
                  ? `${daysLeft} ${pluralDays(daysLeft)} до мети`
                  : "Термін минув"
                : "Без дедлайну"}
            </div>
          </>
        )}
      </Card>
    </>
  );
}

export const GoalBudgetCard = memo(GoalBudgetCardComponent);
