import { memo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { cn } from "@shared/lib/cn";
import { Icon } from "@shared/components/ui/Icon";
import { Input } from "@shared/components/ui/Input";
import { formatMoney } from "@sergeant/shared";

// Mirrors `useStorage`'s MonthlyPlan: required income/expense/savings,
// each persisted as the raw `<input type="number">` value (string while
// editing, number once committed). Defined inline here so the card
// stays free of a hook import; if a third file ever needs the type,
// hoist it to a shared module.
export type MonthlyPlan = {
  income: number | string;
  expense: number | string;
  savings: number | string;
};

interface MonthlyPlanCardProps {
  monthlyPlan: MonthlyPlan | null | undefined;
  onChangeMonthlyPlan: Dispatch<SetStateAction<MonthlyPlan>>;
  planIncome: number;
  planExpense: number;
  planSavings: number;
  totalExpenseFact: number;
  factIncome: number;
  factSavings: number;
  remaining: number;
  safePerDay: number;
  pctExpense: number;
  isOver: boolean;
  daysLeft: number;
}

// Unified monthly-plan block: Plan/Fact/Δ table for income, expense and
// savings, progress bar + safe-to-spend hint and an inline edit mode for
// the three inputs. Replaces the separate `PlanFactCard` that previously
// duplicated the same plan/fact numbers below this card. Collapsible —
// default closed so the Планування page opens with stats-strip + limit
// cards in view; header surfaces pct + remaining at a glance.
function MonthlyPlanCardComponent({
  monthlyPlan,
  onChangeMonthlyPlan,
  planIncome,
  planExpense,
  planSavings,
  totalExpenseFact,
  factIncome,
  factSavings,
  remaining,
  safePerDay,
  pctExpense,
  isOver,
  daysLeft,
}: MonthlyPlanCardProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const hasPlan = planIncome > 0 || planExpense > 0 || planSavings > 0;

  const incomeDelta = factIncome - planIncome;
  const expenseDelta = totalExpenseFact - planExpense;
  const savingsDelta = factSavings - planSavings;

  const fmt = (n: number) => formatMoney(n);
  const fmtSigned = (n: number) =>
    `${n >= 0 ? "+" : "−"}${formatMoney(Math.abs(n))}`;

  return (
    <div
      className={cn(
        "bg-panel border rounded-2xl shadow-card overflow-hidden",
        isOver ? "border-danger/40" : "border-line",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left hover:bg-panelHi transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-muted" aria-hidden>
            <Icon name="calendar" size={16} />
          </span>
          <span className="text-style-label text-text">Фінплан на місяць</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasPlan && !open && (
            <span
              className={cn(
                "text-xs tabular-nums",
                isOver ? "text-danger font-semibold" : "text-muted",
              )}
            >
              {isOver
                ? `−${formatMoney(totalExpenseFact - planExpense)}`
                : planExpense > 0
                  ? `${pctExpense}% · ${formatMoney(remaining)}`
                  : `+${formatMoney(planIncome)}`}
            </span>
          )}
          {!hasPlan && !open && (
            <span className="text-xs text-subtle">Не заданий</span>
          )}
          <Icon
            name="chevron-down"
            size={14}
            className={cn(
              "transition-transform text-muted",
              open ? "rotate-180" : "",
            )}
          />
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 space-y-3">
          {hasPlan ? (
            <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-3 gap-y-1.5 text-sm tabular-nums items-baseline">
              <div />
              <div className="text-2xs text-subtle text-right">План</div>
              <div className="text-2xs text-subtle text-right">Факт</div>
              <div className="text-2xs text-subtle text-right">Δ</div>

              <div className="text-xs text-muted">Дохід</div>
              <div className="text-right text-muted">
                {planIncome > 0 ? `${fmt(planIncome)} ₴` : "—"}
              </div>
              <div className="text-right text-success">
                {factIncome > 0 ? `+${fmt(factIncome)} ₴` : "—"}
              </div>
              <div
                className={cn(
                  "text-right text-2xs",
                  planIncome === 0
                    ? "text-subtle"
                    : incomeDelta >= 0
                      ? "text-success"
                      : "text-warning",
                )}
              >
                {planIncome > 0 ? fmtSigned(incomeDelta) : "—"}
              </div>

              <div className="text-xs text-muted">Витрати</div>
              <div className="text-right text-muted">
                {planExpense > 0 ? `${fmt(planExpense)} ₴` : "—"}
              </div>
              <div
                className={cn(
                  "text-right",
                  isOver ? "text-danger font-semibold" : "text-danger/80",
                )}
              >
                −{fmt(totalExpenseFact)} ₴
              </div>
              <div
                className={cn(
                  "text-right text-2xs",
                  planExpense === 0
                    ? "text-subtle"
                    : expenseDelta > 0
                      ? "text-danger"
                      : "text-success",
                )}
              >
                {planExpense > 0 ? fmtSigned(expenseDelta) : "—"}
              </div>

              <div className="text-xs text-muted">Накопич.</div>
              <div className="text-right text-muted">
                {planSavings > 0 ? `${fmt(planSavings)} ₴` : "—"}
              </div>
              <div
                className={cn(
                  "text-right",
                  factSavings >= 0 ? "text-success" : "text-danger",
                )}
              >
                {fmtSigned(factSavings)}
              </div>
              <div
                className={cn(
                  "text-right text-2xs",
                  planSavings === 0 && factSavings === 0
                    ? "text-subtle"
                    : savingsDelta >= 0
                      ? "text-success"
                      : "text-danger",
                )}
              >
                {planSavings > 0 || factSavings !== 0
                  ? fmtSigned(savingsDelta)
                  : "—"}
              </div>
            </div>
          ) : (
            <div className="text-sm text-subtle">
              Постав план — і побачиш скільки безпечно витрачати на день.
            </div>
          )}

          {hasPlan && planExpense > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-subtle">
                <span>{pctExpense}% витрачено</span>
                {safePerDay > 0 && daysLeft > 0 && !isOver && (
                  <span className="tabular-nums">
                    {formatMoney(safePerDay)}/день · {daysLeft} дн.
                  </span>
                )}
                {isOver && (
                  <span className="text-danger font-semibold tabular-nums">
                    −{formatMoney(totalExpenseFact - planExpense)}
                  </span>
                )}
              </div>
              <div className="h-2 bg-bg rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width,background-color]",
                    isOver
                      ? "bg-danger"
                      : pctExpense >= 85
                        ? "bg-warning"
                        : "bg-emerald-500",
                  )}
                  style={{ width: `${Math.min(100, pctExpense)}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end pt-1">
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              aria-expanded={editing}
              className="text-xs text-muted hover:text-text inline-flex items-center gap-1 px-2 py-1 rounded-xl hover:bg-panelHi transition-colors"
            >
              <Icon name="edit" size={12} />
              {editing ? "Згорнути" : hasPlan ? "Редагувати" : "Задати план"}
            </button>
          </div>

          {editing && (
            <div className="space-y-2 border-t border-line pt-3">
              <Input
                type="number"
                placeholder="План доходу ₴"
                value={monthlyPlan?.income ?? ""}
                onChange={(e) =>
                  onChangeMonthlyPlan((p) => ({
                    ...p,
                    income: e.target.value,
                  }))
                }
              />
              <Input
                type="number"
                placeholder="План витрат ₴"
                value={monthlyPlan?.expense ?? ""}
                onChange={(e) =>
                  onChangeMonthlyPlan((p) => ({
                    ...p,
                    expense: e.target.value,
                  }))
                }
              />
              <Input
                type="number"
                placeholder="План накопичень ₴"
                value={monthlyPlan?.savings ?? ""}
                onChange={(e) =>
                  onChangeMonthlyPlan((p) => ({
                    ...p,
                    savings: e.target.value,
                  }))
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const MonthlyPlanCard = memo(MonthlyPlanCardComponent);
