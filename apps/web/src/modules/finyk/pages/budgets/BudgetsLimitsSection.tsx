import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import {
  calculateLimitUsage,
  shouldShowProactiveAdvice,
} from "@sergeant/finyk-domain/domain/budget";
import type { Budget, Category } from "@sergeant/finyk-domain/domain/types";
import { LimitBudgetCard } from "../../components/budgets/LimitBudgetCard";
import { resolveExpenseCategoryMeta } from "../../utils";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import type { useToast } from "@shared/hooks/useToast";
import type { ProactiveItem } from "./budgetsLib";

export interface BudgetsLimitsSectionProps {
  limitsOpen: boolean;
  toggleLimits: () => void;
  monthStart: Date;
  limitBudgets: Budget[];
  budgets: Budget[];
  setBudgets: Dispatch<SetStateAction<Budget[]>>;
  editIdx: number | null;
  setEditIdx: Dispatch<SetStateAction<number | null>>;
  customCategories: Category[] | undefined;
  calcSpent: (b: Budget) => number;
  proactiveItems: ProactiveItem[];
  proactiveAdvice: Record<string, string | null>;
  proactiveLoading: Record<string, boolean>;
  dismissedAdvice: Record<string, string>;
  dismissAdvice: (categoryId: string, monthKey: string, text: string) => void;
  highlightedCategoryId: string | null;
  limitCardRefs: MutableRefObject<Map<string, HTMLDivElement | null>>;
  toast: ReturnType<typeof useToast>;
}

/**
 * Collapsible "Ліміти" section: header toggle, empty state, and the list
 * of {@link LimitBudgetCard}s with proactive advice / dismiss / edit /
 * delete handlers wired in. Also hosts the deep-link highlight ring (the
 * caller passes `highlightedCategoryId` and a `limitCardRefs` map so the
 * containing page can scroll into view first).
 */
export function BudgetsLimitsSection({
  limitsOpen,
  toggleLimits,
  monthStart,
  limitBudgets,
  budgets,
  setBudgets,
  editIdx,
  setEditIdx,
  customCategories,
  calcSpent,
  proactiveItems,
  proactiveAdvice,
  proactiveLoading,
  dismissedAdvice,
  dismissAdvice,
  highlightedCategoryId,
  limitCardRefs,
  toast,
}: BudgetsLimitsSectionProps) {
  return (
    <>
      <button
        type="button"
        onClick={toggleLimits}
        aria-expanded={limitsOpen}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left bg-panel border border-line rounded-2xl shadow-card hover:bg-panelHi transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-muted" aria-hidden>
            <Icon name="calendar" size={16} />
          </span>
          <SectionHeading
            as="span"
            size="sm"
            className="mb-0! normal-case tracking-normal"
          >
            Ліміти · {monthStart.toLocaleDateString("uk-UA", { month: "long" })}
            {limitBudgets.length > 0 && (
              <span className="ml-1 text-subtle font-normal">
                ({limitBudgets.length})
              </span>
            )}
          </SectionHeading>
        </span>
        <Icon
          name="chevron-down"
          size={14}
          className={cn(
            "transition-transform text-muted shrink-0",
            limitsOpen ? "rotate-180" : "",
          )}
        />
      </button>
      {limitsOpen && limitBudgets.length === 0 && (
        <EmptyState
          compact
          module="finyk"
          icon={
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
          title="Поки немає лімітів"
          description="Встанови ліміт витрат на категорію, щоб не виходити за межі бюджету — кнопка нижче."
        />
      )}
      {limitsOpen &&
        limitBudgets.map((b, i) => {
          const categoryId = b.categoryId ?? "";
          const cat = resolveExpenseCategoryMeta(categoryId, customCategories);
          const bspent = calcSpent(b);
          const usage = calculateLimitUsage(b, bspent);
          const globalIdx = budgets.indexOf(b);
          const showAdvice = shouldShowProactiveAdvice(usage, null);
          const isEditing = editIdx === globalIdx;
          const catLabel = cat?.label || "—";
          const isHighlighted = highlightedCategoryId === categoryId;
          const adviceText = proactiveAdvice[categoryId];
          const monthKey =
            proactiveItems.find((it) => it.categoryId === categoryId)
              ?.monthKey ?? "";
          const dismissedKey = `${monthKey}_${categoryId}`;
          const isDismissed =
            adviceText && dismissedAdvice[dismissedKey] === adviceText;
          return (
            <div
              key={b.id || i}
              ref={(node) => {
                if (node) {
                  limitCardRefs.current.set(categoryId, node);
                } else {
                  limitCardRefs.current.delete(categoryId);
                }
              }}
              className={cn(
                "rounded-2xl transition-shadow duration-300",
                isHighlighted &&
                  "ring-2 ring-finyk/60 ring-offset-2 ring-offset-bg",
              )}
            >
              <LimitBudgetCard
                budget={{
                  id: b.id,
                  type:
                    b.type === "goal" ? ("goal" as const) : ("limit" as const),
                  categoryId,
                  limit: typeof b.limit === "number" ? b.limit : 0,
                }}
                categoryLabel={catLabel}
                spent={usage.spent}
                pctRaw={usage.pctRaw}
                pctRounded={usage.pctRounded}
                remaining={usage.remaining}
                isEditing={isEditing}
                showProactiveAdvice={showAdvice}
                proactiveLoading={proactiveLoading[categoryId]}
                proactiveText={isDismissed ? null : adviceText}
                onDismissAdvice={
                  adviceText
                    ? () => {
                        if (monthKey) {
                          dismissAdvice(categoryId, monthKey, adviceText);
                        }
                      }
                    : undefined
                }
                onBeginEdit={() => setEditIdx(globalIdx)}
                onChangeLimit={(nextLimit) =>
                  setBudgets((bs) =>
                    bs.map((x, j) =>
                      j === globalIdx ? { ...x, limit: Number(nextLimit) } : x,
                    ),
                  )
                }
                onSave={() => setEditIdx(null)}
                onDelete={() => {
                  const removed = b;
                  const removedIdx = globalIdx;
                  setBudgets((bs) => bs.filter((_, j) => j !== removedIdx));
                  setEditIdx(null);
                  showUndoToast(toast, {
                    msg: "Видалено ліміт",
                    onUndo: () =>
                      setBudgets((bs) => {
                        const next = [...bs];
                        next.splice(removedIdx, 0, removed);
                        return next;
                      }),
                  });
                }}
              />
            </div>
          );
        })}
    </>
  );
}
