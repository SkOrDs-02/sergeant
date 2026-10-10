import { Card } from "@shared/components/ui/Card";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { EmptyState } from "@shared/components/ui/EmptyState";

import { cn } from "@shared/lib/ui/cn";
import {
  calcLimitPace,
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
  /** Той самий «зараз», що й у вікні лімітів: з нього рахується темп (Р8). */
  now: Date;
  limitBudgets: LimitBudget[];
  budgets: Budget[];
  setBudgets: Dispatch<SetStateAction<Budget[]>>;
  /** «Приховати суми» (PR-F3) — прокидається в кожну `LimitBudgetCard`. */
  showBalance?: boolean;
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
  now,
  limitBudgets,
  budgets,
  setBudgets,
  showBalance = true,
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
  // Секція згорнута за замовчуванням, тож перевищення, яке вже бачить
  // Головна хаба, мусить бути видно в самій шапці, а не лише всередині.
  const overCount = limitBudgets.filter(
    (b) => calculateLimitUsage(b, calcSpent(b)).overLimit,
  ).length;
  return (
    <Card padding="none" className="px-4">
      <button
        type="button"
        onClick={toggleLimits}
        aria-expanded={limitsOpen}
        className="w-full flex items-center justify-between gap-3 py-3 text-left bg-panel hover:bg-panel transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <SectionHeading
            as="span"
            size="lg"
            className="mb-0! normal-case tracking-normal"
            variant="text"
          >
            {/* `monthStart` — київська північ 1-го числа (`getCurrentMonthContext`
                → `kyivDayStartMs`), тобто 21:00/22:00 UTC ОСТАННЬОГО дня
                попереднього місяця. Форматування без `timeZone` бере таймзону
                хоста, і на будь-якому пристрої західніше Києва (UTC включно)
                заголовок показував попередній місяць — тимчасом як сусідні
                «Операції» й «Аналітика» показували правильний. Це не глюк на
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
            {overCount > 0 && (
              <span className="ml-1 font-semibold text-danger-strong dark:text-danger">
                · {overCount} перевищено
              </span>
            )}
          </SectionHeading>
        </span>
      </button>
      {limitsOpen && limitBudgets.length === 0 && (
        <EmptyState
          compact
          module="finyk"
          title="Поки немає лімітів"
          description="Встанови ліміт витрат на категорію, щоб не виходити за бюджет."
        />
      )}
      {limitsOpen &&
        limitBudgets.map((b, i) => {
          const categoryId = b.categoryId ?? "";
          const categoryIds = limitBudgetCategoryIds(b);
          const categoryKey = limitBudgetCategoryKey(b);
          const bspent = calcSpent(b);
          const usage = calculateLimitUsage(b, bspent);
          const pace = calcLimitPace(b, bspent, now);
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
                "rounded-xl transition-shadow duration-slow",
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
                showBalance={showBalance}
                breakdown={breakdown}
                forecast={pace.forecast}
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
    </Card>
  );
}
