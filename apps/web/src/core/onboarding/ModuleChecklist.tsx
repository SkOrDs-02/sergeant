/**
 * Last validated: 2026-08-07
 * Status: Active
 */
/**
 * ModuleChecklist — Compact onboarding checklist for each module.
 *
 * Displays 3-4 actionable steps that guide the user from first entry
 * to "aha-moment". The checklist auto-hides after 7 account-days or
 * once every step is done.
 *
 * AI-CONTEXT: a step is done when real data proves it OR the user
 * tapped the row. The data half (`deriveChecklistSignals` +
 * `useChecklistSignals`) is what makes the card able to close itself —
 * before it existed, `completedSteps` was tap-only and a user who had
 * genuinely added expenses and connected a bank still saw "0/4".
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { AnimatedCheckbox } from "@shared/components/ui/AnimatedCheckbox";
import { hapticTap } from "@shared/lib/adapters/haptic";
import { webKVStore as localStorageStore } from "@shared/lib/storage/storage";
import { useToast } from "@shared/hooks/useToast";
import {
  MODULE_CHECKLISTS,
  getChecklistState,
  markChecklistSeen,
  dismissChecklist,
  isChecklistVisible,
  isWithinChecklistWindow,
  resolveChecklistSteps,
  resolveChecklistStepsFromState,
  saveChecklistState,
  type DashboardModuleId,
} from "@sergeant/shared";
import { ANALYTICS_EVENTS, trackEvent } from "../observability/analytics";
import { messages } from "@shared/i18n/uk";
import { useChecklistSignals } from "./useChecklistSignals";

const MODULE_STYLES: Record<
  DashboardModuleId,
  { accent: string; bg: string; border: string; checkBg: string }
> = {
  finyk: {
    accent: "text-finyk",
    bg: "bg-finyk-soft/50 dark:bg-finyk/8",
    border: "border-finyk/20",
    checkBg: "bg-finyk",
  },
  fizruk: {
    accent: "text-fizruk",
    bg: "bg-fizruk-soft/50 dark:bg-fizruk/8",
    border: "border-fizruk/20",
    checkBg: "bg-fizruk",
  },
  routine: {
    accent: "text-routine",
    bg: "bg-routine-surface/50 dark:bg-routine/8",
    border: "border-routine/20",
    checkBg: "bg-routine",
  },
  nutrition: {
    accent: "text-nutrition",
    bg: "bg-nutrition-soft/50 dark:bg-nutrition/8",
    border: "border-nutrition/20",
    checkBg: "bg-nutrition",
  },
};

export interface ModuleChecklistProps {
  moduleId: DashboardModuleId;
  /** Called when user taps a step with an action hint */
  onAction?: (action: string) => void;
  /** Optional class name */
  className?: string;
  /** Compact variant for tighter spaces */
  compact?: boolean;
  /**
   * Server-stamped Better Auth `user.createdAt`. Anchors the 7-day FTUX
   * window to the account instead of to this device's localStorage.
   */
  accountCreatedAt?: string | null;
}

