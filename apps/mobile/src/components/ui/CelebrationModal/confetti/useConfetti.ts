/**
 * Sergeant Design System — Confetti hook
 *
 * Owns the particle list state and exposes a `triggerConfetti` callback
 * that materialises N particles (count chosen by intensity), pops each
 * one in via spring, then animates it falling and spinning across the
 * screen with stagger. Cleans up after 4s.
 */

import { useCallback, useState } from "react";
import { Animated, Dimensions } from "react-native";
import { CONFETTI_COUNTS, MODULE_COLORS } from "../constants";
import type {
  ConfettiIntensity,
  ConfettiParticle,
  ModuleTheme,
} from "../types";
import { createConfettiParticle } from "./createConfettiParticle";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export function useConfetti(
  theme: ModuleTheme,
  intensity: ConfettiIntensity,
): {
  particles: ConfettiParticle[];
  triggerConfetti: () => void;
} {
  const [particles, setParticles] = useState<ConfettiParticle[]>([]);
  const colors = MODULE_COLORS[theme];

  const triggerConfetti = useCallback(() => {
    const count = CONFETTI_COUNTS[intensity];
    const newParticles = Array.from({ length: count }, (_, i) =>
      createConfettiParticle(i, colors),
    );
    setParticles(newParticles);

    newParticles.forEach((particle, index) => {
      const delay = index * 20;
      const targetX =
        SCREEN_WIDTH / 2 + (Math.random() - 0.5) * SCREEN_WIDTH * 0.8;
      const targetY = SCREEN_HEIGHT + 50;

      setTimeout(() => {
        Animated.parallel([
          Animated.spring(particle.scale, {
            toValue: 1,
            useNativeDriver: true,
            damping: 10,
            stiffness: 200,
          }),
          Animated.timing(particle.y, {
            toValue: targetY,
            duration: 2000 + Math.random() * 1000,
            useNativeDriver: true,
          }),
          Animated.timing(particle.x, {
            toValue: targetX,
            duration: 2000 + Math.random() * 1000,
            useNativeDriver: true,
          }),
          Animated.timing(particle.rotation, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
        ]).start();
      }, delay);
    });

    setTimeout(() => setParticles([]), 4000);
  }, [colors, intensity]);

  return { particles, triggerConfetti };
}
