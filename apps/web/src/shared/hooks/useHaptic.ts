/**
 * useHaptic -- Web haptic feedback hook with celebration patterns.
 *
 * Mirrors the mobile `useHaptic()` API from `apps/mobile/src/lib/haptic.ts`
 * so components can call the same methods on both platforms.
 *
 * On platforms without `navigator.vibrate` (iOS Safari, desktop) all methods
 * are safe no-ops. On Android Chrome (and other Vibration API browsers) the
 * user feels a real vibration.
 *
 * Every method respects `prefers-reduced-motion: reduce`.
 */

import { useMemo } from "react";
import {
  hapticTap,
  hapticSuccess,
  hapticWarning,
  hapticError,
} from "@shared/lib/haptic";

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function safeVibrate(pattern: number | number[]): void {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.vibrate !== "function" ||
    prefersReducedMotion()
  ) {
    return;
  }
  try {
    navigator.vibrate(pattern);
  } catch {
    /* throttled or disallowed */
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CELEBRATION PATTERNS (web equivalents of mobile hapticSequence calls)
   ═══════════════════════════════════════════════════════════════════════════ */

function hapticCelebration(): void {
  hapticSuccess();
  setTimeout(() => safeVibrate(15), 100);
  setTimeout(() => safeVibrate(10), 200);
}

function hapticLevelUp(): void {
  safeVibrate(8);
  setTimeout(() => safeVibrate(15), 80);
  setTimeout(() => safeVibrate(25), 160);
}

function hapticStreak(): void {
  safeVibrate(25);
  setTimeout(() => hapticSuccess(), 100);
}

function hapticGoalComplete(): void {
  safeVibrate(15);
  setTimeout(() => safeVibrate(20), 50);
  setTimeout(() => hapticSuccess(), 150);
}

function hapticDestructive(): void {
  hapticWarning();
  setTimeout(() => safeVibrate(40), 150);
}

function hapticToggle(enabled: boolean): void {
  safeVibrate(enabled ? 10 : 6);
}

/* ═══════════════════════════════════════════════════════════════════════════
   HOOK
   ═══════════════════════════════════════════════════════════════════════════ */

export interface UseHapticReturn {
  /** Reduced motion preference detected */
  reduceMotion: boolean;
  /** Light UI selection tap */
  tap: () => void;
  /** Light feedback */
  light: () => void;
  /** Medium feedback */
  medium: () => void;
  /** Heavy feedback */
  heavy: () => void;
  /** Success notification */
  success: () => void;
  /** Warning notification */
  warning: () => void;
  /** Error notification */
  error: () => void;
  /** Triple burst celebration */
  celebration: () => void;
  /** Rising intensity level up */
  levelUp: () => void;
  /** Fire burst for streak */
  streak: () => void;
  /** Goal completion */
  goalComplete: () => void;
  /** Destructive action warning */
  destructive: () => void;
  /** Toggle state change */
  toggle: (enabled: boolean) => void;
}

/**
 * React hook for haptic feedback with reduced motion awareness.
 * API-compatible with the mobile `useHaptic()` hook so shared
 * components can use the same calls on both platforms.
 */
export function useHaptic(): UseHapticReturn {
  const reduceMotion = prefersReducedMotion();

  return useMemo(
    () => ({
      reduceMotion,
      tap: reduceMotion ? () => {} : hapticTap,
      light: reduceMotion ? () => {} : () => safeVibrate(6),
      medium: reduceMotion ? () => {} : () => safeVibrate(15),
      heavy: reduceMotion ? () => {} : () => safeVibrate(30),
      success: reduceMotion ? () => {} : hapticSuccess,
      warning: reduceMotion ? () => {} : hapticWarning,
      error: reduceMotion ? () => {} : hapticError,
      celebration: reduceMotion ? () => {} : hapticCelebration,
      levelUp: reduceMotion ? () => {} : hapticLevelUp,
      streak: reduceMotion ? () => {} : hapticStreak,
      goalComplete: reduceMotion ? () => {} : hapticGoalComplete,
      destructive: reduceMotion ? () => {} : hapticDestructive,
      toggle: reduceMotion ? () => {} : hapticToggle,
    }),
    [reduceMotion],
  );
}
