/**
 * Sergeant Design System — CelebrationModal public surface
 *
 * Single entry point for the modal component, the convenience hook,
 * and the public types so the rest of the app continues to import
 * `from "./CelebrationModal"` unchanged after the file → directory
 * decomposition.
 */

export { CelebrationModal } from "./CelebrationModal";
export { useCelebration } from "./hooks/useCelebration";
export type {
  CelebrationModalProps,
  CelebrationType,
  ModuleTheme,
} from "./types";
