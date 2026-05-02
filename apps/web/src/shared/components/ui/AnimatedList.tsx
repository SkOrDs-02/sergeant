import {
  memo,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import { cn } from "../../lib/cn";

/**
 * Sergeant Design System -- AnimatedList
 *
 * Staggered entrance animations for list items. Each child fades in
 * and slides up with an incrementing delay, creating a waterfall effect.
 *
 * Features:
 * - Staggered fade-in with configurable delay
 * - IntersectionObserver-based trigger (animates when scrolled into view)
 * - Multiple animation styles: fade, slideUp, slideRight, scale
 * - Reduced motion support
 *
 * @example
 * ```tsx
 * <AnimatedList>
 *   {items.map(item => <Card key={item.id}>{item.name}</Card>)}
 * </AnimatedList>
 *
 * <AnimatedFadeIn delay={200}>
 *   <p>Appears after 200ms</p>
 * </AnimatedFadeIn>
 * ```
 */

export type AnimationStyle = "fade" | "slideUp" | "slideRight" | "scale";

const animationClasses: Record<
  AnimationStyle,
  { initial: string; animate: string }
> = {
  fade: {
    initial: "opacity-0",
    animate: "opacity-100",
  },
  slideUp: {
    initial: "opacity-0 translate-y-4",
    animate: "opacity-100 translate-y-0",
  },
  slideRight: {
    initial: "opacity-0 -translate-x-4",
    animate: "opacity-100 translate-x-0",
  },
  scale: {
    initial: "opacity-0 scale-95",
    animate: "opacity-100 scale-100",
  },
};

export interface AnimatedListProps {
  children: ReactNode[];
  /** Delay between each item in ms. Default 60. */
  staggerDelay?: number;
  /** Animation style. Default "slideUp". */
  animation?: AnimationStyle;
  /** Base duration in ms. Default 300. */
  duration?: number;
  /** Only animate when scrolled into view. Default true. */
  triggerOnView?: boolean;
  /** IntersectionObserver threshold. Default 0.1. */
  threshold?: number;
  className?: string;
}

export const AnimatedList = memo(function AnimatedList({
  children,
  staggerDelay = 60,
  animation = "slideUp",
  duration = 300,
  triggerOnView = true,
  threshold = 0.1,
  className,
}: AnimatedListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(!triggerOnView);

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!triggerOnView || prefersReducedMotion) {
      setIsVisible(true);
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [triggerOnView, threshold, prefersReducedMotion]);

  const anim = animationClasses[animation];

  return (
    <div ref={containerRef} className={className}>
      {(Array.isArray(children) ? children : [children]).map((child, index) => (
        <div
          key={index}
          className={cn(
            "transition-all ease-out",
            isVisible && !prefersReducedMotion ? anim.animate : anim.initial,
            prefersReducedMotion &&
              "opacity-100 translate-y-0 translate-x-0 scale-100",
          )}
          style={
            !prefersReducedMotion
              ? ({
                  transitionDuration: `${duration}ms`,
                  transitionDelay: isVisible
                    ? `${index * staggerDelay}ms`
                    : "0ms",
                } as CSSProperties)
              : undefined
          }
        >
          {child}
        </div>
      ))}
    </div>
  );
});

/**
 * AnimatedFadeIn -- Single-item wrapper with fade/slide entrance.
 */
export interface AnimatedFadeInProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  animation?: AnimationStyle;
  triggerOnView?: boolean;
  className?: string;
}

export const AnimatedFadeIn = memo(function AnimatedFadeIn({
  children,
  delay = 0,
  duration = 300,
  animation = "slideUp",
  triggerOnView = true,
  className,
}: AnimatedFadeInProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(!triggerOnView);

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!triggerOnView || prefersReducedMotion) {
      setIsVisible(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [triggerOnView, prefersReducedMotion]);

  const anim = animationClasses[animation];

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all ease-out",
        isVisible && !prefersReducedMotion ? anim.animate : anim.initial,
        prefersReducedMotion &&
          "opacity-100 translate-y-0 translate-x-0 scale-100",
        className,
      )}
      style={
        !prefersReducedMotion
          ? ({
              transitionDuration: `${duration}ms`,
              transitionDelay: isVisible ? `${delay}ms` : "0ms",
            } as CSSProperties)
          : undefined
      }
    >
      {children}
    </div>
  );
});

/**
 * AnimatedSlideIn -- Horizontal slide entrance (for sidebar items, nav).
 */
export const AnimatedSlideIn = memo(function AnimatedSlideIn({
  children,
  delay = 0,
  duration = 300,
  className,
}: Omit<AnimatedFadeInProps, "animation">) {
  return (
    <AnimatedFadeIn
      delay={delay}
      duration={duration}
      animation="slideRight"
      className={className}
    >
      {children}
    </AnimatedFadeIn>
  );
});

/**
 * AnimatedScale -- Scale entrance (for cards, modals).
 */
export const AnimatedScale = memo(function AnimatedScale({
  children,
  delay = 0,
  duration = 300,
  className,
}: Omit<AnimatedFadeInProps, "animation">) {
  return (
    <AnimatedFadeIn
      delay={delay}
      duration={duration}
      animation="scale"
      className={className}
    >
      {children}
    </AnimatedFadeIn>
  );
});
