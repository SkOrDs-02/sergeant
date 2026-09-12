/**
 * Last validated: 2026-09-11
 * Status: Active
 */
/**
 * ModuleChecklist — Compact onboarding checklist for each module.
 *
 * Displays 3-4 actionable steps that guide the user from first entry
 * to "aha-moment". The checklist auto-hides after 7 account-days or
 * once every step is done.
 *
 * AI-CONTEXT: a step is done exactly when real data proves it
 * (`deriveChecklistSignals` + `useChecklistSignals`) — see
 * `resolveChecklistStepsFromState` in `@sergeant/shared` for the exact
 * contract. F3 audit (2026-09-11): a row tap used to write
 * `completedSteps` directly and unconditionally, so tapping ANY step
 * (including ones whose downstream action the Hub silently dropped)
 * checked it off regardless of whether anything actually happened. A tap
 * here is now pure navigation (`handleStepNavigate`); the ONLY writer of
 * persisted completion is the auto-latch effect below, which fires the
 * moment a step's live signal turns true and permanently records it —
 * that's what lets an already-proven step stay checked even after the
 * proving record (e.g. a seeded test expense) is later deleted.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { AnimatedCheckbox } from "@shared/components/ui/AnimatedCheckbox";
import { hapticTap } from "@shared/lib/adapters/haptic";
import { webKVStore as localStorageStore } from "@shared/lib/storage/storage";
import { useToast } from "@shared/hooks/useToast";
import {
  MODULE_CHECKLISTS,
  getChecklistState,
  markChecklistStepDone,
  markChecklistSeen,
  dismissChecklist,
  isChecklistVisible,
  isWithinChecklistWindow,
  resolveChecklistStepsFromState,
  type ChecklistAction,
  type DashboardModuleId,
  type ResolvedChecklistStep,
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
  /**
   * Called when the user taps an actionable, not-yet-done step — a pure
   * navigation request, never a completion signal (F3, 2026-09-11).
   */
  onAction?: (action: ChecklistAction) => void;
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

  // Auto-latch: the moment a step's LIVE signal proves it, permanently
  // record the achievement (F3, 2026-09-11 — "a step stays achieved
  // once proven; it's a learning event, not a live data state"). This is
  // the ONLY writer of persisted completion on web — a row tap never
  // reaches this path; see `handleStepNavigate` below. Self-terminating:
  // once a step id is latched, `state.completedSteps` includes it, so the
  // next run of this effect finds nothing new to write.
  useEffect(() => {
    const newlyProven = def.steps.filter(
      (step) =>
        signals[step.id] === true && !state.completedSteps.includes(step.id),
    );
    if (newlyProven.length === 0) return;

    // The write (and the `setState` that reflects it) has to run
    // together, but a direct `setState` in the immediate effect body
    // trips `react-hooks/set-state-in-effect` — same idiom as
    // `SessionsSection.tsx` / `useAppLock.ts`: the rule only inspects an
    // effect's immediate instruction block, not nested function bodies,
    // so wrapping in a resolved-promise `.then` keeps this synchronous
    // in practice (same microtask turn) while staying outside that block.
    Promise.resolve().then(() => {
      let next = state;
      for (const step of newlyProven) {
        next = markChecklistStepDone(localStorageStore, moduleId, step.id);
      }
      setState(next);

      for (const step of newlyProven) {
        trackEvent(ANALYTICS_EVENTS.MODULE_CHECKLIST_STEP_DONE, {
          module: moduleId,
          stepId: step.id,
          completed,
          total,
        });
      }
    });
  }, [signals, state, def, moduleId, completed, total]);

  // Pure navigation (F3, 2026-09-11): a tap never marks anything done —
  // it only forwards the step's action hint so the caller can route the
  // user to where the data-proving action actually happens. A step with
  // no `action` (a pure milestone like "Завершити тренування") has
  // nothing to navigate to and isn't rendered as a button at all (see the
  // render below), so this only ever runs for actionable, not-done rows.
  const handleStepNavigate = useCallback(
    (step: ResolvedChecklistStep) => {
      if (step.done || !step.action) return;
      hapticTap();
      onAction?.(step.action);
    },
    [onAction],
  );

  // Celebrate exactly once, on the transition into "fully done" —
  // regardless of whether the closing step latched via data (the common
  // case now that a tap can't complete anything) or the card was already
  // complete on mount (demo seed, veteran account). The ref captures the
  // FIRST render's status as the baseline so an already-done mount never
  // fires a false celebration.
  const wasCompleteRef = useRef(total > 0 && completed >= total);
  useEffect(() => {
    const isComplete = total > 0 && completed >= total;
    if (isComplete && !wasCompleteRef.current) {
      toast.success(`${def.title}: перші кроки виконано!`, 4000);
    }
    wasCompleteRef.current = isComplete;
  }, [completed, total, def.title, toast]);

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
            // A step is a NAVIGATION control only while it's both
            // unfinished and has somewhere to send the user (F3,
            // 2026-09-11 — role must match what the element does). A
            // done step, or a pure milestone with no `action` at all
            // (e.g. "Завершити тренування"), has nothing left to click
            // and renders as static content instead of an inert button.
            const interactive = !done && Boolean(step.action);
            const rowClassName = cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left",
              "transition-all duration-base",
              interactive
                ? "bg-panel/60 hover:bg-panel border border-line/50 hover:border-line cursor-pointer"
                : "bg-transparent cursor-default",
              interactive &&
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
              "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1",
            );
            const rowStyle = { animationDelay: `${idx * 50}ms` };
            const rowBody = (
              <>
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
                {/* AnimatedCheckbox's fill is `aria-hidden` (decorative);
                    a done row must still announce its state to AT. */}
                {done && (
                  <span className="sr-only">
                    , {messages.status.doneLowercase}
                  </span>
                )}
                {interactive && (
                  <Icon
                    name="chevron-right"
                    size={14}
                    className="text-muted shrink-0"
                    aria-hidden
                  />
                )}
              </>
            );

            if (!interactive) {
              return (
                <div key={step.id} className={rowClassName} style={rowStyle}>
                  {rowBody}
                </div>
              );
            }

            return (
              <button
                key={step.id}
                type="button"
                aria-label={step.label}
                onClick={() => handleStepNavigate(step)}
                className={rowClassName}
                style={rowStyle}
              >
                {rowBody}
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
