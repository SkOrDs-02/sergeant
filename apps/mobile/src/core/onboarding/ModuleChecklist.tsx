import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  MODULE_CHECKLISTS,
  deriveChecklistSignals,
  getChecklistState,
  markChecklistStepDone,
  markChecklistSeen,
  dismissChecklist,
  isChecklistVisible,
  isWithinChecklistWindow,
  resolveChecklistStepsFromState,
  type DashboardModuleId,
  hapticTap,
} from "@sergeant/shared";

import { mobileKVStore as mmkvStore } from "@/lib/storage";
import { ANALYTICS_EVENTS, trackEvent } from "@/lib/analytics";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function ModuleChecklist({
  moduleId,
  onAction,
  accountCreatedAt = null,
}: {
  moduleId: DashboardModuleId;
  onAction?: (action: string) => void;
  /**
   * Server-stamped Better Auth `user.createdAt`. Anchors the 7-day FTUX
   * window to the account rather than to this install's MMKV, which a
   * reinstall resets — see `moduleChecklist.ts` for the full rationale.
   */
  accountCreatedAt?: string | null;
}) {
  // Positive-only evidence that a step is already done, read from the
  // quick-stats snapshots. Without it `completedSteps` only ever grows
  // from taps, so the card can never satisfy its own auto-hide.
  const signals = useMemo(
    () => deriveChecklistSignals(mmkvStore, moduleId),
    [moduleId],
  );
  const [visible, setVisible] = useState(() =>
    isChecklistVisible(mmkvStore, moduleId, { signals, accountCreatedAt }),
  );
  const [state, setState] = useState(() =>
    getChecklistState(mmkvStore, moduleId),
  );

  const def = MODULE_CHECKLISTS[moduleId];
  const steps = useMemo(
    () => resolveChecklistStepsFromState(def, state, signals),
    [def, state, signals],
  );
  const completed = steps.filter((step) => step.done).length;
  const total = steps.length;

  // Derived, not state: the session resolves after first paint, so
  // `accountCreatedAt` arrives late and an established account must drop
  // the card the moment it does.
  const shown = visible && isWithinChecklistWindow({ accountCreatedAt });

  // Fire `module_checklist_shown` exactly once per (moduleId × mount).
  // `markChecklistSeen` is idempotent at the storage level but the
  // analytics event is a true "first paint" signal for the funnel —
  // mirroring `apps/web/src/core/onboarding/ModuleChecklist.tsx`.
  const shownFiredRef = useRef(false);
  useEffect(() => {
    if (!shown) return;
    markChecklistSeen(mmkvStore, moduleId);
    if (!shownFiredRef.current) {
      shownFiredRef.current = true;
      trackEvent(ANALYTICS_EVENTS.MODULE_CHECKLIST_SHOWN, { module: moduleId });
    }
  }, [shown, moduleId]);

  const handleStepDone = useCallback(
    (stepId: string) => {
      hapticTap();
      const next = markChecklistStepDone(mmkvStore, moduleId, stepId);
      setState(next);
      // Count over resolved steps so data-proven rows are included —
      // otherwise the last tap never reaches "all done" for a user whose
      // other steps were satisfied by real activity.
      const resolved = resolveChecklistStepsFromState(def, next, signals);
      const completedCount = resolved.filter((step) => step.done).length;
      trackEvent(ANALYTICS_EVENTS.MODULE_CHECKLIST_STEP_DONE, {
        module: moduleId,
        stepId,
        completed: completedCount,
        total: resolved.length,
      });
      if (completedCount >= resolved.length) {
        setVisible(false);
      }
    },
    [moduleId, def, signals],
  );

  const handleDismiss = useCallback(() => {
    dismissChecklist(mmkvStore, moduleId);
    setVisible(false);
    trackEvent(ANALYTICS_EVENTS.MODULE_CHECKLIST_DISMISSED, {
      module: moduleId,
      completed,
      total,
    });
  }, [moduleId, completed, total]);

  if (!shown) return null;

  return (
    <View className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-sm font-bold text-fg">
          {def.title}{" "}
          <Text className="text-xs font-normal text-fg-subtle">
            ({completed}/{total})
          </Text>
        </Text>
        <Pressable
          onPress={handleDismiss}
          hitSlop={12}
          accessibilityLabel="Сховати чекліст"
        >
          <Text className="text-xs text-fg-subtle">✕</Text>
        </Pressable>
      </View>

      <View className="gap-1.5">
        {steps.map((step) => {
          const done = step.done;
          return (
            <Pressable
              key={step.id}
              onPress={() => {
                if (!done) {
                  handleStepDone(step.id);
                  if (step.action) onAction?.(step.action);
                }
              }}
              disabled={done}
              className={cx(
                "flex-row items-center gap-2.5 rounded-xl px-3 py-2",
                !done && "active:opacity-70",
              )}
            >
              <View
                className={cx(
                  "h-5 w-5 items-center justify-center rounded-full border",
                  done
                    ? "border-brand-500 bg-brand-500"
                    : "border-cream-300 bg-white",
                )}
              >
                {done && (
                  <Text className="text-[10px] font-bold text-white">✓</Text>
                )}
              </View>
              <Text
                className={cx(
                  "flex-1 text-sm",
                  done ? "text-fg-subtle line-through" : "text-fg",
                )}
              >
                {step.label}
              </Text>
              {!done && step.action && (
                <Text className="text-xs text-fg-subtle">›</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
