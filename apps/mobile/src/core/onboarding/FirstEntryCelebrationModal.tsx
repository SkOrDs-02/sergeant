/**
 * FirstEntryCelebrationModal (React Native) — First entry success celebration.
 *
 * Full-screen modal celebrating the user's first real entry. Shows
 * confetti particles and module-aware copy from
 * `getFirstEntryCelebrationCopy` so the headline acknowledges what the
 * user actually just did — mirrors the web modal's contract exactly,
 * including the `celebration_shown` telemetry payload.
 *
 * @see apps/web/src/core/onboarding/FirstEntryCelebrationModal.tsx — canonical source of truth
 */

import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  View,
  type AccessibilityRole,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Check, Sparkles } from "lucide-react-native";
import {
  ANALYTICS_EVENTS,
  getFirstEntryCelebrationCopy,
  type DashboardModuleId,
} from "@sergeant/shared";

import { colors } from "@/theme";
import { Button } from "@/components/ui/Button";
import { hapticCelebration, hapticSelection } from "@/lib/haptic";
import { trackEvent } from "@/lib/analytics";

const ALERT_DIALOG_ROLE = "alertdialog" as AccessibilityRole;
const AUTO_CLOSE_MS = 10_000;
const CONFETTI_COLORS = [
  "#10B981", // emerald
  "#14B8A6", // teal
  "#F97066", // coral
  "#84CC16", // lime
  "#FBBF24", // amber
];

interface ConfettiSpec {
  id: number;
  left: number;
  top: number;
  color: string;
  size: number;
  delay: number;
  round: boolean;
}

// `Math.random()` here only jitters visual positions/colours/sizes for
// confetti — visual diversity is the goal, not derived state. Snapshot
// once via lazy `useState` so subsequent renders stay stable.
function buildConfetti(count: number): ConfettiSpec[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    left: 50 + (Math.random() - 0.5) * 80,
    top: 30 + (Math.random() - 0.5) * 40,
    color:
      CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)] ??
      "#10B981",
    size: 6 + Math.random() * 8,
    delay: Math.random() * 300,
    round: id % 3 === 0,
  }));
}

function ConfettiPiece({ spec }: { spec: ConfettiSpec }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-10);

  useEffect(() => {
    opacity.value = withDelay(
      spec.delay,
      withSequence(
        withTiming(1, { duration: 150 }),
        withTiming(0, { duration: 900 }),
      ),
    );
    translateY.value = withDelay(
      spec.delay,
      withTiming(40, { duration: 1000 }),
    );
    // Snapshot values are stable for the component's lifetime — no deps needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        style,
        {
          position: "absolute",
          left: `${spec.left}%`,
          top: `${spec.top}%`,
          width: spec.size,
          height: spec.size,
          borderRadius: spec.round ? spec.size / 2 : 2,
          backgroundColor: spec.color,
        },
      ]}
    />
  );
}

export interface FirstEntryCelebrationModalProps {
  open: boolean;
  onClose: () => void;
  /** Time-to-value in milliseconds (null if not measured) */
  ttvMs: number | null;
  /**
   * Module that owns the entry which flipped the first-real-entry
   * flag. Picks the copy variant from `getFirstEntryCelebrationCopy`;
   * `null` falls back to the default copy.
   */
  moduleId: DashboardModuleId | null;
}

export function FirstEntryCelebrationModal({
  open,
  onClose,
  ttvMs,
  moduleId,
}: FirstEntryCelebrationModalProps) {
  const reduceMotion = useReducedMotion();
  const [particles] = useState(() => buildConfetti(24));

  useEffect(() => {
    if (!open) return;
    hapticCelebration();
    const { nextStepTip, primaryCtaLabel } =
      getFirstEntryCelebrationCopy(moduleId);
    trackEvent(ANALYTICS_EVENTS.CELEBRATION_SHOWN, {
      ttvMs,
      source: "first_entry",
      moduleId,
      tipVariant: nextStepTip,
      ctaLabel: primaryCtaLabel,
    });
  }, [open, ttvMs, moduleId]);

  // Auto-dismiss after 10 seconds — matches web.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [open, onClose]);

  const handleClose = useCallback(() => {
    hapticSelection();
    onClose();
  }, [onClose]);

  if (!open) return null;

  // Module-aware copy lives in `FIRST_ENTRY_CELEBRATIONS` (packages/shared).
  // The headline acknowledges what the user actually did, and the CTA
  // promises the next step — see the web sibling for the full rationale.
  // TTV stays in the analytics payload above, never in copy.
  const { headline, subtext, nextStepTip, primaryCtaLabel } =
    getFirstEntryCelebrationCopy(moduleId);

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <Animated.View
        entering={reduceMotion ? undefined : FadeIn.duration(200)}
        exiting={reduceMotion ? undefined : FadeOut.duration(150)}
        className="flex-1 items-center justify-center px-6 bg-overlay"
      >
        {/* Scrim — tap to close */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрити святкування"
          onPress={handleClose}
          testID="celebration-modal-scrim"
          className="absolute inset-0"
        />

        {/* Confetti particles — skipped under reduced motion */}
        {!reduceMotion && (
          <View className="absolute inset-0" pointerEvents="none">
            {particles.map((p) => (
              <ConfettiPiece key={p.id} spec={p} />
            ))}
          </View>
        )}

        {/* Card */}
        <Animated.View
          entering={
            reduceMotion
              ? undefined
              : FadeIn.duration(250).springify().damping(18)
          }
          accessibilityViewIsModal
          accessibilityRole={ALERT_DIALOG_ROLE}
          accessibilityLabel="Вітаємо!"
          className="w-full max-w-sm items-center gap-4 rounded-3xl bg-surface px-6 py-8 shadow-xl"
          testID="celebration-modal"
        >
          <View
            className="h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: `${colors.success}20` }}
          >
            <Check size={32} color={colors.success} strokeWidth={3} />
          </View>

          <View className="items-center gap-1">
            <Text className="text-center text-xl font-bold text-fg">
              {headline}
            </Text>
            <Text className="text-center text-sm text-fg-muted">{subtext}</Text>
          </View>

          <View className="w-full flex-row items-start gap-2.5 rounded-xl bg-cream-100 p-3">
            <Sparkles size={14} color={colors.success} />
            <Text className="flex-1 text-xs leading-relaxed text-fg-muted">
              {nextStepTip}
            </Text>
          </View>

          <Button
            variant="primary"
            size="lg"
            onPress={handleClose}
            className="w-full"
            testID="celebration-modal-cta"
          >
            {primaryCtaLabel}
          </Button>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
