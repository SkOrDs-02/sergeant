import { useCallback, useEffect } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { Button } from "@shared/components/ui/Button";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import { markReengagementShown } from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage";

export function ReEngagementCard({
  daysInactive,
  onContinue,
  onDismiss,
}: {
  daysInactive: number;
  onContinue: () => void;
  onDismiss: () => void;
}) {
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
      className="relative bg-panel border border-line rounded-2xl p-5 shadow-card overflow-hidden"
      aria-label="Повернення"
    >
      <div className="flex flex-col items-center text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-brand-500/10 text-brand-strong dark:text-brand flex items-center justify-center">
          <Icon name="hand-wave" size={24} />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-text">Давно не бачились!</h3>
          <p className="text-xs text-muted leading-relaxed max-w-xs">
            Ти був відсутній {daysInactive}{" "}
            {daysInactive === 1 ? "день" : daysInactive < 5 ? "дні" : "днів"}.
            Все збережено — продовжуй звідки зупинився.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={handleContinue}>
            Продовжити
            <Icon name="chevron-right" size={14} />
          </Button>
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-muted hover:text-text px-3 py-2 rounded-xl transition-colors"
          >
            Пізніше
          </button>
        </div>
      </div>
    </section>
  );
}
