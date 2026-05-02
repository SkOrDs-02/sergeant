/**
 * Sergeant Design System — Tooltip (React Native)
 *
 * A lightweight tooltip component for contextual hints and explanations.
 * Shows on long-press with smooth animations and haptic feedback.
 *
 * Features:
 * - Long-press activation with haptic feedback
 * - Auto-positioning (above/below) based on screen position
 * - Spring-based entrance/exit animations
 * - Arrow pointer indicating trigger element
 * - Respects reduced motion preferences
 * - Auto-dismiss with configurable duration
 */

import * as Haptics from "expo-haptics";
import { Info } from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  LayoutChangeEvent,
  Modal,
  Pressable,
  Text,
  View,
  type ViewStyle,
} from "react-native";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export interface TooltipProps {
  /** Tooltip content */
  content: string | ReactNode;
  /** The element that triggers the tooltip */
  children: ReactNode;
  /** Position preference (will auto-adjust if not enough space) */
  position?: "top" | "bottom";
  /** Show delay in ms (default: 0 for long-press) */
  delay?: number;
  /** Auto-hide after ms (default: 3000, 0 = manual dismiss) */
  duration?: number;
  /** Disable the tooltip */
  disabled?: boolean;
  /** Max width of tooltip (default: 250) */
  maxWidth?: number;
  /** Custom container style */
  containerStyle?: ViewStyle;
  /** Show on tap instead of long-press (default: false) */
  tapToShow?: boolean;
}

export interface TooltipTriggerProps {
  /** Tooltip content */
  content: string | ReactNode;
  /** Icon color */
  color?: string;
  /** Icon size */
  size?: number;
  /** Additional classes */
  className?: string;
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
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

interface TriggerLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  pageX: number;
  pageY: number;
}

