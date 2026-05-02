import { useEffect } from "react";
import { cn } from "@shared/lib/cn";
import { Icon } from "@shared/components/ui/Icon";
import { Button } from "@shared/components/ui/Button";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import { dismissSoftAuth } from "./vibePicks";

/**
 * Inline dashboard card offering cloud sync *after* the user has logged
 * their first real entry. Intentionally not a modal — we never interrupt
 * the user; they can ignore it until they're ready.
 */
export function SoftAuthPromptCard({
  onOpenAuth,
  onDismiss,
  entryCount,
}: {
  onOpenAuth: () => void;
  onDismiss?: () => void;
  entryCount?: number;
}) {
  useEffect(() => {
    trackEvent(ANALYTICS_EVENTS.AUTH_PROMPT_SHOWN, { placement: "dashboard" });
  }, []);

  const handleOpenAuth = () => {
    trackEvent(ANALYTICS_EVENTS.AUTH_AFTER_VALUE);
    onOpenAuth();
  };

  const handleDismiss = () => {
    trackEvent(ANALYTICS_EVENTS.AUTH_PROMPT_DISMISSED);
    dismissSoftAuth();
    onDismiss?.();
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-brand-500/30",
        "bg-gradient-to-br from-brand-500/10 via-panel to-panel p-4",
        "shadow-card",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 shrink-0 rounded-2xl bg-brand-500/15 text-brand-strong dark:text-brand flex items-center justify-center">
          <Icon name="cloud-check" size={20} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">
            Зберегти на всіх пристроях?
          </p>
          <p className="text-xs text-muted mt-1 leading-relaxed">
            {entryCount != null && entryCount > 0
              ? `У тебе ${entryCount} ${entryCount === 1 ? "запис" : entryCount < 5 ? "записи" : "записів"}. Створи акаунт, щоб не втратити.`
              : "Акаунт синхронізує твої дані між телефоном і браузером. 20 секунд."}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <Button
              type="button"
              onClick={handleOpenAuth}
              variant="primary"
              size="sm"
            >
              Створити акаунт
            </Button>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-xs text-muted hover:text-text px-3 py-2 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45"
            >
              Пізніше
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
