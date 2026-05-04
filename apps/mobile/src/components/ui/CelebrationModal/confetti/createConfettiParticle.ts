/**
 * Sergeant Design System — Confetti particle factory
 *
 * Builds a single physics-ready particle: starting position centered
 * around the screen midpoint with light random jitter, zero scale (so
 * `useConfetti` can pop it in via spring animation), random color from
 * the supplied palette, random size 8-20px, random shape from
 * circle/square/star.
 */

import { Animated, Dimensions } from "react-native";
import type { ConfettiParticle } from "../types";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const SHAPES: ConfettiParticle["shape"][] = ["circle", "square", "star"];

export function createConfettiParticle(
  id: number,
  colors: string[],
): ConfettiParticle {
  return {
    id,
    x: new Animated.Value(SCREEN_WIDTH / 2 + (Math.random() - 0.5) * 100),
    y: new Animated.Value(SCREEN_HEIGHT / 2 - 100),
    rotation: new Animated.Value(0),
    scale: new Animated.Value(0),
    color: colors[Math.floor(Math.random() * colors.length)]!,
    size: 8 + Math.random() * 12,
    shape: SHAPES[Math.floor(Math.random() * SHAPES.length)]!,
  };
}
