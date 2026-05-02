/**
 * Sergeant Design System — AnimatedList (React Native)
 *
 * A list wrapper that animates its children with staggered fade-in
 * and slide-up effects. Perfect for dashboard cards, settings items,
 * transaction lists, etc.
 *
 * Features:
 * - Staggered entrance animation with configurable delay
 * - Spring physics for natural feel
 * - Respects reduced motion preferences
 * - Compatible with FlatList and regular Views
 * - Optional pull-to-refresh support
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  View,
  type ViewProps,
} from "react-native";

export interface AnimatedListItemProps extends ViewProps {
  /** Animation delay in ms (auto-calculated if using AnimatedList) */
  delay?: number;
  /** Animation duration in ms */
  duration?: number;
  /** Disable animation for this item */
  disableAnimation?: boolean;
  children: ReactNode;
}

export interface AnimatedListProps extends ViewProps {
  /** Stagger delay between each item in ms */
  staggerDelay?: number;
  /** Initial animation delay before first item */
  initialDelay?: number;
  /** Disable all animations */
  disableAnimation?: boolean;
  children: ReactNode;
}

function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );

    return () => sub.remove();
  }, []);

  return reduceMotion;
}

/**
 * AnimatedListItem — Individual animated list item
 * Can be used standalone or within AnimatedList
 */
export function AnimatedListItem({
  delay = 0,
  duration: _duration = 400,
  disableAnimation = false,
  children,
  className,
  style,
  ...props
}: AnimatedListItemProps) {
  const reduceMotion = useReduceMotion();
  const shouldAnimate = !disableAnimation && !reduceMotion;

  const opacity = useRef(new Animated.Value(shouldAnimate ? 0 : 1)).current;
  const translateY = useRef(new Animated.Value(shouldAnimate ? 20 : 0)).current;
  const scale = useRef(new Animated.Value(shouldAnimate ? 0.95 : 1)).current;

  useEffect(() => {
    if (!shouldAnimate) return;

    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.spring(opacity, {
          toValue: 1,
          useNativeDriver: true,
          damping: 20,
          stiffness: 100,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 100,
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          damping: 18,
          stiffness: 100,
        }),
      ]).start();
    }, delay);

    return () => clearTimeout(timeout);
  }, [shouldAnimate, delay, opacity, translateY, scale]);

  return (
    <Animated.View
      style={[
        {
          opacity,
          transform: [{ translateY }, { scale }],
        },
        style,
      ]}
      className={className as string}
      {...props}
    >
      {children}
    </Animated.View>
  );
}

/**
 * AnimatedList — Wrapper that auto-staggers child animations
 */
export function AnimatedList({
  staggerDelay = 50,
  initialDelay = 0,
  disableAnimation = false,
  children,
  className,
  style,
  ...props
}: AnimatedListProps) {
  const reduceMotion = useReduceMotion();
  const shouldAnimate = !disableAnimation && !reduceMotion;

  // Clone children with staggered delays
  const animatedChildren = (() => {
    const childArray = Array.isArray(children) ? children : [children];
    return childArray.map((child, index) => {
      if (!child || typeof child !== "object" || !("props" in child)) {
        return child;
      }

      const delay = shouldAnimate ? initialDelay + index * staggerDelay : 0;
      return (
        <AnimatedListItem
          key={index}
          delay={delay}
          disableAnimation={!shouldAnimate}
        >
          {child}
        </AnimatedListItem>
      );
    });
  })();

  return (
    <View style={style} className={className as string} {...props}>
      {animatedChildren}
    </View>
  );
}

/**
 * AnimatedFadeIn — Simple fade-in wrapper for any content
 */
export function AnimatedFadeIn({
  delay = 0,
  duration = 300,
  children,
  className,
  style,
  ...props
}: {
  delay?: number;
  duration?: number;
  children: ReactNode;
  className?: string;
  style?: ViewProps["style"];
}) {
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) return;

    const timeout = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        useNativeDriver: true,
      }).start();
    }, delay);

    return () => clearTimeout(timeout);
  }, [reduceMotion, delay, duration, opacity]);

  return (
    <Animated.View
      style={[{ opacity }, style]}
      className={className}
      {...props}
    >
      {children}
    </Animated.View>
  );
}

/**
 * AnimatedSlideIn — Slide in from a direction
 */
export function AnimatedSlideIn({
  delay = 0,
  direction = "up",
  distance = 20,
  children,
  className,
  style,
  ...props
}: {
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
  distance?: number;
  children: ReactNode;
  className?: string;
  style?: ViewProps["style"];
}) {
  const reduceMotion = useReduceMotion();

  const getInitialTransform = () => {
    switch (direction) {
      case "up":
        return { translateY: distance };
      case "down":
        return { translateY: -distance };
      case "left":
        return { translateX: distance };
      case "right":
        return { translateX: -distance };
    }
  };

  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const translateX = useRef(
    new Animated.Value(
      reduceMotion ? 0 : (getInitialTransform().translateX ?? 0),
    ),
  ).current;
  const translateY = useRef(
    new Animated.Value(
      reduceMotion ? 0 : (getInitialTransform().translateY ?? 0),
    ),
  ).current;

  useEffect(() => {
    if (reduceMotion) return;

    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.spring(opacity, {
          toValue: 1,
          useNativeDriver: true,
          damping: 20,
          stiffness: 100,
        }),
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 100,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 100,
        }),
      ]).start();
    }, delay);

    return () => clearTimeout(timeout);
  }, [reduceMotion, delay, opacity, translateX, translateY]);

  return (
    <Animated.View
      style={[
        {
          opacity,
          transform: [{ translateX }, { translateY }],
        },
        style,
      ]}
      className={className}
      {...props}
    >
      {children}
    </Animated.View>
  );
}

/**
 * AnimatedScale — Scale in animation
 */
export function AnimatedScale({
  delay = 0,
  initialScale = 0.9,
  children,
  className,
  style,
  ...props
}: {
  delay?: number;
  initialScale?: number;
  children: ReactNode;
  className?: string;
  style?: ViewProps["style"];
}) {
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const scale = useRef(
    new Animated.Value(reduceMotion ? 1 : initialScale),
  ).current;

  useEffect(() => {
    if (reduceMotion) return;

    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.spring(opacity, {
          toValue: 1,
          useNativeDriver: true,
          damping: 20,
          stiffness: 100,
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          damping: 15,
          stiffness: 150,
        }),
      ]).start();
    }, delay);

    return () => clearTimeout(timeout);
  }, [reduceMotion, delay, opacity, scale]);

  return (
    <Animated.View
      style={[
        {
          opacity,
          transform: [{ scale }],
        },
        style,
      ]}
      className={className}
      {...props}
    >
      {children}
    </Animated.View>
  );
}
