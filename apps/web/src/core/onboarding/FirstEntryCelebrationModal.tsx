/**
 * Last validated: 2026-09-06
 * Status: Active
 * Коротке неблокувальне підтвердження першої реальної дії.
 */
import { useCallback, useEffect } from "react";
import {
  type DashboardModuleId,
  getFirstEntryCelebrationCopy,
} from "@sergeant/shared";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { hapticTap } from "@shared/lib/adapters/haptic";
import { ANALYTICS_EVENTS, trackEvent } from "../observability/analytics";
import { messages } from "@shared/i18n/uk";

interface FirstEntryCelebrationModalProps {
  open: boolean;
  onClose: () => void;
  ttvMs: number | null;
  moduleId: DashboardModuleId | null;
}

export function FirstEntryCelebrationModal({
  open,
  onClose,
  ttvMs,
  moduleId,
}: FirstEntryCelebrationModalProps) {
  const copy = getFirstEntryCelebrationCopy(moduleId);
  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    hapticTap();
    trackEvent(ANALYTICS_EVENTS.CELEBRATION_SHOWN, {
      ttvMs,
      source: "first_entry",
      moduleId,
      tipVariant: copy.nextStepTip,
      ctaLabel: copy.primaryCtaLabel,
    });
  }, [copy.nextStepTip, copy.primaryCtaLabel, moduleId, open, ttvMs]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(close, 4_000);
    return () => window.clearTimeout(timer);
  }, [close, open]);

  if (!open) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-x-4 z-100 mx-auto flex max-w-md items-center gap-3",
        "bottom-[calc(var(--bottom-nav-inset,5rem)+1rem)] rounded-xl border border-line bg-panel p-3 shadow-e2",
        "motion-safe:animate-in motion-safe:slide-in-from-bottom-2 motion-safe:fade-in",
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success-soft-fg">
        <Icon name="check" size="sm" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-style-label text-text">{copy.headline}</p>
        <p className="text-style-caption text-muted">{copy.subtext}</p>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label={messages.actions.close}
        className="touch-target shrink-0 rounded-lg text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
      >
        <Icon name="x" size="sm" aria-hidden />
      </button>
    </div>
  );
}
