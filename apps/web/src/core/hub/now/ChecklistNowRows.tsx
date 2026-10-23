/**
 * Незроблені кроки онбордингу як рядки купи «Зараз» (redesign v3).
 *
 * Last validated: 2026-10-09
 * Status: Active
 */
import type {
  DashboardModuleId,
  ResolvedChecklistStep,
} from "@sergeant/shared";
import {
  openHubModuleWithAction,
  type HubModuleAction,
} from "@shared/lib/modules/hubNav";
import { Button } from "@shared/components/ui/Button";
import { coreMessages } from "@shared/i18n/uk.core";

export interface ChecklistNowProps {
  moduleId: DashboardModuleId;
  steps: readonly ResolvedChecklistStep[];
}

/**
 * Незроблені кроки онбордингу як рядки «Зараз» (мова H): назва 16 / 600,
 * праворуч тиха дія «Відкрити» (redesign v3.1). Підпис кроку сам уже дія
 * («Обрати програму»), тож кнопка його не повторює. Квадратика-чекбокса
 * немає (redesign v3.2, позиція 16): крок закривають дані, не рука, тож
 * закривати тут нічого. Тап лише навігація (F3). Віддає `<li>`,
 * список дає викликач, щоб кроки й пункти купи стояли в одному списку на
 * hairline.
 */
export function ChecklistNowRows({ moduleId, steps }: ChecklistNowProps) {
  return (
    <>
      {steps.map((step) => {
        const action = step.action;
        const label = coreMessages.hub.nowPile.open;
        return (
          <li
            key={step.id}
            data-testid="checklist-now-row"
            className="flex min-h-14 items-center gap-3 py-2"
          >
            <span className="min-w-0 flex-1 text-style-body font-semibold text-text">
              {step.label}
            </span>
            {action && (
              <Button
                variant="text"
                onClick={() =>
                  openHubModuleWithAction(moduleId, action as HubModuleAction)
                }
                aria-label={`${label}: ${step.label}`}
                className="-mr-2 max-w-[45%] shrink-0 text-right"
              >
                {label}
              </Button>
            )}
          </li>
        );
      })}
    </>
  );
}