export function ModuleChecklist({
  moduleId,
  onAction,
  className,
  compact = false,
  accountCreatedAt = null,
}: ModuleChecklistProps) {
  const toast = useToast();
  const signals = useChecklistSignals(moduleId);
  const [state, setState] = useState(() =>
    getChecklistState(localStorageStore, moduleId),
  );
  const [isCollapsed, setIsCollapsed] = useState(false);

  const def = MODULE_CHECKLISTS[moduleId];
  const styles = MODULE_STYLES[moduleId];

  const steps = useMemo(
    () => resolveChecklistStepsFromState(def, state, signals),
    [def, state, signals],
  );

  const completed = steps.filter((step) => step.done).length;
  const total = steps.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  const [visible, setVisible] = useState(() =>
    isChecklistVisible(localStorageStore, moduleId, {
      signals,
      accountCreatedAt,
    }),
  );

  // Derived, not state: the session resolves after first paint, so
  // `accountCreatedAt` arrives as `null` and turns into a real timestamp
  // a tick later. An established account has to drop the card the moment
  // it does. Completion keeps its own delayed auto-hide below so the
  // exit animation survives.
  const shown = visible && isWithinChecklistWindow({ accountCreatedAt });

  // Mark as seen on first render. Fire `module_checklist_shown` exactly
  // once per (moduleId × mount) — `markChecklistSeen` is idempotent at
  // the storage level but the analytics event is a true "first paint"
  // signal for the funnel, so we tie it to the first time the effect
  // fires for this module.
  useEffect(() => {
    if (!shown) return;
    markChecklistSeen(localStorageStore, moduleId);
    trackEvent(ANALYTICS_EVENTS.MODULE_CHECKLIST_SHOWN, { module: moduleId });
  }, [shown, moduleId]);

  const handleStepDone = useCallback(
    (stepId: string, action?: string) => {
      hapticTap();
      // Completion is counted over the *resolved* steps, so a tap that
      // fills the last gap next to data-proven rows still celebrates —
      // and a card already complete by data never re-celebrates.
      const doneBefore = resolveChecklistSteps(
        localStorageStore,
        moduleId,
        signals,
      ).every((step) => step.done);

      setState((previousState) => {
        const persistedState = getChecklistState(localStorageStore, moduleId);
        const completedSteps = Array.from(
          new Set([
            ...persistedState.completedSteps,
            ...previousState.completedSteps,
            stepId,
          ]),
        );
        const next = {
          completedSteps,
          dismissed: persistedState.dismissed || previousState.dismissed,
          firstSeenAt: previousState.firstSeenAt ?? persistedState.firstSeenAt,
        };
        saveChecklistState(localStorageStore, moduleId, next);
        return next;
      });

      if (action) {
        onAction?.(action);
      }

      const resolvedAfter = resolveChecklistSteps(
        localStorageStore,
        moduleId,
        signals,
      );
      const total = resolvedAfter.length;
      const completed = resolvedAfter.filter((step) => step.done).length;
      trackEvent(ANALYTICS_EVENTS.MODULE_CHECKLIST_STEP_DONE, {
        module: moduleId,
        stepId,
        completed,
        total,
      });

      // Celebrate only on the transition to "all done"; auto-hide is handled
      // by the useEffect below so we don't double-fire setTimeout here.
      if (!doneBefore && completed >= total) {
        toast.success(`${def.title}: перші кроки виконано!`, 4000);
      }
    },
    [moduleId, onAction, signals, def.title, toast],
  );

  useEffect(() => {
    if (shown && completed >= total) {
      const timeout = setTimeout(() => setVisible(false), 600);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [completed, total, shown]);

  const handleDismiss = useCallback(() => {
    hapticTap();
    dismissChecklist(localStorageStore, moduleId);
    setVisible(false);
    trackEvent(ANALYTICS_EVENTS.MODULE_CHECKLIST_DISMISSED, {
      module: moduleId,
      completed,
      total,
    });
  }, [moduleId, completed, total]);

  if (!shown) return null;

  return (
    <div
      className={cn(
        "rounded-2xl border overflow-hidden transition-all duration-slow",
        styles.bg,
        styles.border,
        className,
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsCollapsed((v) => !v)}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-4 py-3",
          "hover:bg-black/5 dark:hover:bg-white/5 transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-inset",
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
              styles.bg,
              styles.accent,
            )}
          >
            <Icon name="list-checks" size={16} strokeWidth={2} />
          </div>
          <div className="min-w-0 text-left">
            <h3 className="text-style-title text-text truncate">
              {compact ? "Перші кроки" : def.title}
            </h3>
            <p className="text-style-caption text-muted">
              {completed}/{total} {messages.status.doneLowercase}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Progress ring */}
          <div className="relative w-8 h-8">
            <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
              <circle
                cx="16"
                cy="16"
                r="12"
                fill="none"
                className="stroke-line"
                strokeWidth="3"
              />
              <circle
                cx="16"
                cy="16"
                r="12"
                fill="none"
                className={cn("transition-all duration-slower", styles.accent)}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${progress * 0.754} 100`}
                style={{
                  stroke: "currentColor",
                }}
              />
            </svg>
            <span
              className={cn(
                "absolute inset-0 flex items-center justify-center text-style-caption font-bold tabular-nums",
                styles.accent,
              )}
            >
              {completed}
            </span>
          </div>

          <Icon
            name="chevron-down"
            size={16}
            className={cn(
              "text-muted transition-transform duration-base",
              isCollapsed && "-rotate-90",
            )}
          />
        </div>
      </button>

      {/* Steps list */}
      {!isCollapsed && (
        <div className="px-4 pb-4 space-y-1.5">
          {steps.map((step, idx) => {
            const done = step.done;
            return (
              <button
                key={step.id}
                type="button"
                role="checkbox"
                aria-checked={done}
                aria-label={step.label}
                disabled={done}
                onClick={() => {
                  if (done) return;
                  handleStepDone(step.id, step.action);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left",
                  "transition-all duration-base",
                  done
                    ? "bg-transparent cursor-default"
                    : "bg-panel/60 hover:bg-panel border border-line/50 hover:border-line cursor-pointer",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
                  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1",
                )}
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <AnimatedCheckbox
                  decorative
                  checked={done}
                  size="sm"
                  className={cn(done && styles.checkBg)}
                />
                <span
                  className={cn(
                    "flex-1 text-style-label transition-all duration-base",
                    done ? "text-muted line-through" : "text-text",
                  )}
                >
                  {step.label}
                </span>
                {!done && step.action && (
                  <Icon
                    name="chevron-right"
                    size={14}
                    className="text-muted shrink-0"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}

          {/* Dismiss link */}
          <button
            type="button"
            onClick={handleDismiss}
            className={cn(
              "w-full text-center text-style-label text-muted hover:text-text py-2 mt-1",
              "transition-colors focus:outline-none focus-visible:underline",
            )}
          >
            {messages.onboarding.hideChecklist}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Hook to check if a module checklist should be visible.
 * Useful for conditional rendering in parent components.
 *
 * Resolves against the same real-data signals the card itself uses, so
 * a caller never reserves space for a checklist the data has already
 * retired.
 */
export function useModuleChecklistVisible(
  moduleId: DashboardModuleId,
  accountCreatedAt: string | null = null,
): boolean {
  const signals = useChecklistSignals(moduleId);
  return isChecklistVisible(localStorageStore, moduleId, {
    signals,
    accountCreatedAt,
  });
}
