/**
 * ModuleChecklist — Compact onboarding checklist for each module.
 *
 * Displays 3-4 actionable steps that guide the user from first entry
 * to "aha-moment". State is persisted per-module via localStorage.
 * The checklist auto-hides after 7 days or when all steps completed.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@shared/lib/cn";
import { Icon } from "@shared/components/ui/Icon";
import { AnimatedCheckbox } from "@shared/components/ui/AnimatedCheckbox";
import { hapticTap } from "@shared/lib/haptic";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage";
import { useToast } from "@shared/hooks/useToast";
import {
  MODULE_CHECKLISTS,
  getChecklistState,
  markChecklistSeen,
  dismissChecklist,
  isChecklistVisible,
  saveChecklistState,
  type DashboardModuleId,
  type KVStore,
} from "@sergeant/shared";

const localStorageStore: KVStore = {
  getString(key) {
    return safeReadLS(key);
  },
  setString(key, value) {
    safeWriteLS(key, value);
  },
  remove(key) {
    safeWriteLS(key, null);
  },
};

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
}

export function ModuleChecklist({
  moduleId,
  onAction,
  className,
  compact = false,
}: ModuleChecklistProps) {
  const toast = useToast();
  const [visible, setVisible] = useState(() =>
    isChecklistVisible(localStorageStore, moduleId),
  );
  const [state, setState] = useState(() =>
    getChecklistState(localStorageStore, moduleId),
  );
  const [isCollapsed, setIsCollapsed] = useState(false);

  const def = MODULE_CHECKLISTS[moduleId];
  const styles = MODULE_STYLES[moduleId];

  const completed = useMemo(
    () =>
      state.completedSteps.filter((s) =>
        def.steps.some((step) => step.id === s),
      ).length,
    [state.completedSteps, def.steps],
  );
  const total = def.steps.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  // Mark as seen on first render
  useEffect(() => {
    if (!visible) return;
    markChecklistSeen(localStorageStore, moduleId);
  }, [visible, moduleId]);

  const handleStepDone = useCallback(
    (stepId: string, action?: string) => {
      hapticTap();
      let justCompleted = false;
      setState((previousState) => {
        const persistedState = getChecklistState(localStorageStore, moduleId);
        const previouslyDone =
          persistedState.completedSteps.length >= def.steps.length ||
          previousState.completedSteps.length >= def.steps.length;
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
        if (!previouslyDone && completedSteps.length >= def.steps.length) {
          justCompleted = true;
        }
        return next;
      });

      if (action) {
        onAction?.(action);
      }

      // Celebrate only on the transition to "all done"; auto-hide is handled
      // by the useEffect below so we don't double-fire setTimeout here.
      if (justCompleted) {
        toast.success(`${def.title}: перші кроки виконано! 🎉`, 4000);
      }
    },
    [moduleId, onAction, def.steps.length, def.title, toast],
  );

  useEffect(() => {
    if (visible && completed >= total) {
      const timeout = setTimeout(() => setVisible(false), 600);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [completed, total, visible]);

  const handleDismiss = useCallback(() => {
    hapticTap();
    dismissChecklist(localStorageStore, moduleId);
    setVisible(false);
  }, [moduleId]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "rounded-2xl border overflow-hidden transition-all duration-300",
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
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-inset",
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
            <h3 className="text-sm font-bold text-text truncate">
              {compact ? "Перші кроки" : def.title}
            </h3>
            <p className="text-xs text-muted">
              {completed}/{total} виконано
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
                className={cn("transition-all duration-500", styles.accent)}
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
                "absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums",
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
              "text-muted transition-transform duration-200",
              isCollapsed && "-rotate-90",
            )}
          />
        </div>
      </button>

      {/* Steps list */}
      {!isCollapsed && (
        <div className="px-4 pb-4 space-y-1.5">
          {def.steps.map((step, idx) => {
            const done = state.completedSteps.includes(step.id);
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
                  "transition-all duration-200",
                  done
                    ? "bg-transparent cursor-default"
                    : "bg-panel/60 hover:bg-panel border border-line/50 hover:border-line cursor-pointer",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
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
                    "flex-1 text-sm transition-all duration-200",
                    done ? "text-muted line-through" : "text-text font-medium",
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
              "w-full text-center text-xs text-muted hover:text-text py-2 mt-1",
              "transition-colors focus:outline-none focus-visible:underline",
            )}
          >
            Сховати чекліст
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Hook to check if a module checklist should be visible.
 * Useful for conditional rendering in parent components.
 */
export function useModuleChecklistVisible(
  moduleId: DashboardModuleId,
): boolean {
  const [visible, setVisible] = useState(() =>
    isChecklistVisible(localStorageStore, moduleId),
  );

  useEffect(() => {
    // Re-check on mount in case state changed
    setVisible(isChecklistVisible(localStorageStore, moduleId));
  }, [moduleId]);

  return visible;
}
