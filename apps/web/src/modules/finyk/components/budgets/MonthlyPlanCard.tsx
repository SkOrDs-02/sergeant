import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Card } from "@shared/components/ui/Card";
/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { memo, useId, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { cn } from "@shared/lib/ui/cn";

import { MoneyInput } from "@shared/components/ui/MoneyInput";
import { Label } from "@shared/components/ui/FormField";
import { Money } from "@shared/components/ui/Money";

// Mirrors `useStorage`'s MonthlyPlan: required income/expense/savings,
// each persisted as the canonical dot-form value (string while editing,
// number once committed). Defined inline here so the card stays free of a
// hook import; if a third file ever needs the type, hoist it to a shared
// module.

/**
 * Одне з трьох полів плану.
 *
 * Кома тут обовʼязкова так само, як у КБЖВ: «40 000,50» під `type="number"`
 * доїжджало обробнику порожнім рядком. Порожнє поле лишається порожнім
 * рядком, а не нулем, інакше план неможливо очистити. Розряди групує
 * `MoneyInput` — саме на цьому екрані тестер і попросив пробіли.
 */
function PlanAmountField({
  id,
  label,
  placeholder,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: number | string;
  onCommit: (next: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <MoneyInput
        id={id}
        placeholder={placeholder}
        value={value}
        onValueChange={(next) => onCommit(next == null ? "" : String(next))}
      />
    </div>
  );
}

export type MonthlyPlan = {
  income: number | string;
  expense: number | string;
  savings: number | string;
};

interface MonthlyPlanCardProps {
  monthlyPlan: MonthlyPlan | null | undefined;
  onChangeMonthlyPlan: Dispatch<SetStateAction<MonthlyPlan>>;
  /**
   * «Приховати суми» (PR-F3 founder-UX audit 2026-09-13): доти цей проп
   * приходив у `Budgets`, але картка його не приймала й малювала суми
   * завжди — свайп на Планування залишав приховані на Огляді числа
   * відкритими. Маскує лише РОЗРАХОВАНІ суми (згорнута шапка, таблиця
   * План/Факт/Δ, safe-to-spend); поля редагування плану лишаються
   * видимими — людина саме зараз їх вводить.
   */
  showBalance?: boolean;
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
  /**
   * Прогноз витрат на кінець місяця за поточним темпом
   * (`projectMonthEndSpend`); `null` у перші два дні місяця.
   */
  forecastExpense?: number | null | undefined;
  /**
   * When true, the card auto-opens and auto-enters the edit form on
   * mount. Set on the user's first Finyk entry by `FinykApp` via
   * `useModuleFirstRun`.
   */
  firstRunHint?: boolean | undefined;
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
  showBalance = true,
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
  forecastExpense,
  firstRunHint,
}: MonthlyPlanCardProps) {
  // First-run path force-opens both the card body and the inline
  // editor so the user lands directly on the inputs they need to fill
  // in. Defaults are read once via the `useState` lazy initializer so
  // re-renders after the parent's `firstRunHint` prop flips back to
  // false do not yank the editor closed mid-edit.
  const [open, setOpen] = useState<boolean>(() => firstRunHint === true);
  const [editing, setEditing] = useState<boolean>(() => firstRunHint === true);
  const hasPlan = planIncome > 0 || planExpense > 0 || planSavings > 0;

  const fieldId = useId();
  const incomeId = `${fieldId}-income`;
  const expenseId = `${fieldId}-expense`;
  const savingsId = `${fieldId}-savings`;

  const incomeDelta = factIncome - planIncome;
  const expenseDelta = totalExpenseFact - planExpense;
  const savingsDelta = factSavings - planSavings;

  return (
    <Card
      prominence={
        (hasPlan || totalExpenseFact > 0) && !editing ? "hero" : "panel"
      }
      tone="finyk"
      padding="none"
      className="overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left hover:bg-panel transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <SectionHeading as="span" size="lg" variant="text">
            План на місяць
          </SectionHeading>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasPlan && !open && (
            <span
              className={cn(
                // Роль + `font-semibold` на одному вузлі — це безпечно:
                // вага виграє в каскаді (замір і межі застосовності — у
                // `tailwind-preset.js`, блок «Роль + font-* на ОДНОМУ
                // вузлі»). Перевитрата лишається важчою за норму, як і
                // задумано: це єдине число, видне на згорнутій картці.
                "text-style-caption tabular-nums",
                isOver ? "text-text font-semibold" : "text-text",
              )}
            >
              {!showBalance ? (
                "••••"
              ) : isOver ? (
                <Money amount={planExpense - totalExpenseFact} tone="inherit" />
              ) : planExpense > 0 ? (
                <>
                  {pctExpense}% · <Money amount={remaining} tone="inherit" />
                </>
              ) : (
                <Money amount={planIncome} signed tone="inherit" />
              )}
            </span>
          )}
          {!hasPlan && !open && (
            <span className="text-style-caption text-text">Не заданий</span>
          )}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 space-y-3">
          {hasPlan ? (
            /* H.2: усі суми й дельти на тинті чорнилом, знак лишається текстом. */
            <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-3 gap-y-1.5 text-style-label tabular-nums items-baseline">
              <div />
              <div className="text-style-caption text-text text-right">
                План
              </div>
              <div className="text-style-caption text-text text-right">
                Факт
              </div>
              <div className="text-style-caption text-text text-right">Δ</div>

              <div className="text-style-caption text-text">Дохід</div>
              <div className="text-right text-text">
                {!showBalance ? (
                  "••••"
                ) : planIncome > 0 ? (
                  <Money amount={planIncome} tone="inherit" />
                ) : (
                  "—"
                )}
              </div>
              <div className="text-right text-text">
                {!showBalance ? (
                  "••••"
                ) : factIncome > 0 ? (
                  <Money amount={factIncome} signed tone="inherit" />
                ) : (
                  "—"
                )}
              </div>
              <div
                className={cn(
                  "text-right text-style-caption",
                  planIncome === 0
                    ? "text-text"
                    : incomeDelta >= 0
                      ? "text-text"
                      : "text-text",
                )}
              >
                {!showBalance ? (
                  "••••"
                ) : planIncome > 0 ? (
                  <Money amount={incomeDelta} signed tone="inherit" />
                ) : (
                  "—"
                )}
              </div>

              <div className="text-style-caption text-text">Витрати</div>
              <div className="text-right text-text">
                {!showBalance ? (
                  "••••"
                ) : planExpense > 0 ? (
                  <Money amount={planExpense} tone="inherit" />
                ) : (
                  "—"
                )}
              </div>
              <div
                className={cn(
                  "text-right",
                  isOver ? "text-text font-semibold" : "text-text",
                )}
              >
                {!showBalance ? (
                  "••••"
                ) : totalExpenseFact > 0 ? (
                  <Money amount={-totalExpenseFact} tone="inherit" />
                ) : (
                  "—"
                )}
              </div>
              <div
                className={cn(
                  "text-right text-style-caption",
                  planExpense === 0
                    ? "text-text"
                    : expenseDelta > 0
                      ? "text-text"
                      : "text-text",
                )}
              >
                {!showBalance ? (
                  "••••"
                ) : planExpense > 0 ? (
                  <Money amount={expenseDelta} signed tone="inherit" />
                ) : (
                  "—"
                )}
              </div>

              <div className="text-style-caption text-text">Накопич.</div>
              <div className="text-right text-text">
                {!showBalance ? (
                  "••••"
                ) : planSavings > 0 ? (
                  <Money amount={planSavings} tone="inherit" />
                ) : (
                  "—"
                )}
              </div>
              <div
                className={cn(
                  "text-right",
                  factSavings >= 0 ? "text-text" : "text-text",
                )}
              >
                {!showBalance ? (
                  "••••"
                ) : planSavings > 0 || factSavings !== 0 ? (
                  <Money amount={factSavings} signed tone="inherit" />
                ) : (
                  "—"
                )}
              </div>
              <div
                className={cn(
                  "text-right text-style-caption",
                  planSavings === 0 && factSavings === 0
                    ? "text-text"
                    : savingsDelta >= 0
                      ? "text-text"
                      : "text-text",
                )}
              >
                {!showBalance ? (
                  "••••"
                ) : planSavings > 0 || factSavings !== 0 ? (
                  <Money amount={savingsDelta} signed tone="inherit" />
                ) : (
                  "—"
                )}
              </div>
            </div>
          ) : (
            <div className="text-style-label text-text">
              Постав план, і побачиш, скільки безпечно витрачати на день.
            </div>
          )}

          {hasPlan && planExpense > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-style-caption text-text">
                <span>{pctExpense}% витрачено</span>
                {safePerDay > 0 && daysLeft > 0 && !isOver && (
                  <span className="tabular-nums">
                    {showBalance ? (
                      <Money amount={safePerDay} tone="inherit" />
                    ) : (
                      "••••"
                    )}
                    /день · {daysLeft} дн.
                  </span>
                )}
                {isOver && (
                  <span className="text-text font-semibold tabular-nums">
                    {showBalance ? (
                      <Money
                        amount={planExpense - totalExpenseFact}
                        tone="inherit"
                      />
                    ) : (
                      "••••"
                    )}
                  </span>
                )}
              </div>
              <div className="h-2 bg-bg rounded-[3px] overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-[3px] transition-[width,background-color]",
                    isOver
                      ? "bg-danger"
                      : pctExpense >= 85
                        ? "bg-warning"
                        : "bg-success",
                  )}
                  style={{ width: `${Math.min(100, pctExpense)}%` }}
                />
              </div>
              {showBalance &&
                forecastExpense != null &&
                forecastExpense > 0 && (
                  <div className="text-style-caption text-text">
                    За поточним темпом до кінця місяця ~
                    <Money
                      amount={Math.round(forecastExpense)}
                      tone="inherit"
                    />
                  </div>
                )}
            </div>
          )}

          <div className="flex items-center justify-end pt-1">
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              aria-expanded={editing}
              className="text-style-caption text-text hover:text-text inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-panel transition-colors"
            >
              {editing ? "Згорнути" : hasPlan ? "Редагувати" : "Задати план"}
            </button>
          </div>

          {editing && (
            <div className="space-y-2 border-t border-line pt-3">
              <PlanAmountField
                id={incomeId}
                label="План доходу"
                placeholder="Сума"
                value={monthlyPlan?.income ?? ""}
                onCommit={(income) =>
                  onChangeMonthlyPlan((p) => ({ ...p, income }))
                }
              />
              <PlanAmountField
                id={expenseId}
                label="План витрат"
                placeholder="Сума"
                value={monthlyPlan?.expense ?? ""}
                onCommit={(expense) =>
                  onChangeMonthlyPlan((p) => ({ ...p, expense }))
                }
              />
              <PlanAmountField
                id={savingsId}
                label="План накопичень"
                placeholder="Сума"
                value={monthlyPlan?.savings ?? ""}
                onCommit={(savings) =>
                  onChangeMonthlyPlan((p) => ({ ...p, savings }))
                }
              />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export const MonthlyPlanCard = memo(MonthlyPlanCardComponent);
