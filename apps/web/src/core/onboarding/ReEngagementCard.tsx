/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useCallback, useEffect } from "react";
import { Button } from "@shared/components/ui/Button";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import { markReengagementShown, pluralDays } from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";
import { coreMessages } from "@shared/i18n/uk.core";

export function ReEngagementCard({
  daysInactive,
  onContinue,
  onDismiss,
}: {
  daysInactive: number;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  // AI-CONTEXT (H1, 2026-09-13): НЕ гейтимо через `useHubBannerSlot`.
  // Ця картка ЗАМІНЮЄ hero (`HubHeroBlock` рендерить її замість
  // TodayFocus/SoftAuth/FirstAction, не поруч), тож вона не має
  // конкурувати за бюджет банерів над нею — раніше на пріоритеті 5 вона
  // програвала `localOnlyData` (0) і `privacyLock` (3) при бюджеті 2,
  // і hero-смуга лишалась порожньою для анонімного юзера з блокуванням
  // застосунку, який повернувся після паузи. Деталі — `bannerBudget.tsx`.
  useEffect(() => {
    markReengagementShown(webKVStore);
    trackEvent(ANALYTICS_EVENTS.REENGAGEMENT_SHOWN, { daysInactive });
  }, [daysInactive]);

  const handleContinue = useCallback(() => {
    trackEvent(ANALYTICS_EVENTS.REENGAGEMENT_CLICKED, { daysInactive });
    onContinue();
  }, [daysInactive, onContinue]);

  return (
    <section
      className="border-y border-line py-3"
      aria-label={coreMessages.onboardingPrompts.returnTitle}
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-style-body font-semibold text-text">
            {coreMessages.onboardingPrompts.returnTitle}
          </h3>
          <p className="text-style-label text-muted">
            {coreMessages.onboardingPrompts.absence} {daysInactive}{" "}
            {pluralDays(daysInactive)}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            tone="neutral"
            size="sm"
            onClick={handleContinue}
          >
            {coreMessages.onboardingPrompts.continue}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
            {coreMessages.actions.later}
          </Button>
        </div>
      </div>
    </section>
  );
}
