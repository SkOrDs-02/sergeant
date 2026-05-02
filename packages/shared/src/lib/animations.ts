/**
 * Sergeant Design System — Shared Animation Presets
 *
 * Single source of truth for animation timing, easing, and preset
 * configurations used across web and mobile. Web consumers use the
 * CSS easing strings directly; mobile consumers feed the spring
 * configs into Reanimated / Animated.
 *
 * @see docs/planning/ux-enhancement-plan.md — Section 6.1 (Animation Principles)
 * @see packages/design-tokens/tailwind-preset.js — CSS variable counterparts
 *
 * Usage:
 *   import { timing, easing, springConfig, presets } from "@sergeant/shared";
 */

/* ═══════════════════════════════════════════════════════════════════════════
   TIMING — Duration constants (milliseconds)
   ═══════════════════════════════════════════════════════════════════════════ */

export const timing = {
  /** Hover states, micro-interactions, icon toggles */
  fast: 150,
  /** Standard transitions, reveals, content swaps */
  normal: 250,
  /** Page transitions, celebrations, modal entrance */
  slow: 400,
  /** Complex celebrations, confetti, level-up sequences */
  slower: 600,
} as const;

export type TimingKey = keyof typeof timing;

/* ═══════════════════════════════════════════════════════════════════════════
   EASING — CSS cubic-bezier strings (web) + numeric arrays (RN Animated)
   ═══════════════════════════════════════════════════════════════════════════ */

export const easing = {
  /** Smooth exit — elements leaving or settling */
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  /** Balanced — symmetric transitions */
  easeInOut: "cubic-bezier(0.65, 0, 0.35, 1)",
  /** Bouncy spring — playful entrance, checkbox bounce, FAB pop */
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  /** Smooth deceleration — standard Material-like ease */
  smooth: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
} as const;

export type EasingKey = keyof typeof easing;

/* ═══════════════════════════════════════════════════════════════════════════
   SPRING CONFIGS — React Native Reanimated `withSpring()` parameters
   ═══════════════════════════════════════════════════════════════════════════ */

export const springConfig = {
  /** Default responsive spring — buttons, toggles, list items */
  default: {
    damping: 15,
    stiffness: 150,
    mass: 1,
  },
  /** Snappy — fast actions, checkbox check, icon press */
  snappy: {
    damping: 20,
    stiffness: 300,
    mass: 0.8,
  },
  /** Bouncy — celebrations, achievements, confetti */
  bouncy: {
    damping: 10,
    stiffness: 120,
    mass: 1,
  },
  /** Gentle — modals, sheets, page transitions */
  gentle: {
    damping: 20,
    stiffness: 100,
    mass: 1.2,
  },
  /** Heavy — drag-and-drop settle, destructive confirm */
  heavy: {
    damping: 25,
    stiffness: 200,
    mass: 1.5,
  },
} as const;

export type SpringConfigKey = keyof typeof springConfig;

/* ═══════════════════════════════════════════════════════════════════════════
   ANIMATION PRESETS — Reusable from/to configurations
   ═══════════════════════════════════════════════════════════════════════════ */

export interface AnimationPreset {
  from: Record<string, number>;
  to: Record<string, number>;
  duration: number;
  easing?: string;
}

export const presets = {
  /** Simple opacity fade */
  fadeIn: {
    from: { opacity: 0 },
    to: { opacity: 1 },
    duration: timing.normal,
    easing: easing.easeOut,
  },

  /** Slide up + fade — list items, cards, toasts */
  slideUp: {
    from: { opacity: 0, translateY: 20 },
    to: { opacity: 1, translateY: 0 },
    duration: timing.normal,
    easing: easing.easeOut,
  },

  /** Slide down — dropdown menus, tooltips */
  slideDown: {
    from: { opacity: 0, translateY: -12 },
    to: { opacity: 1, translateY: 0 },
    duration: timing.fast,
    easing: easing.easeOut,
  },

  /** Scale in — modals, celebrations, FAB items */
  scaleIn: {
    from: { opacity: 0, scale: 0.9 },
    to: { opacity: 1, scale: 1 },
    duration: timing.normal,
    easing: easing.spring,
  },

  /** Bounce in — achievements, badges, confetti trigger */
  bounceIn: {
    from: { opacity: 0, scale: 0.5 },
    to: { opacity: 1, scale: 1 },
    duration: timing.slow,
    easing: easing.spring,
  },

  /** Slide right — swipe actions reveal, sidebar entrance */
  slideRight: {
    from: { opacity: 0, translateX: -20 },
    to: { opacity: 1, translateX: 0 },
    duration: timing.normal,
    easing: easing.easeOut,
  },

  /** Page exit — fade + slight shrink */
  pageExit: {
    from: { opacity: 1, scale: 1 },
    to: { opacity: 0, scale: 0.97 },
    duration: timing.fast,
    easing: easing.easeInOut,
  },

  /** Page enter — subtle grow from slightly smaller */
  pageEnter: {
    from: { opacity: 0, scale: 0.98 },
    to: { opacity: 1, scale: 1 },
    duration: timing.normal,
    easing: easing.easeOut,
  },
} as const;

export type PresetKey = keyof typeof presets;

/* ═══════════════════════════════════════════════════════════════════════════
   STAGGER — Delay calculator for list entrance animations
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Calculate staggered delay for list item entrance animations.
 * Caps the maximum delay so very long lists don't take forever.
 *
 * @param index — Item index in the list (0-based)
 * @param staggerMs — Delay step per item (default: 50ms)
 * @param maxMs — Maximum total delay cap (default: 500ms)
 */
export function staggerDelay(
  index: number,
  staggerMs = 50,
  maxMs = 500,
): number {
  return Math.min(index * staggerMs, maxMs);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CSS TRANSITION HELPERS — Build transition strings from presets
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Build a CSS `transition` string for common properties.
 * Useful for inline styles when Tailwind utilities don't cover the case.
 *
 * @example
 *   style={{ transition: cssTransition("all", "normal", "easeOut") }}
 */
export function cssTransition(
  property = "all",
  duration: TimingKey = "normal",
  ease: EasingKey = "easeOut",
): string {
  return `${property} ${timing[duration]}ms ${easing[ease]}`;
}

/**
 * Build a CSS `transition` string for multiple properties at once.
 *
 * @example
 *   style={{ transition: cssTransitionMulti(["opacity", "transform"], "fast") }}
 */
export function cssTransitionMulti(
  properties: string[],
  duration: TimingKey = "normal",
  ease: EasingKey = "easeOut",
): string {
  return properties
    .map((prop) => `${prop} ${timing[duration]}ms ${easing[ease]}`)
    .join(", ");
}

/* ═══════════════════════════════════════════════════════════════════════════
   REDUCED MOTION — Helper to check user preference (web only)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Check if the user prefers reduced motion (web).
 * Mobile consumers should use `AccessibilityInfo.isReduceMotionEnabled()`.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
