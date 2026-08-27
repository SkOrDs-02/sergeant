/**
 * Last validated: 2026-08-21
 * Status: Active
 */
import { memo, useId, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Skeleton } from "@shared/components/ui/Skeleton";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { Card } from "@shared/components/ui/Card";
import { Money } from "@shared/components/ui/Money";
import { formatNumberUk, NARROW_NBSP } from "@sergeant/shared";
import { MoneyInput } from "@shared/components/ui/MoneyInput";
import { Label } from "@shared/components/ui/FormField";
import { Tooltip } from "@shared/components/ui/Tooltip";
import { CategoryIconChip } from "../CategoryIconChip";

interface LimitBudgetInput {
  id: string;
  type?: "limit" | "goal";
  categoryId?: string;
  /** Повний набір категорій мульти-категорійного ліміту (1+). */
  categoryIds?: string[];
  limit: number;
  period?: "month" | "week" | "one_time";
  createdAt?: string;
  [extra: string]: unknown;
}

/** Рядок розбивки факту комбо-ліміту по категорії. */
export interface LimitBreakdownRow {
  categoryId: string;
  label: string;
  spent: number;
}

interface LimitBudgetCardProps {
  budget: LimitBudgetInput;
  categoryLabel?: string | null | undefined;
  /**
   * Потрібен для іконки й відтінку чипа. До 2026-08-21 картка малювала
   * лише підпис — а підпис резолвера ніс емодзі-префікс («🛒 Продукти»),
   * тож «іконкою» тут був системний емодзі-гліф, тоді як рядок
   * транзакції показував SVG дизайн-системи. Репорт тестувальника про
   * «в лімітах є іконки, а у витратах немає» — саме про цю розбіжність.
   */
  customCategories?: readonly { id: string }[] | undefined;
  /**
   * Розбивка факту по категоріях комбо-ліміту (рішення founder-а 2026-08-25:
   * «сума + розбивка»). Рендериться лише коли рядків 2+; для одиночного
   * ліміту проп не передається.
   */
  breakdown?: readonly LimitBreakdownRow[] | undefined;
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
  customCategories = [],
  breakdown,
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
  const fieldId = useId();
  const limitId = `${fieldId}-limit`;
  const periodId = `${fieldId}-period`;
  const categoryIds =
    budget.categoryIds && budget.categoryIds.length > 0
      ? budget.categoryIds
      : [budget.categoryId ?? ""];
  const isCombo = categoryIds.length > 1;
  const periodLabel =
    budget.period === "week"
      ? "Щотижня"
      : budget.period === "one_time"
        ? "Одноразовий"
        : "Щомісяця";
  const amountTone = overLimit
    ? "text-danger-strong dark:text-danger font-semibold"
    : warnLimit
      ? "text-warning-strong dark:text-warning"
      : "text-muted";
  // Сума «витрачено / ліміт» — один рядок, ніколи не рветься по «/».
  const amountNode = (
    <span className={cn("tabular-nums whitespace-nowrap", amountTone)}>
      {formatNumberUk(spent)} / {formatNumberUk(budget.limit)}
      {NARROW_NBSP}₴
    </span>
  );

  return (
    <Card radius="lg" padding="lg">
      {isEditing ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-1">
            <CategoryIconChip
              categoryId={budget.categoryId ?? ""}
              customCategories={customCategories}
              size={24}
            />
            <div>
              <p className="text-style-caption text-muted">
                Редагування ліміту
              </p>
              <p className="text-style-label text-text">
                {categoryLabel || "Без категорії"}
              </p>
            </div>
          </div>
          <div>
            <Label htmlFor={limitId}>Ліміт</Label>
            <MoneyInput
              id={limitId}
              size="sm"
              placeholder="Напр. 5 000 ₴"
              value={budget.limit}
              onValueChange={(next) => onChangeLimit?.(next ?? 0)}
            />
          </div>
          <Label htmlFor={periodId}>Період</Label>
          <select
            id={periodId}
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
            <div className="flex items-center gap-2 min-w-0">
              {isCombo ? (
                // Комбо-ліміт: до трьох чипів категорій поруч, решта — «+N».
                <span className="flex items-center gap-1 shrink-0">
                  {categoryIds.slice(0, 3).map((id) => (
                    <CategoryIconChip
                      key={id}
                      categoryId={id}
                      customCategories={customCategories}
                      size={24}
                    />
                  ))}
                  {categoryIds.length > 3 && (
                    <span className="text-style-caption text-muted">
                      +{categoryIds.length - 3}
                    </span>
                  )}
                </span>
              ) : (
                <CategoryIconChip
                  categoryId={budget.categoryId ?? ""}
                  customCategories={customCategories}
                />
              )}
              <div className="min-w-0 flex-1">
                {/* `truncate`, а не перенос: підпис комбо довший за
                    одно-категорійний, і при переносі лишав у другому рядку
                    самотнє «2» (браузерний QA 2026-08-26). Обрізати безпечно —
                    повний склад набору стоїть нижче рядками розбивки. */}
                <span className="text-style-label block truncate">
                  {categoryLabel || "—"}
                </span>
                <div className="text-style-caption text-subtle mt-0.5 flex items-center gap-1.5">
                  <span>{periodLabel}</span>
                  {/* У комбо сума їде в цей рядок: чипи + сума + олівець на
                      одній лінії лишали підпису ~94px при потрібних ~140, і
                      «Продукти + ще 2» обрізалось трьома крапками ще на 390px.
                      Одно-категорійна картка лишається з сумою праворуч —
                      рівно як була. */}
                  {isCombo ? (
                    <>
                      <span aria-hidden>·</span>
                      {amountNode}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {/* Групування розрядів: без нього «3635 / 20000 ₴» розходилось із
                  форматованими «Залишок 16 365 ₴» і рядками розбивки на тій
                  самій картці. NARROW_NBSP перед ₴ — той самий відступ, що
                  ставить <Money> нижче (браузерний QA 2026-08-25). */}
              {isCombo ? null : (
                <span className="text-style-caption">{amountNode}</span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                iconOnly
                onClick={onBeginEdit}
                aria-label="Редагувати ліміт"
              >
                <Icon name="edit" size={16} aria-hidden />
              </Button>
            </div>
          </div>
          <div className="h-2 bg-bg rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-[width,background-color] duration-slower",
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
              "text-style-caption mt-2",
              overLimit
                ? "text-danger-strong dark:text-danger font-medium"
                : warnLimit
                  ? "text-warning-strong dark:text-warning"
                  : "text-subtle",
            )}
          >
            {overLimit ? (
              <>
                Перевищено на <Money amount={spent - budget.limit} />
              </>
            ) : (
              <>
                Залишок <Money amount={remaining} /> · {pctRounded}% використано
              </>
            )}
          </div>

          {breakdown && breakdown.length > 1 && (
            // Розбивка факту комбо-ліміту: видно, ЩО саме зʼїло бюджет.
            // Без власних під-лімітів — лише факт по кожній категорії.
            <ul className="mt-2 space-y-1" aria-label="Витрати по категоріях">
              {breakdown.map((row) => (
                <li
                  key={row.categoryId}
                  className="flex items-center justify-between gap-2 text-style-caption text-subtle"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <CategoryIconChip
                      categoryId={row.categoryId}
                      customCategories={customCategories}
                      size={24}
                    />
                    <span className="truncate">{row.label}</span>
                  </span>
                  <span className="tabular-nums shrink-0">
                    <Money amount={row.spent} />
                  </span>
                </li>
              ))}
            </ul>
          )}

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
                            className="px-3 text-style-caption text-muted hover:text-text border-l border-line transition-colors"
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
