/**
 * Last validated: 2026-05-14
 * Status: Active
 */
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
  period?: "month" | "week" | "one_time";
  createdAt?: string;
  [extra: string]: unknown;
}

interface LimitBudgetCardProps {
  budget: LimitBudgetInput;
  categoryLabel?: string | null | undefined;
  spent: number;
  pctRaw: number;
  pctRounded: number;
  remaining: number;
  isEditing: boolean;
  showProactiveAdvice: boolean;
  proactiveText?: string | null | undefined;
  proactiveLoading?: boolean | undefined;
  onDismissAdvice?: ((() => void) | null) | undefined;
  onBeginEdit: () => void;
  onChangeLimit?: ((next: number) => void) | undefined;
  onChangePeriod?: ((next: "month" | "week" | "one_time") => void) | undefined;
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
  onChangePeriod,
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
          <select
            aria-label="Період ліміту"
            value={budget.period ?? "month"}
            onChange={(event) =>
              onChangePeriod?.(
                event.target.value as "month" | "week" | "one_time",
              )
            }
            className="input-focus-finyk w-full h-10 min-w-0 rounded-xl border border-line bg-bg px-3 text-sm text-text"
          >
            <option value="month">Щомісяця</option>
            <option value="week">Щотижня</option>
            <option value="one_time">Одноразово</option>
          </select>
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
            <div>
              <span className="text-style-label">{categoryLabel || "—"}</span>
              <div className="text-style-caption text-subtle mt-0.5">
                {budget.period === "week"
                  ? "Щотижня"
                  : budget.period === "one_time"
                    ? "Одноразовий"
                    : "Щомісяця"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-xs tabular-nums",
                  overLimit
                    ? "text-danger-strong dark:text-danger font-semibold"
                    : warnLimit
                      ? "text-warning-strong dark:text-warning"
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
                <Icon name="edit" size={16} aria-hidden />
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
                    : "bg-success",
              )}
              style={{ width: `${Math.min(100, pctRaw)}%` }}
            />
          </div>
          <div
            className={cn(
              "text-xs mt-2",
              overLimit
                ? "text-danger-strong dark:text-danger font-medium"
                : warnLimit
                  ? "text-warning-strong dark:text-warning"
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
                        <span className="flex items-center gap-2 text-style-caption text-text">
                          <Icon name="sparkles" size={16} aria-hidden />
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
                    <Skeleton variant="text" className="w-full" />
                    <Skeleton variant="text" className="w-4/5" />
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
