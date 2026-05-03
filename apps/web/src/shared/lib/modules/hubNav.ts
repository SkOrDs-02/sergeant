/**
 * Крос-модульна навігація всередині Hub.
 *
 * Замість прокидування `onOpenModule` через дерево кожного модуля — крихітний
 * подієвий шинний канал. Слухач встановлюється в `core/App.jsx` і викликає
 * існуючий `openModule(id, { hash })`. Будь-який глибокий компонент може
 * викликати `openHubModule("finyk", "/analytics")` без додаткових пропсів.
 *
 * Це НЕ замінює існуючі `onOpenModule` пропси (напр. у `RoutineCalendarPanel`) —
 * вони лишаються як є. Це доповнювальний, опційний канал.
 */

import type { ModuleAccent } from "@sergeant/design-tokens";

export const HUB_OPEN_MODULE_EVENT = "hub:open-module";

export type HubModuleId = ModuleAccent;
export type HubModuleAction =
  | "add_expense"
  | "start_workout"
  | "add_meal"
  | "add_meal_photo"
  | "add_habit";

export interface HubOpenModuleDetail {
  module: HubModuleId;
  hash: string;
  action?: HubModuleAction;
}

const VALID_HUB_MODULES = new Set<HubModuleId>([
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
]);

/**
 * Перемкнути активний модуль Hub (з опційним hash для вкладки всередині).
 */
export function openHubModule(moduleId: HubModuleId, hash?: string): void {
  if (!VALID_HUB_MODULES.has(moduleId)) return;
  try {
    window.dispatchEvent(
      new CustomEvent<HubOpenModuleDetail>(HUB_OPEN_MODULE_EVENT, {
        detail: { module: moduleId, hash: hash || "" },
      }),
    );
  } catch {
    /* noop — SSR / disabled CustomEvent */
  }
}

const VALID_HUB_ACTIONS = new Set<HubModuleAction>([
  "add_expense",
  "start_workout",
  "add_meal",
  "add_meal_photo",
  "add_habit",
]);

/**
 * Відкрити модуль із запитом на дію (така ж семантика як у PWA shortcuts).
 * Використовується, напр., для кнопки "Додати витрату" на hub-дашборді.
 */
export function openHubModuleWithAction(
  moduleId: HubModuleId,
  action: HubModuleAction,
): void {
  if (!VALID_HUB_MODULES.has(moduleId)) return;
  if (!VALID_HUB_ACTIONS.has(action)) return;
  try {
    window.dispatchEvent(
      new CustomEvent<HubOpenModuleDetail>(HUB_OPEN_MODULE_EVENT, {
        detail: { module: moduleId, hash: "", action },
      }),
    );
  } catch {
    /* noop */
  }
}
