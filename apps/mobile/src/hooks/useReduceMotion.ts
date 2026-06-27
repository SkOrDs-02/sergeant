/**
 * useReduceMotion — respects user's "Reduce Motion" accessibility preference.
 *
 * Returns true when the user has enabled "Reduce Motion" in system settings.
 * Use this to disable animations, transitions, and auto-playing content.
 *
 * @example
 * ```tsx
 * function AnimatedComponent() {
 *   const reduceMotion = useReduceMotion();
 *
 *   return (
 *     <Animated.View
 *       style={reduceMotion ? {} : animatedStyle}
 *     >
 *       {children}
 *     </Animated.View>
 *   );
 * }
 * ```
 */
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Hook that returns whether the user prefers reduced motion.
 * Syncs with system accessibility settings.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    // Get initial value. The `mounted` guard + `.catch` avoid a
    // set-state-after-unmount warning and an unhandled rejection when the
    // accessibility probe never settles under test (see the flaky-tests
    // note in apps/mobile/AGENTS.md).
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => {});

    // Listen for changes
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => setReduceMotion(enabled),
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

/**
 * Hook that returns animation duration based on reduce motion preference.
 * Returns 0 when reduce motion is enabled, otherwise returns the provided duration.
 */
export function useAnimationDuration(defaultDuration: number): number {
  const reduceMotion = useReduceMotion();
  return reduceMotion ? 0 : defaultDuration;
}

/**
 * Hook that returns spring config based on reduce motion preference.
 * Returns immediate spring when reduce motion is enabled.
 */
export function useSpringConfig(config: {
  tension?: number;
  friction?: number;
  mass?: number;
}) {
  const reduceMotion = useReduceMotion();

  if (reduceMotion) {
    return {
      tension: 500,
      friction: 50,
      mass: 0.1,
    };
  }

  return config;
}

export default useReduceMotion;
