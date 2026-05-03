import type { Dispatch, SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import {
  calculateGoalProgress,
  getGoalMonthlyLabel,
} from "@sergeant/finyk-domain/domain/budget";
import type { Budget } from "@sergeant/finyk-domain/domain/types";
import { GoalBudgetCard } from "../../components/budgets/GoalBudgetCard";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import type { useToast } from "@shared/hooks/useToast";

export interface BudgetsGoalsSectionProps {
  goalsOpen: boolean;
  toggleGoals: () => void;
  goalBudgets: Budget[];
  budgets: Budget[];
  setBudgets: Dispatch<SetStateAction<Budget[]>>;
  editIdx: number | null;
  setEditIdx: Dispatch<SetStateAction<number | null>>;
  now: Date;
  toast: ReturnType<typeof useToast>;
}

/**
 * Collapsible "Цілі накопичення" section: header toggle, empty state, and
 * the list of {@link GoalBudgetCard}s with edit/save/delete handlers.
 *
 * Goal cards are simpler than limits — no proactive advice, no deep-link
 * highlight — so this component only owns the collapsible chrome and the
 * per-card handler wiring.
 */
export function BudgetsGoalsSection({
  goalsOpen,
  toggleGoals,
  goalBudgets,
  budgets,
  setBudgets,
  editIdx,
  setEditIdx,
  now,
  toast,
}: BudgetsGoalsSectionProps) {
  return (
    <>
      <button
        type="button"
        onClick={toggleGoals}
        aria-expanded={goalsOpen}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left bg-panel border border-line rounded-2xl shadow-card hover:bg-panelHi transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-muted" aria-hidden>
            <Icon name="target" size={16} />
          </span>
          <SectionHeading
            as="span"
            size="sm"
            className="mb-0! normal-case tracking-normal"
          >
            Цілі накопичення
            {goalBudgets.length > 0 && (
              <span className="ml-1 text-subtle font-normal">
                ({goalBudgets.length})
              </span>
            )}
          </SectionHeading>
        </span>
        <Icon
          name="chevron-down"
          size={14}
          className={cn(
            "transition-transform text-muted shrink-0",
            goalsOpen ? "rotate-180" : "",
          )}
        />
      </button>
      {goalsOpen && goalBudgets.length === 0 && (
        <EmptyState
          compact
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
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
          title="Немає цілей"
          description="Постав ціль накопичення і відстежуй прогрес"
        />
      )}
      {goalsOpen &&
        goalBudgets.map((b, i) => {
          // Goal-specific fields live on the `[extra: string]: unknown`
          // index of `Budget` (the canonical Budget shape captures
          // limit-style fields). Read them through unknown casts so the
          // card / progress helper get the concrete numeric/string
          // values they require.
          const targetAmount = Number(
            (b as { targetAmount?: unknown }).targetAmount ?? 0,
          );
          const savedAmount = Number(
            (b as { savedAmount?: unknown }).savedAmount ?? 0,
          );
          const targetDate = (b as { targetDate?: unknown }).targetDate;
          const goalInput = {
            targetAmount,
            savedAmount,
            targetDate: typeof targetDate === "string" ? targetDate : undefined,
          };
          const cardBudget = {
            id: b.id,
            type: b.type === "goal" ? ("goal" as const) : ("limit" as const),
            emoji: (b as { emoji?: unknown }).emoji as string | undefined,
            name: (b as { name?: unknown }).name as string | undefined,
            targetAmount,
            savedAmount,
            targetDate: typeof targetDate === "string" ? targetDate : undefined,
          };
          const progress = calculateGoalProgress(goalInput, now);
          const globalIdx = budgets.indexOf(b);
          const isEditing = editIdx === globalIdx;
          return (
            <GoalBudgetCard
              key={b.id || i}
              budget={cardBudget}
              saved={progress.saved}
              pct={progress.pct}
              daysLeft={progress.daysLeft}
              monthlyLabel={getGoalMonthlyLabel(progress)}
              isEditing={isEditing}
              onBeginEdit={() => setEditIdx(globalIdx)}
              onChangeSaved={(nextSaved) =>
                setBudgets((bs) =>
                  bs.map((x, j) =>
                    j === globalIdx
                      ? { ...x, savedAmount: Number(nextSaved) }
                      : x,
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
                  msg: "Видалено ціль",
                  onUndo: () =>
                    setBudgets((bs) => {
                      const next = [...bs];
                      next.splice(removedIdx, 0, removed);
                      return next;
                    }),
                });
              }}
            />
          );
        })}
    </>
  );
}
