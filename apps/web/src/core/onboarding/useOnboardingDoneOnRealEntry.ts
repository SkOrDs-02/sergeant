/**
 * Status: Active
 *
 * Перший справжній запис у модулі закриває онбординг хаба.
 *
 * AI-CONTEXT (прогін `full-2026-11-19`, FULL-20261119-UX-1; рішення
 * власника 2026-11-19: «будь-який перший запис у модулі — причина
 * пропустити онбординг»). Гейт `shouldShowOnboarding()` синхронний і
 * дивиться лише на LS: `hasExistingData` сканує legacy-ключі, які після
 * переїзду в SQLite вже ніхто не пише. Людина, що прийшла глибоким
 * посиланням у модуль і щось записала, на хабі отримувала екран «Модулі».
 * Тут ставимо durable-маркер `ONBOARDING_DONE_KEY`, щойно канонічний
 * лічильник модуля (`realEntryProbe`, warm-cache SQLite) бачить запис.
 *
 * Хук живе в лінивих boot-кластерах модулів, а не в eager-шеллі: лічильник
 * реєструє `sqliteReadBoot` того ж кластера, а eager-бюджет майже вичерпано.
 */
import { useEffect } from "react";
import type { DashboardModuleId } from "@sergeant/shared";
import { onHubBus } from "@shared/lib/modules/hubBus";
import { isOnboardingDone, markOnboardingDone } from "./onboardingGate";
import { webRealEntryProbe } from "./realEntryProbe";

/** `true`, якщо онбординг уже закрито (зараз чи раніше). */
export function markOnboardingDoneIfRealEntry(
  moduleId: DashboardModuleId,
): boolean {
  if (isOnboardingDone()) return true;
  if (webRealEntryProbe(moduleId) <= 0) return false;
  markOnboardingDone();
  return true;
}

export function useOnboardingDoneOnRealEntry(
  moduleId: DashboardModuleId,
): void {
  useEffect(() => {
    if (markOnboardingDoneIfRealEntry(moduleId)) return;
    // Записи модуля й прогрів кеша закінчуються quick-stats-снапшотом, а той
    // шле `storageUpdated` — момент, коли лічильник уже бачить новий запис.
    const off = onHubBus("storageUpdated", () => {
      if (markOnboardingDoneIfRealEntry(moduleId)) off();
    });
    return off;
  }, [moduleId]);
}
