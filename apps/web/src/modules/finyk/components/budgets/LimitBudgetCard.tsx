import { memo, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Skeleton } from "@shared/components/ui/Skeleton";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { Tooltip } from "@shared/components/ui/Tooltip";

interface LimitBudgetInput {
  id: string;
  type?: "limit" | "goal";
  categoryId?: string;
  limit: number;
  [extra: string]: unknown;
}

interface LimitBudgetCardProps {
  budget: LimitBudgetInput;
  categoryLabel?: string | null;
  spent: number;
  pctRaw: number;
  pctRounded: number;
  remaining: number;
  isEditing: boolean;
  showProactiveAdvice: boolean;
  proactiveText?: string | null;
  proactiveLoading?: boolean;
  onDismissAdvice?: (() => void) | null;
  onBeginEdit: () => void;
  onChangeLimit?: (next: number) => void;
  onSave: () => void;
  onDelete: () => void;
}

// Презентаційна картка ліміту бюджету. Усі дані приходять готовими пропсами,
// тому memo потрібен, щоб картка не перемальовувалась при змінах сусідніх
// бюджетів чи сторонніх станів Budgets.
function LimitBudgetCardComponent({
  budget,
  categoryLabel,
  spent,
  pctRaw,
  pctRounded,
  remaining,
  isEditing,
  showProactiveAdvice,
  proactiveText,
  proactiveLoading,
  onDismissAdvice,
  onBeginEdit,
  onChangeLimit,
  onSave,
  onDelete,
}: LimitBudgetCardProps) {
  const overLimit = pctRaw >= 100;
  const warnLimit = pctRaw >= 80 && !overLimit;
  const [adviceOpen, setAdviceOpen] = useState(true);

  return (
    <Card radius="lg" padding="lg">
      {isEditing ? (
        <div className="space-y-2">
          <Input
            size="sm"
            type="number"
            placeholder="Ліміт ₴"
            value={budget.limit}
            onChange={(e) => onChangeLimit?.(Number(e.target.value))}
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
            <span className="text-style-label">{categoryLabel || "—"}</span>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-xs tabular-nums",
                  overLimit
                    ? "text-danger font-semibold"
                    : warnLimit
                      ? "text-warning"
                      : "text-muted",
                )}
              >
                {spent} / {budget.limit} ₴
              </span>
              <button
                type="button"
                onClick={onBeginEdit}
                className="text-subtle hover:text-text text-sm transition-colors"
                aria-label="Редагувати ліміт"
              >
                ✏️
              </button>
            </div>
          </div>
          <div className="h-2 bg-bg rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-[width,background-color] duration-500",
                overLimit
                  ? "bg-danger"
                  : warnLimit
                    ? "bg-warning"
                    : "bg-emerald-500",
              )}
              style={{ width: `${Math.min(100, pctRaw)}%` }}
            />
          </div>
          <div
            className={cn(
              "text-xs mt-2",
              overLimit
                ? "text-danger font-medium"
                : warnLimit
                  ? "text-warning"
                  : "text-subtle",
            )}
          >
            {overLimit
              ? `Перевищено на ${(spent - budget.limit).toLocaleString("uk-UA")} ₴`
              : `Залишок ${remaining.toLocaleString("uk-UA")} ₴ · ${pctRounded}% використано`}
          </div>

          {showProactiveAdvice &&
            (proactiveText || proactiveLoading !== false) && (
              <div className="mt-3 bg-bg rounded-xl overflow-hidden">
                {proactiveText ? (
                  <>
                    <div className="flex items-stretch">
                      <button
                        type="button"
                        onClick={() => setAdviceOpen((v) => !v)}
                        aria-expanded={adviceOpen}
                        className="flex-1 flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-panelHi transition-colors"
                      >
                        <span className="flex items-center gap-2 text-xs font-semibold text-text">
                          <span className="text-base leading-none">✨</span>
                          AI-порада
                        </span>
                        <Icon
                          name="chevron-down"
                          size={14}
                          className={cn(
                            "transition-transform text-muted",
                            adviceOpen ? "rotate-180" : "",
                          )}
                        />
                      </button>
                      {onDismissAdvice && (
                        <Tooltip
                          content="Прибрати пораду до наступної генерації"
                          placement="top-center"
                        >
                          <button
                            type="button"
                            onClick={onDismissAdvice}
                            className="px-3 text-xs text-muted hover:text-text border-l border-line transition-colors"
                          >
                            Зрозуміло
                          </button>
                        </Tooltip>
                      )}
                    </div>
                    {adviceOpen && (
                      <p className="px-3 pb-2.5 text-xs text-text leading-relaxed">
                        {proactiveText}
                      </p>
                    )}
                  </>
                ) : (
                  <div
                    className="px-3 py-2.5 space-y-1.5 min-h-14"
                    aria-busy="true"
                  >
                    <Skeleton className="h-3 w-full rounded" />
                    <Skeleton className="h-3 w-4/5 rounded" />
                  </div>
                )}
              </div>
            )}
        </>
      )}
    </Card>
  );
}

export const LimitBudgetCard = memo(LimitBudgetCardComponent);
