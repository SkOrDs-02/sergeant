import { useCallback, useEffect } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { Button } from "@shared/components/ui/Button";
import { Popover, PopoverItem } from "@shared/components/ui/Popover";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import {
  dismissNudge,
  snoozeNudge,
  type NudgeDefinition,
} from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";

const SNOOZE_DAYS = 7;

export function DailyNudge({
  nudge,
  sessionDays,
  onDismiss,
  onAction,
}: {
  nudge: NudgeDefinition;
  sessionDays: number;
  onDismiss: () => void;
  onAction?: () => void;
}) {
  useEffect(() => {
    trackEvent(ANALYTICS_EVENTS.DAILY_NUDGE_SHOWN, {
      day: sessionDays,
      nudgeId: nudge.id,
    });
  }, [nudge.id, sessionDays]);

  const handlePrimary = useCallback(() => {
    dismissNudge(webKVStore, nudge.id);
    trackEvent(ANALYTICS_EVENTS.DAILY_NUDGE_ACTION, {
      day: sessionDays,
      nudgeId: nudge.id,
      type: "primary",
    });
    onAction?.();
    onDismiss();
  }, [nudge.id, sessionDays, onAction, onDismiss]);

  const handleDismiss = useCallback(() => {
    dismissNudge(webKVStore, nudge.id);
    trackEvent(ANALYTICS_EVENTS.DAILY_NUDGE_ACTION, {
      day: sessionDays,
      nudgeId: nudge.id,
      type: "dismiss",
    });
    onDismiss();
  }, [nudge.id, sessionDays, onDismiss]);

  const handleSnooze = useCallback(() => {
    snoozeNudge(webKVStore, nudge.id, SNOOZE_DAYS);
    trackEvent(ANALYTICS_EVENTS.DAILY_NUDGE_ACTION, {
      day: sessionDays,
      nudgeId: nudge.id,
      type: "snooze",
      snoozeDays: SNOOZE_DAYS,
    });
    onDismiss();
  }, [nudge.id, sessionDays, onDismiss]);

  return (
    <section
      className="relative bg-panel border border-brand-500/20 rounded-2xl p-4 shadow-card"
      aria-label="Щоденна порада"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-9 h-9 rounded-xl bg-brand-500/10 text-brand-strong dark:text-brand flex items-center justify-center">
          <Icon name="sparkle" size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text leading-relaxed">{nudge.message}</p>
          <div className="flex items-center gap-2 mt-2.5">
            {onAction && (
              <Button variant="primary" size="xs" onClick={handlePrimary}>
                Спробувати
              </Button>
            )}
            <Popover
              placement="bottom-start"
              trigger={
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-muted hover:text-text hover:bg-panelHi transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45"
                  aria-label="Інші дії"
                >
                  <Icon name="more-horizontal" size={16} />
                </button>
              }
              className="min-w-[200px]"
            >
              <PopoverItem
                icon={<Icon name="clock" size={14} />}
                onClick={handleSnooze}
              >
                Нагадай за тиждень
              </PopoverItem>
            </Popover>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 -mt-1 -mr-1 w-6 h-6 rounded-xl flex items-center justify-center text-muted hover:text-text transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45"
          aria-label="Закрити"
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </section>
  );
}
