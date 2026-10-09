/**
 * Купа «Закрито сьогодні» — друга купа осі дії (A1, спека
 * `hub-action-axis.md`). Одне твердження на активний модуль, ≤4 рядки;
 * правило «закрито» — у `closedToday.ts`. Порожня купа не рендериться:
 * «закрито 0» — це не стан, а відсутність.
 *
 * Тап по рядку відкриває модуль через проп із головної (джерело
 * `hub_dashboard`): рядок — не двері (двері — рейок), а твердження, яке
 * можна перевірити.
 *
 * Last validated: 2026-09-17
 * Status: Active
 */
import { useMemo } from "react";
import type { DashboardModuleId } from "@sergeant/shared";
import { cn } from "@shared/lib/ui/cn";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Icon } from "@shared/components/ui/Icon";
import { coreMessages } from "@shared/i18n/uk.core";
import { computeClosedToday } from "./closedToday";
import { usePublishHubDayCount } from "./hubDayCounts";
import type { ChecklistNowProps } from "./ChecklistNowRows";
import type { Rec } from "../../lib/recommendationEngine";

// Приглушене чорнило модуля на кремовій панелі — той самий вибір `-strong`
// у світлій темі, що й у `PILL_ACCENT` (`dashboardCards.tsx`).
const MODULE_INK: Record<DashboardModuleId, string> = {
  finyk: "text-finyk-strong dark:text-finyk",
  fizruk: "text-fizruk-strong dark:text-fizruk-300",
  routine: "text-routine-strong dark:text-routine",
  nutrition: "text-nutrition-strong dark:text-nutrition",
};

export interface ClosedTodayPileProps {
  activeModules: readonly string[];
  recs: readonly Rec[];
  onOpenModule: (module: string) => void;
  /** Тік сховища з батька — перерахувати після запису в модулі. */
  storageBump?: number | undefined;
  /** Зроблені кроки онбордингу: рядки «Закрито», поки триває вікно. */
  checklistDone?: ChecklistNowProps | undefined;
}

export function ClosedTodayPile({
  activeModules,
  recs,
  onOpenModule,
  storageBump,
  checklistDone,
}: ClosedTodayPileProps) {
  const items = useMemo(() => {
    void storageBump; // storage-write tick — перерахувати після запису
    return computeClosedToday({ activeModules, recs });
  }, [activeModules, recs, storageBump]);
  const doneSteps = checklistDone?.steps ?? [];
  usePublishHubDayCount("closed", items.length + doneSteps.length);
  if (items.length === 0 && doneSteps.length === 0) return null;

  return (
    <section aria-labelledby="closed-pile-heading" className="space-y-2">
      <div className="flex items-baseline justify-between px-0.5">
        <SectionHeading
          as="h2"
          id="closed-pile-heading"
          size="xs"
          variant="muted"
        >
          {coreMessages.hub.closedPile.heading}
        </SectionHeading>
        <span className="text-style-caption font-bold text-muted" aria-hidden>
          {items.length + doneSteps.length}
        </span>
      </div>
      <ul className="space-y-1.5">
        {checklistDone &&
          doneSteps.map((step) => (
            <li
              key={step.id}
              data-testid="closed-checklist-row"
              className="flex items-center gap-3 px-3 py-2"
            >
              <Icon
                name="check"
                size="sm"
                strokeWidth={2.5}
                className={cn("shrink-0", MODULE_INK[checklistDone.moduleId])}
                aria-hidden
              />
              <span className="flex-1 min-w-0 text-style-label text-text leading-snug">
                {step.label}
              </span>
            </li>
          ))}
        {items.map((item) => (
          <li key={item.module}>
            <button
              type="button"
              data-testid="closed-row"
              onClick={() => onOpenModule(item.module)}
              className={cn(
                "w-full flex items-center gap-3 rounded-xl border border-line bg-bg px-3 py-2 text-left touch-target",
                "hover:bg-panelHi transition-colors focus-ring",
              )}
            >
              <Icon
                name="check"
                size="sm"
                strokeWidth={2.5}
                className={cn("shrink-0", MODULE_INK[item.module])}
                aria-hidden
              />
              <span className="flex-1 min-w-0">
                <span className="block text-style-label text-text leading-snug">
                  {item.label}
                </span>
                <span className="block text-style-caption text-muted leading-snug">
                  {item.statement}
                </span>
              </span>
              {item.value && (
                <span
                  className={cn(
                    "shrink-0 text-style-label font-bold tabular-nums",
                    MODULE_INK[item.module],
                  )}
                >
                  {item.value}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
