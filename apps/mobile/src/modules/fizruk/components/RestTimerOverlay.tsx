/**
 * `RestTimerOverlay` — mobile rest-timer sheet (Phase 6 · PR-B).
 *
 * Web counterpart: `apps/web/src/modules/fizruk/components/workouts/
 * RestTimerOverlay.tsx` (75 LOC).
 *
 * Rendered as an absolute-positioned card above the tab bar while a
 * rest countdown is active. The component is purely a view — state
 * (`restTimer`, `cancel`) is owned by `useActiveFizrukWorkout` so the
 * same overlay can be driven by future screens (Dashboard mini view,
 * templates, etc.).
 *
 * Design notes:
 *   - The web version draws a circular SVG progress ring. We are
 *     holding off on `react-native-svg` until the BodyAtlas PR (PR-C)
 *     picks an SVG library — see `docs/mobile/react-native-migration.md` §6.8.
 *     Until then, the overlay uses a linear progress bar (`View` +
 *     animated width), which reads cleanly on a bottom-of-screen
 *     sheet and is indistinguishable from the web version in
 *     ergonomics (both are glanceable in-workout indicators).
 *   - `aria-live="polite"` on web maps to `accessibilityLiveRegion`
 *     on Android; iOS VoiceOver reads the updated label on re-render
 *     automatically, so the composite label + `role="timer"` mirrors
 *     the web version's semantics.
 *   - Respects `AccessibilityInfo.isReduceMotionEnabled()` by passing
 *     `0` instead of 1000ms to `Animated.timing`, matching the pattern
 *     used by `Skeleton.tsx` and `SyncStatusIndicator.tsx`.
 */

import { formatRestClock } from "@sergeant/fizruk-domain/lib/workoutUi";
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Button } from "@/components/ui/Button";

import type { RestTimerState } from "../hooks/useActiveFizrukWorkout";

export interface RestTimerOverlayProps {
  restTimer: RestTimerState | null;
  onCancel: () => void;
}

export function RestTimerOverlay({
  restTimer,
  onCancel,
}: RestTimerOverlayProps) {
  // AI-CONTEXT: lazy `useState` (not `useRef(...).current`) — the
  // Animated.Value is created once on mount and its identity never changes,
  // which keeps render free of ref reads (react-hooks/refs) without touching
  // animation behavior.
  const [progressAnim] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (!cancelled) setReduceMotion(v);
      })
      .catch(() => {
        /* noop — fall back to default animation */
      });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (v: boolean) => setReduceMotion(v),
    );
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  useEffect(() => {
    if (!restTimer || restTimer.total <= 0) {
      progressAnim.setValue(0);
      return;
    }
    const frac = Math.max(
      0,
      Math.min(1, restTimer.remaining / restTimer.total),
    );
    Animated.timing(progressAnim, {
      toValue: frac,
      duration: reduceMotion ? 0 : 900,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  }, [progressAnim, reduceMotion, restTimer]);

  if (!restTimer) return null;

  const urgent = restTimer.remaining <= 10 && restTimer.remaining > 0;
  const clock = formatRestClock(restTimer.remaining);
  const widthInterpolated = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View
      pointerEvents="box-none"
      style={styles.container}
      accessibilityRole="timer"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Відпочинок, залишилось ${restTimer.remaining} секунд`}
    >
      <View
        pointerEvents="auto"
        style={[styles.sheet, urgent ? styles.sheetUrgent : styles.sheetNormal]}
      >
        <View style={styles.row}>
          <View style={styles.textCol}>
            <Text style={styles.eyebrow}>Відпочинок</Text>
            <Text
              style={[
                styles.clock,
                urgent ? styles.clockUrgent : styles.clockNormal,
              ]}
              accessibilityRole="text"
            >
              {clock}
            </Text>
          </View>
          <Button
            variant="ghost"
            size="sm"
            onPress={onCancel}
            accessibilityLabel="Скасувати таймер відпочинку"
          >
            Скасувати
          </Button>
        </View>
        <View style={styles.track}>
          <Animated.View
            style={[
              styles.progress,
              urgent ? styles.progressUrgent : styles.progressNormal,
              { width: widthInterpolated },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
    zIndex: 55,
  },
  sheet: {
    maxWidth: 560,
    alignSelf: "center",
    width: "100%",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 8,
  },
  sheetNormal: { borderColor: "rgba(15, 118, 110, 0.25)" },
  sheetUrgent: { borderColor: "rgba(234, 88, 12, 0.55)" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  textCol: { flexShrink: 1, minWidth: 0 },
  eyebrow: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  clock: {
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 32,
    fontVariant: ["tabular-nums"],
  },
  clockNormal: { color: "#0f172a" },
  clockUrgent: { color: "#c2410c" },
  track: {
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.08)",
    overflow: "hidden",
  },
  progress: {
    height: "100%",
  },
  progressNormal: { backgroundColor: "#14b8a6" },
  progressUrgent: { backgroundColor: "#ea580c" },
});
