/**
 * Sergeant Design System — Card (React Native)
 *
 * Mobile port of the web Card primitive. Public API mirrors the web
 * component so screens can share prop shapes across platforms.
 *
 * @see apps/web/src/shared/components/ui/Card.tsx — canonical source of truth
 *
 * Parity notes:
 * - Same `CardVariant` enum: `default` / `interactive` / `flat` /
 *   `elevated` / `ghost` plus module-branded `finyk` / `fizruk` /
 *   `routine` / `nutrition` and their `-soft` counterparts.
 * - Same `padding` sizes (none / sm / md / lg / xl) and `radius`
 *   (md / lg / xl) hierarchy. Module-branded variants still bake
 *   `rounded-3xl` into their class string just like on web.
 * - `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` /
 *   `CardFooter` sub-components are all ported so composition stays
 *   identical to web.
 *
 * Differences from web (intentional — see PR body):
 * - No `as` prop: RN has no HTML element polymorphism. Container is
 *   always a `View`, sub-text is always `Text`.
 * - Hover / transition / `active:scale` utilities on `interactive` are
 *   dropped — RN has no hover state and press feedback is applied via
 *   `Pressable`'s `pressed` callback. Callers that need press feedback
 *   should wrap the Card in their own `Pressable` (or swap to `Button`).
 * - Dark-mode `dark:` modifiers on branded module variants use the
 *   `--c-<module>-surface-dark` CSS variable tokens defined in
 *   `apps/mobile/global.css` for consistent tinting. Core variants and sub-components
 *   (`CardTitle`, `CardDescription`, `CardFooter`) now resolve via
 *   the shared semantic `fg` / `fg-muted` / `line` CSS-variable
 *   tokens from `@sergeant/design-tokens`, so they re-tint with the
 *   `:root` ↔ `.dark` palette in `apps/mobile/global.css`.
 * - `CardFooter` mirrors the web `border-t border-line` divider via
 *   the same semantic token (no more hardcoded `cream-300`).
 */

import { forwardRef, useRef, type ReactNode } from "react";
import {
  Animated,
  Pressable,
  Text,
  type TextProps,
  View,
  type ViewProps,
  type View as RNView,
} from "react-native";

export type CardVariant =
  | "default"
  | "interactive"
  | "flat"
  | "elevated"
  | "ghost"
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition"
  | "finyk-soft"
  | "fizruk-soft"
  | "routine-soft"
  | "nutrition-soft";

export type CardPadding = "none" | "sm" | "md" | "lg" | "xl";

export type CardRadius = "md" | "lg" | "xl";

const radii: Record<CardRadius, string> = {
  md: "rounded-xl",
  lg: "rounded-2xl",
  xl: "rounded-3xl",
};

// Core variants omit the radius class — it's controlled by the `radius` prop.
// Module-branded variants bake `rounded-3xl` into their class string for
// hero surfaces, matching the web component.
const variantContainer: Record<CardVariant, string> = {
  default: "bg-panel border border-line shadow-sm",
  interactive: "bg-panel border border-line shadow-sm",
  flat: "bg-panel border border-line",
  elevated: "bg-panel border border-line shadow-md",
  ghost: "bg-transparent border border-transparent",

  // Module hero cards — branded surface with full dark-mode support.
  finyk:
    "rounded-3xl border border-brand-200/50 bg-finyk-soft dark:bg-finyk-surface-dark/10 dark:border-finyk-border-dark/20",
  fizruk:
    "rounded-3xl border border-teal-200/50 bg-fizruk-soft dark:bg-fizruk-surface-dark/10 dark:border-fizruk-border-dark/20",
  routine:
    "rounded-3xl border border-coral-200/50 bg-routine-surface dark:bg-routine-surface-dark/10 dark:border-routine-border-dark/20",
  nutrition:
    "rounded-3xl border border-lime-200/50 bg-nutrition-soft dark:bg-nutrition-surface-dark/10 dark:border-nutrition-border-dark/20",

  // Soft module cards — less prominent tinted surface with dark mode.
  "finyk-soft":
    "rounded-2xl border border-brand-100 bg-brand-50/50 dark:bg-finyk-surface-dark/8 dark:border-finyk-border-dark/15",
  "fizruk-soft":
    "rounded-2xl border border-teal-100 bg-teal-50/50 dark:bg-fizruk-surface-dark/8 dark:border-fizruk-border-dark/15",
  "routine-soft":
    "rounded-2xl border border-coral-100 bg-coral-50/50 dark:bg-routine-surface-dark/8 dark:border-routine-border-dark/15",
  "nutrition-soft":
    "rounded-2xl border border-lime-100 bg-lime-50/50 dark:bg-nutrition-surface-dark/8 dark:border-nutrition-border-dark/15",
};

