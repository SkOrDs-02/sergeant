/**
 * Sergeant Design System — Confetti particle view
 *
 * Renders a single confetti particle as an absolutely-positioned
 * `Animated.View`. Translation, rotation, and scale are driven by the
 * native driver so the main thread stays free for input.
 */

import { Animated } from "react-native";
import type { ConfettiParticle } from "../types";

export function ConfettiParticleView({
  particle,
}: {
  particle: ConfettiParticle;
}) {
  const borderRadius =
    particle.shape === "circle"
      ? particle.size / 2
      : particle.shape === "star"
        ? 0
        : 2;

  return (
    <Animated.View
      style={{
        position: "absolute",
        width: particle.size,
        height: particle.size,
        backgroundColor: particle.color,
        borderRadius,
        transform: [
          { translateX: particle.x },
          { translateY: particle.y },
          {
            rotate: particle.rotation.interpolate({
              inputRange: [0, 1],
              outputRange: ["0deg", "720deg"],
            }),
          },
          { scale: particle.scale },
        ],
      }}
    />
  );
}
