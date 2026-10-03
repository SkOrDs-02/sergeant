/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useCallback, useEffect } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import { markReengagementShown, pluralDays } from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";

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
    <Card
      as="section"
      radius="lg"
      padding="lg"
      className="relative overflow-hidden"
      aria-label="Повернення"
    >
      <div className="flex flex-col items-center text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-brand-500/10 text-brand-strong flex items-center justify-center">
          <Icon name="hand-wave" size="xl" />
        </div>
        <div className="space-y-1">
          <h3 className="text-style-title text-text">Давно не бачились!</h3>
          <p className="text-style-body text-muted leading-relaxed max-w-xs">
            Тебе не було {daysInactive} {pluralDays(daysInactive)}. Все
            збережено, продовжуй звідки зупинився.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="solid" size="sm" onClick={handleContinue}>
            Продовжити
            <Icon name="chevron-right" size="sm" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
            Пізніше
          </Button>
        </div>
      </div>
    </Card>
  );
}
