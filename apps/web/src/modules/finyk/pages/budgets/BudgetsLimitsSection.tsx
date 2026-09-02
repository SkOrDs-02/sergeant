import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import {
  calculateLimitUsage,
  formatLimitBudgetLabel,
  limitBudgetCategoryIds,
  limitBudgetCategoryKey,
  shouldShowProactiveAdvice,
} from "@sergeant/finyk-domain/domain/budget";
import type {
  Budget,
  Category,
  LimitBudget,
} from "@sergeant/finyk-domain/domain/types";
import { LimitBudgetCard } from "../../components/budgets/LimitBudgetCard";
import { stripLeadingEmoji } from "../../components/txRowHelpers";
import { resolveExpenseCategoryMeta } from "../../utils";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import type { useToast } from "@shared/hooks/useToast";
import type { ProactiveItem } from "./budgetsLib";

export interface BudgetsLimitsSectionProps {
  limitsOpen: boolean;
  toggleLimits: () => void;
  monthStart: Date;
  limitBudgets: LimitBudget[];
  budgets: Budget[];
  setBudgets: Dispatch<SetStateAction<Budget[]>>;
  editIdx: number | null;
  setEditIdx: Dispatch<SetStateAction<number | null>>;
  customCategories: Category[] | undefined;
  calcSpent: (b: Budget) => number;
  /** Розбивка факту по категоріях ліміту — для комбо-карток. */
  calcBreakdown: (b: LimitBudget) => { categoryId: string; spent: number }[];
  proactiveItems: ProactiveItem[];
  proactiveAdvice: Record<string, string | null>;
  proactiveLoading: Record<string, boolean>;
  dismissedAdvice: Record<string, string>;
  dismissAdvice: (categoryKey: string, monthKey: string, text: string) => void;
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
  calcBreakdown,
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
            size="xs"
            className="mb-0! normal-case tracking-normal"
            variant="finyk"
          >
            {/* `monthStart` — київська північ 1-го числа (`getCurrentMonthContext`
                → `kyivDayStartMs`), тобто 21:00/22:00 UTC ОСТАННЬОГО дня
                попереднього місяця. Форматування без `timeZone` бере таймзону
                хоста, і на будь-якому пристрої західніше Києва (UTC включно)
                заголовок показував попередній місяць — тимчасом як сусідні
                «Транзакції» й «Аналітика» показували правильний. Це не глюк на
                межі доби: для таких пристроїв стан постійний. Фінансові періоди
                рахуються в Києві (root AGENTS.md § Domain invariants), тож
                форматувати треба в тій самій зоні, до якої прив'язаний інстант. */}
            Ліміти ·{" "}
            {monthStart.toLocaleDateString("uk-UA", {
              month: "long",
              timeZone: "Europe/Kyiv",
            })}
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
          description="Встанови ліміт витрат на категорію, щоб не виходити за межі бюджету, кнопка нижче."
        />
      )}
      {limitsOpen &&
        limitBudgets.map((b, i) => {
          const categoryId = b.categoryId ?? "";
          const categoryIds = limitBudgetCategoryIds(b);
          const categoryKey = limitBudgetCategoryKey(b);
          const bspent = calcSpent(b);
          const usage = calculateLimitUsage(b, bspent);
          // `getLimitBudgets` normalizes limits into fresh objects, so
          // reference equality (`indexOf`) always returned -1 and made every
          // card enter edit mode at once. Budget ids are the stable identity.
          const globalIdx = budgets.findIndex((budget) => budget.id === b.id);
          const showAdvice = shouldShowProactiveAdvice(usage, null);
          const isEditing = editIdx === globalIdx;
          // `stripLeadingEmoji` лишається рівно для КАСТОМНИХ категорій:
          // вбудовані підписи чисті від емодзі з 2026-08-21, а назву
          // власної категорії людина набирає сама.
          const resolveCatLabel = (id: string) => {
            const meta = resolveExpenseCategoryMeta(id, customCategories);
            return meta?.label ? stripLeadingEmoji(meta.label) : null;
          };
          const catLabel = formatLimitBudgetLabel(b, resolveCatLabel) || "—";
          // Розбивка потрібна лише комбо-картці — не ганяємо другий прохід
          // по транзакціях для одиночних лімітів.
          const breakdown =
            categoryIds.length > 1
              ? calcBreakdown(b).map((row) => ({
                  ...row,
                  label: resolveCatLabel(row.categoryId) || row.categoryId,
                }))
              : undefined;
          const isHighlighted =
            highlightedCategoryId != null &&
            categoryIds.includes(highlightedCategoryId);
          const adviceText = proactiveAdvice[categoryKey];
          const monthKey =
            proactiveItems.find((it) => it.categoryKey === categoryKey)
              ?.monthKey ?? "";
          const dismissedKey = `${monthKey}_${categoryKey}`;
          const isDismissed =
            adviceText && dismissedAdvice[dismissedKey] === adviceText;
          return (
            <div
              key={b.id || i}
              ref={(node) => {
                // Deep-link `?cat=…` адресує КАТЕГОРІЮ, тож комбо-картка
                // реєструється під кожним своїм id — інсайт про «Кафе»
                // доскролить і до комбо «Їжа», що його містить.
                for (const id of categoryIds) {
                  if (node) {
                    limitCardRefs.current.set(id, node);
                  } else {
                    limitCardRefs.current.delete(id);
                  }
                }
              }}
              className={cn(
                "rounded-2xl transition-shadow duration-slow",
                isHighlighted &&
                  "ring-2 ring-finyk/60 ring-offset-2 ring-offset-bg",
              )}
            >
              <LimitBudgetCard
                budget={{
                  id: b.id,
                  type: "limit" as const,
                  categoryId,
                  categoryIds,
                  limit: b.limit,
                  period: b.period ?? "month",
                  ...(b.createdAt ? { createdAt: b.createdAt } : {}),
                }}
                categoryLabel={catLabel}
                customCategories={customCategories ?? []}
                breakdown={breakdown}
                spent={usage.spent}
                pctRaw={usage.pctRaw}
                pctRounded={usage.pctRounded}
                remaining={usage.remaining}
                isEditing={isEditing}
                showProactiveAdvice={showAdvice}
                proactiveLoading={proactiveLoading[categoryKey]}
                proactiveText={isDismissed ? null : adviceText}
                onDismissAdvice={
                  adviceText
                    ? () => {
                        if (monthKey) {
                          dismissAdvice(categoryKey, monthKey, adviceText);
                        }
                      }
                    : undefined
                }
                onBeginEdit={() => {
                  if (globalIdx >= 0) setEditIdx(globalIdx);
                }}
                onChangeLimit={(nextLimit) =>
                  setBudgets((bs) =>
                    bs.map((x, j) =>
                      j === globalIdx ? { ...x, limit: Number(nextLimit) } : x,
                    ),
                  )
                }
                onChangePeriod={(period) =>
                  setBudgets((bs) =>
                    bs.map((x, j) =>
                      j === globalIdx
                        ? {
                            ...x,
                            period,
                            ...(period === "one_time" &&
                            x.type === "limit" &&
                            !x.createdAt
                              ? {
                                  // eslint-disable-next-line no-restricted-syntax -- UTC creation instant; period math converts it to Kyiv boundaries
                                  createdAt: new Date().toISOString(),
                                }
                              : {}),
                          }
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
