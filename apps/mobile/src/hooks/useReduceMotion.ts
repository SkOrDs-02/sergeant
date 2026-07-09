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

export default useReduceMotion;
