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
import { coreMessages } from "@shared/i18n/uk.core";

export interface ChecklistNowProps {
  moduleId: DashboardModuleId;
  steps: readonly ResolvedChecklistStep[];
}

/**
 * Незроблені кроки онбордингу як рядки «Зараз» (мова H): чекбокс 22 px,
 * назва 16 / 600, праворуч дрібна дія outline. Тап лише навігація (F3):
 * крок закривають дані, не кнопка. Віддає `<li>`, список дає викликач,
 * щоб кроки й пункти купи стояли в одному списку на hairline.
 */
export function ChecklistNowRows({ moduleId, steps }: ChecklistNowProps) {
  return (
    <>
      {steps.map((step) => (
        <li
          key={step.id}
          data-testid="checklist-now-row"
          className="flex min-h-14 items-center gap-3 py-2"
        >
          <span
            aria-hidden
            className="h-[22px] w-[22px] shrink-0 rounded-[5px] border-2 border-control"
          />
          <span className="min-w-0 flex-1 text-style-body font-semibold text-text">
            {step.label}
          </span>
          {step.action && (
            <button
              type="button"
              onClick={() =>
                openHubModuleWithAction(
                  moduleId,
                  step.action as HubModuleAction,
                )
              }
              aria-label={`${coreMessages.hub.nowPile.doIt}: ${step.label}`}
              className="h-9 shrink-0 rounded-[7px] border border-border-strong px-3 text-style-label font-semibold text-text hover:bg-panel focus-ring touch-target"
            >
              {coreMessages.hub.nowPile.doIt}
            </button>
          )}
        </li>
      ))}
    </>
  );
}
