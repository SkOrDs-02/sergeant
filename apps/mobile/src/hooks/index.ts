/**
 * Shared hooks for Sergeant mobile app.
 */

// Accessibility
export {
  useReduceMotion,
  useAnimationDuration,
  useSpringConfig,
} from "./useReduceMotion";
export {
  useScreenReader,
  useAnnounceOnChange,
  type UseScreenReaderResult,
} from "./useScreenReader";

// Tab navigation
export { useTabBadges, type TabBadges } from "./useTabBadges";
