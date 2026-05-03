/**
 * Sergeant Design System — CelebrationModal types
 *
 * Public types shared between the modal component, the confetti
 * subsystem, the haptic-pattern dispatcher, and the `useCelebration`
 * convenience hook. Kept in one module so consumers can re-export
 * the whole surface from `index.ts` without circular imports.
 */

import type { ReactNode } from "react";
import type { Animated } from "react-native";

export type CelebrationType =
  | "achievement"
  | "goal"
  | "levelUp"
  | "streak"
  | "success"
  | "confetti";

export type ModuleTheme =
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition"
  | "default";

export type ConfettiIntensity = "low" | "medium" | "high";

export interface ConfettiParticle {
  id: number;
  x: Animated.Value;
  y: Animated.Value;
  rotation: Animated.Value;
  scale: Animated.Value;
  color: string;
  size: number;
  shape: "circle" | "square" | "star";
}

export interface CelebrationModalProps {
  type: CelebrationType;
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  theme?: ModuleTheme;
  value?: number | string;
  unit?: string;
  icon?: ReactNode;
  progress?: { current: number; max: number };
  rewards?: Array<{ icon: ReactNode; label: string }>;
  actionLabel?: string;
  onAction?: () => void;
  autoCloseMs?: number;
  confettiIntensity?: ConfettiIntensity;
}

export type CelebrationConfig = Omit<CelebrationModalProps, "open" | "onClose">;
