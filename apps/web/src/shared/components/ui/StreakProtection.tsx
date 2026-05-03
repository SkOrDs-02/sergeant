import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/ui/cn";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { hapticWarning } from "../../lib/adapters/haptic";
import { safeReadStringLS, safeWriteLS } from "../../lib/storage/storage";

const STREAK_FREEZE_KEY = "sergeant_streak_freeze_v1";
const STREAK_WARNING_DISMISSED_KEY = "sergeant_streak_warning_dismissed_v1";

export interface StreakProtectionProps {
  /** Current streak count */
  streak: number;
  /** Habit name for context */
  habitName: string;
  /** Hours until streak resets (based on habit frequency) */
  hoursUntilReset: number;
  /** Called when user uses a freeze */
  onUseFreeze?: () => void;
  /** Called when user dismisses the warning */
  onDismiss?: () => void;
  /** Whether streak protection is enabled in settings */
  enabled?: boolean;
}

interface FreezeState {
  available: number;
  lastUsed: string | null;
}

function readFreezeState(): FreezeState {
  try {
    const raw = safeReadStringLS(STREAK_FREEZE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    /* ignore */
  }
  return { available: 3, lastUsed: null }; // Start with 3 free freezes
}

function saveFreezeState(state: FreezeState): void {
  safeWriteLS(STREAK_FREEZE_KEY, JSON.stringify(state));
}

function isDismissedToday(habitId: string): boolean {
  const key = `${STREAK_WARNING_DISMISSED_KEY}_${habitId}`;
  const dismissed = safeReadStringLS(key);
  if (!dismissed) return false;

  const today = new Date().toISOString().split("T")[0];
  return dismissed === today;
}

function dismissForToday(habitId: string): void {
  const key = `${STREAK_WARNING_DISMISSED_KEY}_${habitId}`;
  const today = new Date().toISOString().split("T")[0];
  safeWriteLS(key, today);
}

export function StreakProtection({
  streak,
  habitName,
  hoursUntilReset,
  onUseFreeze,
  onDismiss,
  enabled = true,
}: StreakProtectionProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [freezeState, setFreezeState] = useState<FreezeState>(readFreezeState);

  // Show warning if streak is at risk and not dismissed
  useEffect(() => {
    if (!enabled || streak < 3 || hoursUntilReset > 4) {
      setIsVisible(false);
      return;
    }

    // Generate a simple ID from habit name
    const habitId = habitName.toLowerCase().replace(/\s+/g, "-");

    if (isDismissedToday(habitId)) {
      setIsVisible(false);
      return;
    }

    setIsVisible(true);
    hapticWarning();
  }, [enabled, streak, hoursUntilReset, habitName]);

  const handleUseFreeze = useCallback(() => {
    if (freezeState.available <= 0) return;

    const newState = {
      available: freezeState.available - 1,
      lastUsed: new Date().toISOString(),
    };
    setFreezeState(newState);
    saveFreezeState(newState);
    setIsVisible(false);
    onUseFreeze?.();
  }, [freezeState, onUseFreeze]);

  const handleDismiss = useCallback(() => {
    const habitId = habitName.toLowerCase().replace(/\s+/g, "-");
    dismissForToday(habitId);
    setIsVisible(false);
    onDismiss?.();
  }, [habitName, onDismiss]);

  if (!isVisible) return null;

  const urgencyLevel =
    hoursUntilReset <= 1
      ? "critical"
      : hoursUntilReset <= 2
        ? "warning"
        : "info";

  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 z-50 p-4 pb-safe"
      role="alert"
      aria-live="assertive"
    >
      <div
        className={cn(
          "max-w-md mx-auto p-4 rounded-2xl shadow-float",
          "animate-in slide-in-from-bottom duration-300",
          urgencyLevel === "critical" &&
            "bg-danger-soft border border-danger/20",
          urgencyLevel === "warning" &&
            "bg-warning-soft border border-warning/20",
          urgencyLevel === "info" && "bg-panel border border-line",
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
              urgencyLevel === "critical" && "bg-danger/20 text-danger",
              urgencyLevel === "warning" && "bg-warning/20 text-warning",
              urgencyLevel === "info" && "bg-accent/20 text-accent",
            )}
          >
            <Icon name="flame" size={20} />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-style-label text-text">
              {urgencyLevel === "critical"
                ? "Streak в небезпеці!"
                : "Не забудь про звичку"}
            </h3>
            <p className="text-xs text-muted mt-1">
              <strong>{habitName}</strong>: {streak}-денний streak закінчиться
              через{" "}
              {hoursUntilReset < 1
                ? "менше години"
                : `${Math.round(hoursUntilReset)} год`}
            </p>

            {freezeState.available > 0 && (
              <p className="text-xs text-subtle mt-2">
                Залишилось заморозок: {freezeState.available}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 rounded-xl text-muted hover:text-text hover:bg-surface transition-colors"
            aria-label="Закрити"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="flex gap-2 mt-3">
          {freezeState.available > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleUseFreeze}
              className="flex-1"
            >
              <Icon name="snowflake" size={14} className="mr-1.5" />
              Заморозити
            </Button>
          )}
          <Button
            variant="routine"
            size="sm"
            onClick={handleDismiss}
            className="flex-1"
          >
            <Icon name="check" size={14} className="mr-1.5" />
            Піду виконаю
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Hook to check if any habit streak is at risk
 */
export function useStreakRiskCheck(
  habits: Array<{
    name: string;
    streak: number;
    lastCompletedAt?: string | null;
    frequency?: "daily" | "weekly";
  }>,
): { atRisk: (typeof habits)[0] | null; hoursUntilReset: number } {
  const now = new Date();

  for (const habit of habits) {
    if (habit.streak < 3) continue; // Only warn for meaningful streaks

    const lastCompleted = habit.lastCompletedAt
      ? new Date(habit.lastCompletedAt)
      : null;

    if (!lastCompleted) continue;

    const frequency = habit.frequency || "daily";
    const resetHours = frequency === "daily" ? 24 : 168; // 24h or 7 days
    const hoursSinceCompletion =
      (now.getTime() - lastCompleted.getTime()) / (1000 * 60 * 60);
    const hoursUntilReset = resetHours - hoursSinceCompletion;

    // Warn if less than 4 hours until reset
    if (hoursUntilReset > 0 && hoursUntilReset <= 4) {
      return { atRisk: habit, hoursUntilReset };
    }
  }

  return { atRisk: null, hoursUntilReset: 0 };
}
