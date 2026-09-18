/**
 * Централізована мапа «primary quick-action» для кожного Hub-модуля.
 *
 * Використовується на dashboard'і (NextCard, ModuleRow, empty-state chips),
 * щоб усі поверхні показували однакові label'и та dispatchали однакові
 * PWA-intent-и через `openHubModuleWithAction`. Не використовуй окремі
 * строки-CTA в UI — бери звідси.
 */

import type { HubModuleAction, HubModuleId } from "./hubNav";

export interface ModulePrimaryAction {
  /** Імперативний label для CTA: «Додати витрату», «Почати тренування», … */
  label: string;
  /** Короткий label для інлайн-чипа у списку модулів. */
  shortLabel: string;
  /** PWA-інтент, який dispatchається через `openHubModuleWithAction`. */
  action: HubModuleAction;
}

export const MODULE_PRIMARY_ACTION: Record<HubModuleId, ModulePrimaryAction> = {
  finyk: {
    label: "Додати витрату",
    shortLabel: "+ Витрата",
    action: "add_expense",
  },
  fizruk: {
    label: "Почати тренування",
    shortLabel: "+ Тренування",
    action: "start_workout",
  },
  routine: {
    label: "Додати звичку",
    shortLabel: "+ Звичка",
    action: "add_habit",
  },
  nutrition: {
    label: "Додати прийом їжі",
    shortLabel: "+ Їжа",
    action: "add_meal",
  },
};

export function getModulePrimaryAction(
  moduleId: string,
): ModulePrimaryAction | null {
  return (
    (MODULE_PRIMARY_ACTION as Record<string, ModulePrimaryAction>)[moduleId] ||
    null
  );
}
