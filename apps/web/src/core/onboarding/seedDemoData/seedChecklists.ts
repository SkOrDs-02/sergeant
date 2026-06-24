// Demo checklists: mark every module's FTUX "Перші кроки" checklist as
// fully completed. The demo payload portrays a ~14-day-active user, so
// the new-user onboarding checklists ("Додати першу витрату", "Створити
// першу звичку", …) must not show — otherwise the hub contradicts
// itself: rich history above, "0/4 перші кроки" below.
//
// Writes go through the shared `saveChecklistState` so the storage key
// (`<moduleId>_checklist_v1`) and shape stay in lockstep with the reader
// in `ModuleChecklist.tsx`. `completedSteps === steps` makes
// `isChecklistVisible()` return false; `firstSeenAt` is back-dated for
// realism even though the completed-count alone already hides it.

import {
  MODULE_CHECKLISTS,
  saveChecklistState,
  type DashboardModuleId,
} from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";
import { daysAgo, toISO } from "./utils";

export function seedChecklists(): void {
  const firstSeenAt = toISO(daysAgo(14));
  for (const moduleId of Object.keys(
    MODULE_CHECKLISTS,
  ) as DashboardModuleId[]) {
    const def = MODULE_CHECKLISTS[moduleId];
    saveChecklistState(webKVStore, moduleId, {
      completedSteps: def.steps.map((step) => step.id),
      dismissed: false,
      firstSeenAt,
    });
  }
}
