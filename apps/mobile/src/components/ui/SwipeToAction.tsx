/**
 * Sergeant Design System — SwipeToAction (React Native)
 *
 * Mobile port of `apps/web/src/shared/components/ui/SwipeToAction.tsx`.
 * Exposes the same call-site contract (`onSwipeLeft` / `onSwipeRight`,
 * `leftLabel` / `rightLabel`, `leftColor` / `rightColor`, `disabled`)
 * so that ported Finyk / Fizruk / Routine / Nutrition list rows can
 * share prop shapes across platforms.
 *
 * @see apps/web/src/shared/components/ui/SwipeToAction.tsx — canonical source of truth
 *
 * Parity notes:
 * - Same 60-px commit threshold / 100-px max offset as web.
 * - Same label placement: left action label peeks from the right edge
 *   of the background track when swiping left, right action label
 *   peeks from the left edge when swiping right.
 * - Same "commit → animate back to 0 → fire callback" choreography.
 * - Same disabled semantics: swipe gesture is a no-op, children are
 *   rendered in place.
 *
 * Differences from web (intentional):
 * - Gesture detection is handled by `react-native-gesture-handler`'s
 *   `Pan` detector (`activeOffsetX` restricts activation to horizontal
 *   drags, leaving native vertical scroll untouched). Web uses raw
 *   `touchstart` / `touchmove` / `touchend` + manual axis locking.
 * - Offset is driven by a Reanimated `SharedValue` and rendered via
 *   `useAnimatedStyle` instead of component state, so the row tracks
 *   the finger on the UI thread without hopping through React.
 * - `AccessibilityInfo.isReduceMotionEnabled()` collapses the commit
 *   animation to `withTiming(..., { duration: 0 })` per WCAG 2.3.3 —
 *   same approach as `Skeleton` / `Sheet`.
 * - No `fallback` rendering: RN has no DOM fallback concept; when
 *   `disabled` is true we simply skip the detector.
 */

import * as Haptics from "expo-haptics";
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Text,
  View,
  type View as RNView,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

export interface SwipeToActionProps {
  children?: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftLabel?: ReactNode;
  rightLabel?: ReactNode;
  leftColor?: string;
  rightColor?: string;
  disabled?: boolean;
  /** Accessibility label for the row — forwarded to the outer `View`. */
  accessibilityLabel?: string;
}

const THRESHOLD = 60;
const MAX_OFFSET = 100;

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export const SwipeToAction = forwardRef<RNView, SwipeToActionProps>(
  function SwipeToAction(
    {
      children,
      onSwipeLeft,
      onSwipeRight,
      leftLabel = "✓",
      rightLabel = "🗑",
      leftColor = "bg-brand-500",
      rightColor = "bg-danger",
      disabled = false,
      accessibilityLabel,
    },
    ref,
  ) {
    const offset = useSharedValue(0);
    const [reduceMotion, setReduceMotion] = useState(false);
    const reduceMotionRef = useRef(false);

    useEffect(() => {
      let mounted = true;
      AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
        if (!mounted) return;
        reduceMotionRef.current = enabled;
        setReduceMotion(enabled);
      });
      const sub = AccessibilityInfo.addEventListener(
        "reduceMotionChanged",
        (enabled) => {
          reduceMotionRef.current = enabled;
          setReduceMotion(enabled);
        },
      );
      return () => {
        mounted = false;
        sub.remove();
      };
    }, []);

    const commit = useCallback(
      (direction: "left" | "right") => {
        // Haptic feedback on commit
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        if (direction === "left") {
          onSwipeLeft?.();
        } else {
          onSwipeRight?.();
        }
      },
      [onSwipeLeft, onSwipeRight],
    );

    const pan = Gesture.Pan()
      .enabled(!disabled)
      .activeOffsetX([-12, 12])
      .failOffsetY([-10, 10])
      .onUpdate((event) => {
        "worklet";
        let next = event.translationX;
        if (next > MAX_OFFSET) next = MAX_OFFSET;
        if (next < -MAX_OFFSET) next = -MAX_OFFSET;
        // Suppress directions that have no handler so the row can't be
        // pulled to reveal a non-existent action.
        if (next < 0 && !onSwipeLeft) next = 0;
        if (next > 0 && !onSwipeRight) next = 0;
        offset.value = next;
      })
      .onEnd(() => {
        "worklet";
        const duration = reduceMotionRef.current ? 0 : 180;
        if (offset.value <= -THRESHOLD && onSwipeLeft) {
          offset.value = withTiming(0, { duration }, (finished) => {
            if (finished) runOnJS(commit)("left");
          });
        } else if (offset.value >= THRESHOLD && onSwipeRight) {
          offset.value = withTiming(0, { duration }, (finished) => {
            if (finished) runOnJS(commit)("right");
          });
        } else {
          offset.value = withTiming(0, { duration });
        }
      });

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: offset.value }],
    }));

    return (
      <View
        ref={ref}
        className="relative overflow-hidden"
        accessibilityLabel={accessibilityLabel}
      >
        {/* Background track — the right-swipe action peeks from the
        left edge, the left-swipe action peeks from the right edge,
        matching the web affordance. */}
        <View className="absolute inset-0 flex-row">
          {onSwipeRight && (
            <View
              className={cx("h-full justify-center pl-4", rightColor)}
              style={{ width: MAX_OFFSET }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {typeof rightLabel === "string" ? (
                <Text className="text-white text-sm font-semibold">
                  {rightLabel}
                </Text>
              ) : (
                rightLabel
              )}
            </View>
          )}
          <View className="flex-1" />
          {onSwipeLeft && (
            <View
              className={cx("h-full items-end justify-center pr-4", leftColor)}
              style={{ width: MAX_OFFSET }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {typeof leftLabel === "string" ? (
                <Text className="text-white text-sm font-semibold">
                  {leftLabel}
                </Text>
              ) : (
                leftLabel
              )}
            </View>
          )}
        </View>
        <GestureDetector gesture={pan}>
          <Animated.View style={animatedStyle}>{children}</Animated.View>
        </GestureDetector>
        {/* Static sibling — used by tests / reduced-motion consumers to
        confirm the component tree renders without the Reanimated
        layout-effect running. */}
        {reduceMotion ? null : null}
      </View>
    );
  },
);
