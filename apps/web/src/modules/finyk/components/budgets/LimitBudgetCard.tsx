/**
 * Last validated: 2026-09-24
 * Status: Active
 */
import { memo, useId, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Skeleton } from "@shared/components/ui/Skeleton";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { Card } from "@shared/components/ui/Card";
import { FinanceItemHeading } from "../FinanceItemHeading";
import { Money } from "@shared/components/ui/Money";
import { formatNumberUk, NARROW_NBSP } from "@sergeant/shared";
import { MoneyInput } from "@shared/components/ui/MoneyInput";
import { Label } from "@shared/components/ui/FormField";
import { Tooltip } from "@shared/components/ui/Tooltip";
import { Select } from "@shared/components/ui/Select";
import { formatLimitUsedLabel } from "@sergeant/finyk-domain/domain/budget";
import { MorphChevron } from "@shared/components/ui/MorphChevron";
import { CategorySwatch } from "../CategorySwatch";

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
  /** «Приховати суми» (PR-F3) — маскує факт/ліміт/залишок/розбивку. */
  showBalance?: boolean;
  /**
   * Розбивка факту по категоріях комбо-ліміту (рішення founder-а 2026-08-25:
   * «сума + розбивка»). Рендериться лише коли рядків 2+; для одиночного
   * ліміту проп не передається.
   */
  breakdown?: readonly LimitBreakdownRow[] | undefined;
  /**
   * Прогноз витрат на кінець місяця за поточним темпом (`calcLimitPace`).
   * `null`/відсутнє — прогнозу нема: перші два дні місяця, не місячний
   * період або ще жодної витрати.
   */
  forecast?: number | null | undefined;
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
  customCategories,
  showBalance = true,
  breakdown,
  forecast,
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
  const categoryIds = budget.categoryIds ?? [];
  const singleCategoryId =
    categoryIds.length > 1 ? null : (categoryIds[0] ?? budget.categoryId);
  const warnLimit = pctRaw >= 80 && !overLimit;
  const [adviceOpen, setAdviceOpen] = useState(true);
  const fieldId = useId();
  const limitId = `${fieldId}-limit`;
  const periodId = `${fieldId}-period`;
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
      {showBalance ? (
        <>
          {formatNumberUk(Math.round(spent))} / {formatNumberUk(budget.limit)}
          {NARROW_NBSP}₴
        </>
      ) : (
        "••••"
      )}
    </span>
  );

  return (
    <Card
      as="article"
      aria-label={categoryLabel || "—"}
      prominence="ghost"
      padding="none"
      className="border-t border-line rounded-none py-4"
    >
      {isEditing ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-1">
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
              placeholder="Сума"
              value={budget.limit}
              onValueChange={(next) => onChangeLimit?.(next ?? 0)}
            />
          </div>
          <Label htmlFor={periodId}>Період</Label>
          <Select
            id={periodId}
            value={budget.period ?? "month"}
            onChange={(event) =>
              onChangePeriod?.(
                event.target.value as "month" | "week" | "one_time",
              )
            }
          >
            <option value="month">Щомісяця</option>
            <option value="week">Щотижня</option>
            <option value="one_time">Одноразово</option>
          </Select>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              size="sm"
              onClick={onSave}
              tone="ink"
              variant="solid"
            >
              Зберегти
            </Button>
            <Button
              className="flex-1"
              size="sm"
              variant="soft"
              tone="danger"
              onClick={onDelete}
            >
              Видалити
            </Button>
          </div>
        </div>
      ) : (
        <>
          <FinanceItemHeading
            title={
              singleCategoryId ? (
                <span className="inline-flex min-w-0 items-center gap-2">
                  <CategorySwatch
                    categoryId={singleCategoryId}
                    customCategories={customCategories}
                  />
                  <span className="min-w-0 truncate">
                    {categoryLabel || "—"}
                  </span>
                </span>
              ) : (
                categoryLabel || "—"
              )
            }
            meta={periodLabel}
            actions={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                iconOnly
                onClick={onBeginEdit}
                aria-label="Редагувати ліміт"
              >
                <Icon name="edit" size="md" aria-hidden />
              </Button>
            }
            value={
              <div
                className={cn(
                  "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1",
                  showBalance &&
                    overLimit &&
                    "text-danger-strong dark:text-danger",
                )}
              >
                {showBalance && (
                  <span className="text-style-caption font-medium">
                    {overLimit ? "Перевищено на" : "Залишок"}
                  </span>
                )}
                <span>
                  {!showBalance ? (
                    "••••"
                  ) : overLimit ? (
                    <Money
                      amount={spent - budget.limit}
                      kopecks
                      tone="inherit"
                    />
                  ) : (
                    <Money amount={remaining} tone="inherit" />
                  )}
                </span>
              </div>
            }
          />
          <div className="h-2 bg-bg rounded-[3px] overflow-hidden">
            <div
              className={cn(
                "h-full rounded-[3px] transition-[width,background-color] duration-slower",
                overLimit
                  ? "bg-danger"
                  : warnLimit
                    ? "bg-warning"
                    : "bg-success",
              )}
              style={{ width: `${Math.min(100, pctRaw)}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-style-caption text-muted">
            {amountNode}
            <span>
              {showBalance ? formatLimitUsedLabel(pctRounded) : "••••"}
            </span>
          </div>
          {showBalance && forecast != null && forecast > 0 && (
            <div className="text-style-caption text-subtle mt-1">
              За поточним темпом до кінця місяця ~
              <Money amount={Math.round(forecast)} />
            </div>
          )}

          {breakdown && breakdown.length > 1 && (
            // Розбивка факту комбо-ліміту: видно, ЩО саме зʼїло бюджет.
            // Без власних під-лімітів — лише факт по кожній категорії.
            <ul
              className="mt-3 space-y-2 border-l border-line pl-3"
              aria-label="Витрати по категоріях"
            >
              {breakdown.map((row) => (
                <li
                  key={row.categoryId}
                  className="flex items-center justify-between gap-2 text-style-caption text-subtle"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <CategorySwatch
                      categoryId={row.categoryId}
                      customCategories={customCategories}
                    />
                    <span className="truncate">{row.label}</span>
                  </span>
                  <span className="tabular-nums shrink-0">
                    {showBalance ? <Money amount={row.spent} /> : "••••"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {showProactiveAdvice &&
            (proactiveText || proactiveLoading !== false) && (
              <div className="mt-3 bg-bg rounded-panel overflow-hidden">
                {proactiveText ? (
                  <>
                    <div className="flex items-stretch">
                      <button
                        type="button"
                        onClick={() => setAdviceOpen((v) => !v)}
                        aria-expanded={adviceOpen}
                        className="flex-1 flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-line/40 transition-colors"
                      >
                        <span className="flex items-center gap-2 text-style-caption text-text">
                          Порада Сержанта
                        </span>
                        <MorphChevron
                          open={adviceOpen}
                          className="text-subtle"
                        />
                      </button>
                      {onDismissAdvice && (
                        <Tooltip
                          content="Прибрати пораду до наступної генерації"
                          placement="top-center"
                        >
                          <Button variant="text" onClick={onDismissAdvice}>
                            Зрозуміло
                          </Button>
                        </Tooltip>
                      )}
                    </div>
                    {adviceOpen && (
                      <p className="px-3 pb-2.5 text-style-caption text-text leading-relaxed">
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