const paddings: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
  xl: "p-6",
};

const CORE_VARIANTS: ReadonlySet<CardVariant> = new Set<CardVariant>([
  "default",
  "interactive",
  "flat",
  "elevated",
  "ghost",
]);

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export interface CardProps extends Omit<ViewProps, "style"> {
  variant?: CardVariant;
  padding?: CardPadding;
  radius?: CardRadius;
  className?: string;
  children?: ReactNode;
  /** For interactive variant: callback when card is pressed */
  onPress?: () => void;
  /** Disable press interactions */
  disabled?: boolean;
}

/**
 * Animated wrapper for interactive cards with scale feedback.
 */
function AnimatedPressable({
  children,
  onPress,
  disabled,
  className,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
  style?: ViewProps["style"];
}) {
  const scaleValue = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleValue, {
      toValue: 0.98,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleValue, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
    >
      <Animated.View
        className={className}
        style={[style, { transform: [{ scale: scaleValue }] }]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

export const Card = forwardRef<RNView, CardProps>(function Card(
  {
    variant = "default",
    padding = "md",
    radius = "xl",
    className,
    children,
    onPress,
    disabled,
    ...props
  },
  ref,
) {
  // Module (branded) variants bake their own radius — match web behaviour.
  const radiusClass = CORE_VARIANTS.has(variant) ? radii[radius] : "";

  const cardClassName = cx(
    variantContainer[variant],
    radiusClass,
    paddings[padding],
    className,
  );

  // Use animated pressable wrapper for interactive variant with onPress
  if (variant === "interactive" && onPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        disabled={disabled}
        className={cardClassName}
      >
        {children}
      </AnimatedPressable>
    );
  }

  return (
    <View ref={ref} className={cardClassName} {...props}>
      {children}
    </View>
  );
});

export interface CardHeaderProps extends Omit<ViewProps, "style"> {
  className?: string;
  children?: ReactNode;
}

/**
 * CardHeader — Consistent header row for cards (title on the left,
 * optional action slot on the right).
 */
export function CardHeader({ className, children, ...props }: CardHeaderProps) {
  return (
    <View
      className={cx("flex-row items-center justify-between mb-4", className)}
      {...props}
    >
      {children}
    </View>
  );
}

export interface CardTitleProps extends Omit<TextProps, "style"> {
  className?: string;
  children?: ReactNode;
}

/**
 * CardTitle — Title text for cards. Mirrors the web `text-lg font-semibold`
 * treatment; colour resolves through the semantic `fg` token so it
 * automatically follows the active light/dark palette.
 */
export function CardTitle({ className, children, ...props }: CardTitleProps) {
  return (
    <Text className={cx("text-lg font-semibold text-fg", className)} {...props}>
      {children}
    </Text>
  );
}

export interface CardDescriptionProps extends Omit<TextProps, "style"> {
  className?: string;
  children?: ReactNode;
}

/**
 * CardDescription — Secondary text under the title.
 */
export function CardDescription({
  className,
  children,
  ...props
}: CardDescriptionProps) {
  return (
    <Text className={cx("text-sm text-fg-muted mt-1", className)} {...props}>
      {children}
    </Text>
  );
}

export interface CardContentProps extends Omit<ViewProps, "style"> {
  className?: string;
  children?: ReactNode;
}

/**
 * CardContent — Main content area.
 */
export function CardContent({
  className,
  children,
  ...props
}: CardContentProps) {
  return (
    <View className={cx(className)} {...props}>
      {children}
    </View>
  );
}

export interface CardFooterProps extends Omit<ViewProps, "style"> {
  className?: string;
  children?: ReactNode;
}

/**
 * CardFooter — Footer row for actions. Mirrors the web
 * `border-t border-line` divider through the shared semantic token.
 */
export function CardFooter({ className, children, ...props }: CardFooterProps) {
  return (
    <View
      className={cx(
        "flex-row items-center gap-3 mt-4 pt-4 border-t border-line",
        className,
      )}
      {...props}
    >
      {children}
    </View>
  );
}
