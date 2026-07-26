import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { toLocalISODate } from "@sergeant/shared";
import type { MonoJarDto } from "@shared/api";
import {
  calculateGoalProgress,
  calculateGoalSavedAmount,
  getGoalMonthlyLabel,
  migrateGoalSavedAmountToContribution,
  sumGoalContributions,
} from "@sergeant/finyk-domain/domain/budget";
import type { Budget, GoalBudget } from "@sergeant/finyk-domain/domain/types";
import { GoalBudgetCard } from "../../components/budgets/GoalBudgetCard";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import type { useToast } from "@shared/hooks/useToast";

export interface BudgetsGoalsSectionProps {
  goalsOpen: boolean;
  toggleGoals: () => void;
  goalBudgets: GoalBudget[];
  budgets: Budget[];
  setBudgets: Dispatch<SetStateAction<Budget[]>>;
  editIdx: number | null;
  setEditIdx: Dispatch<SetStateAction<number | null>>;
  now: Date;
  toast: ReturnType<typeof useToast>;
  /** Банки Monobank юзера — для розрахунку прогресу і дропдауна привʼязки. */
  jars?: readonly MonoJarDto[];
}

/**
 * Collapsible "Цілі накопичення" section: header toggle, empty state, and
 * the list of {@link GoalBudgetCard}s with edit/save/delete handlers.
 *
 * Прогрес кожної цілі (goal-progress-auto-sync) рахується тут:
 * `баланс привʼязаної банки + сума ручних поповнень`. Стара ціль з
 * `savedAmount > 0` і без `contributions` мігрується "на льоту"
 * (`migrateGoalSavedAmountToContribution`) — без запису назад у storage
 * (persist трапляється органічно на перший add/delete-поповнення через
 * `setBudgets`, ponytail: skip окрему background-міграцію, додати якщо
 * знадобиться примусова реконсиляція).
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
  jars = [],
}: BudgetsGoalsSectionProps) {
  const migrationDate = toLocalISODate(now);

  const jarsById = useMemo(
    () => new Map(jars.map((j) => [j.monoJarId, j])),
    [jars],
  );
  const jarOptions = useMemo(
    () =>
      jars.map((j) => ({
        id: j.monoJarId,
        label: j.title?.trim() || j.monoJarId,
      })),
    [jars],
  );

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
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
          title="Поки немає цілей"
          description="Постав ціль накопичення і відстежуй прогрес — кнопка нижче."
        />
      )}
      {goalsOpen &&
        goalBudgets.map((b, i) => {
          // `b` is a `GoalBudget` (union narrowed by `getGoalBudgets`), so
          // goal fields are read type-safely — no more `(b as { … }).x`
          // unknown casts (page-audit-05 F15).
          const migrated = migrateGoalSavedAmountToContribution(
            b,
            migrationDate,
          );
          const linkedJar = b.linkedJarId
            ? jarsById.get(b.linkedJarId)
            : undefined;
          // Monobank balances are minor units (копійки) — convert to UAH
          // before combining with contributions (Hard Rule money invariant).
          const jarBalanceUah =
            linkedJar?.balance != null ? linkedJar.balance / 100 : undefined;
          const fromContributions = sumGoalContributions(
            migrated.contributions,
          );
          const saved = calculateGoalSavedAmount({
            contributions: migrated.contributions,
            linkedJarBalanceUah: jarBalanceUah,
          });
          const goalInput = {
            targetAmount: b.targetAmount,
            savedAmount: saved,
            targetDate: b.targetDate,
          };
          const cardBudget = {
            id: b.id,
            type: "goal" as const,
            emoji: b.emoji,
            name: b.name,
            targetAmount: b.targetAmount,
            targetDate: b.targetDate,
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
              fromJar={jarBalanceUah ?? 0}
              fromContributions={fromContributions}
              contributions={migrated.contributions}
              linkedJarId={b.linkedJarId ?? ""}
              linkedJarLabel={linkedJar?.title?.trim() || linkedJar?.monoJarId}
              jars={jarOptions}
              isEditing={isEditing}
              onBeginEdit={() => setEditIdx(globalIdx)}
              onChangeName={(nextName) =>
                setBudgets((bs) =>
                  bs.map((x, j) =>
                    j === globalIdx && x.type === "goal"
                      ? { ...x, name: nextName }
                      : x,
                  ),
                )
              }
              onChangeTarget={(nextTarget) =>
                setBudgets((bs) =>
                  bs.map((x, j) =>
                    j === globalIdx && x.type === "goal"
                      ? { ...x, targetAmount: Number(nextTarget) }
                      : x,
                  ),
                )
              }
              onChangeDate={(nextDate) =>
                setBudgets((bs) =>
                  bs.map((x, j) =>
                    j === globalIdx && x.type === "goal"
                      ? nextDate
                        ? { ...x, targetDate: nextDate }
                        : (({ targetDate: _removed, ...withoutDate }) =>
                            withoutDate)(x)
                      : x,
                  ),
                )
              }
              onChangeLinkedJar={(nextJarId) =>
                setBudgets((bs) =>
                  bs.map((x, j) =>
                    j === globalIdx && x.type === "goal"
                      ? { ...x, linkedJarId: nextJarId || undefined }
                      : x,
                  ),
                )
              }
              onAddContribution={(amountUah, note) =>
                setBudgets((bs) =>
                  bs.map((x, j) => {
                    if (j !== globalIdx || x.type !== "goal") return x;
                    const base = migrateGoalSavedAmountToContribution(
                      x,
                      migrationDate,
                    );
                    return {
                      ...base,
                      contributions: [
                        ...base.contributions,
                        {
                          id: crypto.randomUUID(),
                          amountUah,
                          // eslint-disable-next-line no-restricted-syntax -- wall-clock instant passed straight into Kyiv-time helper toLocalISODate
                          date: toLocalISODate(new Date()),
                          note,
                        },
                      ],
                    };
                  }),
                )
              }
              onDeleteContribution={(contributionId) =>
                setBudgets((bs) =>
                  bs.map((x, j) => {
                    if (j !== globalIdx || x.type !== "goal") return x;
                    const base = migrateGoalSavedAmountToContribution(
                      x,
                      migrationDate,
                    );
                    return {
                      ...base,
                      contributions: base.contributions.filter(
                        (c) => c.id !== contributionId,
                      ),
                    };
                  }),
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