export function Tooltip({
  content,
  children,
  position = "top",
  delay = 0,
  duration = 3000,
  disabled = false,
  maxWidth = 250,
  containerStyle,
  tapToShow = false,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [triggerLayout, setTriggerLayout] = useState<TriggerLayout | null>(
    null,
  );
  const [tooltipHeight, setTooltipHeight] = useState(0);
  const [actualPosition, setActualPosition] = useState(position);

  const reduceMotion = useReduceMotion();
  const triggerRef = useRef<View>(null);

  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(reduceMotion ? 1 : 0.9)).current;
  const translateY = useRef(
    new Animated.Value(reduceMotion ? 0 : position === "top" ? 5 : -5),
  ).current;

  const showTooltip = useCallback(() => {
    if (disabled) return;

    // Measure trigger position
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setTriggerLayout({ x, y, width, height, pageX: x, pageY: y });

      // Determine actual position based on screen space
      const spaceAbove = y;
      const spaceBelow = SCREEN_HEIGHT - (y + height);
      const preferredPosition = position;

      if (preferredPosition === "top" && spaceAbove < 100) {
        setActualPosition("bottom");
      } else if (preferredPosition === "bottom" && spaceBelow < 100) {
        setActualPosition("top");
      } else {
        setActualPosition(preferredPosition);
      }

      setVisible(true);

      // Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      // Entrance animation
      if (!reduceMotion) {
        Animated.parallel([
          Animated.spring(opacity, {
            toValue: 1,
            useNativeDriver: true,
            damping: 20,
            stiffness: 150,
          }),
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
            damping: 15,
            stiffness: 150,
          }),
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 15,
            stiffness: 150,
          }),
        ]).start();
      } else {
        opacity.setValue(1);
        scale.setValue(1);
        translateY.setValue(0);
      }
    });
  }, [disabled, position, opacity, scale, translateY, reduceMotion]);

  const hideTooltip = useCallback(() => {
    if (!reduceMotion) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.9,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setVisible(false);
        // Reset for next show
        translateY.setValue(actualPosition === "top" ? 5 : -5);
      });
    } else {
      setVisible(false);
    }
  }, [opacity, scale, translateY, actualPosition, reduceMotion]);

  // Auto-dismiss
  useEffect(() => {
    if (!visible || duration === 0) return;
    const timer = setTimeout(hideTooltip, duration);
    return () => clearTimeout(timer);
  }, [visible, duration, hideTooltip]);

  const handleTooltipLayout = (event: LayoutChangeEvent) => {
    setTooltipHeight(event.nativeEvent.layout.height);
  };

  // Calculate tooltip position
  const getTooltipStyle = (): ViewStyle => {
    if (!triggerLayout) return {};

    const tooltipLeft = Math.max(
      16,
      Math.min(
        triggerLayout.pageX + triggerLayout.width / 2 - maxWidth / 2,
        Dimensions.get("window").width - maxWidth - 16,
      ),
    );

    const tooltipTop =
      actualPosition === "top"
        ? triggerLayout.pageY - tooltipHeight - 8
        : triggerLayout.pageY + triggerLayout.height + 8;

    return {
      position: "absolute",
      left: tooltipLeft,
      top: tooltipTop,
      maxWidth,
    };
  };

  // Calculate arrow position
  const getArrowStyle = (): ViewStyle => {
    if (!triggerLayout) return {};

    const arrowLeft =
      triggerLayout.pageX +
      triggerLayout.width / 2 -
      (getTooltipStyle().left as number) -
      6;

    return {
      position: "absolute",
      left: Math.max(12, Math.min(arrowLeft, maxWidth - 24)),
      ...(actualPosition === "top"
        ? { bottom: -6 }
        : { top: -6, transform: [{ rotate: "180deg" }] }),
    };
  };

  return (
    <>
      <Pressable
        ref={triggerRef}
        onPress={tapToShow ? showTooltip : undefined}
        onLongPress={tapToShow ? undefined : showTooltip}
        delayLongPress={tapToShow ? undefined : delay || 200}
        style={containerStyle}
        accessibilityRole="button"
        accessibilityHint={
          tapToShow
            ? "Натисніть для підказки"
            : "Натисніть і тримайте для підказки"
        }
      >
        {children}
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={hideTooltip}
        statusBarTranslucent
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={hideTooltip}
          accessibilityLabel="Закрити підказку"
        >
          <Animated.View
            onLayout={handleTooltipLayout}
            style={[
              getTooltipStyle(),
              {
                opacity,
                transform: [{ scale }, { translateY }],
              },
            ]}
          >
            {/* Tooltip body - inverted colors for contrast */}
            <View className="bg-cream-900 dark:bg-cream-100 rounded-xl px-4 py-3 shadow-lg">
              {typeof content === "string" ? (
                <Text className="text-cream-50 dark:text-cream-900 text-sm leading-relaxed">
                  {content}
                </Text>
              ) : (
                content
              )}
            </View>

            {/* Arrow */}
            <View
              style={getArrowStyle()}
              className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-cream-900 dark:border-t-cream-100"
            />
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

/**
 * TooltipTrigger — Info icon that shows tooltip on press
 * Useful for adding contextual help to form fields and settings
 */
export function TooltipTrigger({
  content,
  color = "#94a3b8",
  size = 18,
  className,
}: TooltipTriggerProps) {
  return (
    <Tooltip content={content} position="top">
      <View
        className={cx(
          "w-6 h-6 items-center justify-center rounded-full",
          className,
        )}
      >
        <Info size={size} color={color} strokeWidth={2} />
      </View>
    </Tooltip>
  );
}

/**
 * TooltipLabel — Label with integrated tooltip trigger
 */
export function TooltipLabel({
  label,
  tooltip,
  required = false,
  className,
}: {
  label: string;
  tooltip: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <View className={cx("flex-row items-center gap-1.5", className)}>
      <Text className="text-sm font-medium text-fg">
        {label}
        {required && <Text className="text-danger"> *</Text>}
      </Text>
      <TooltipTrigger content={tooltip} size={14} />
    </View>
  );
}
